import { Model } from 'mongoose';
import { AppError } from '../../../shared/errors/appError';
import { logger } from '../../../shared/utils/logger';
import DeveloperSyncLogModel, { IDeveloperSyncLog } from './syncLog.model';
import DeveloperCommitModel from '../commits/commit.model';
import DeveloperCommitFileModel from '../commits/commitFile.model';
import DeveloperPullRequestModel from '../pullRequests/pullRequest.model';
import DeveloperIssueModel from '../issues/issue.model';
import DeveloperReleaseModel from '../releases/release.model';
import { IDeveloperRepository } from '../repositories/repository.model';
import DeveloperRepositoryModel from '../repositories/repository.model';
import { RepositoryService } from '../repositories/repository.service';
import { ConnectionService } from '../connections/connection.service';
import {
  GitHubRepository,
  GitHubTokenConfig,
  getCommitDetail,
  getCommits,
  getIssues,
  getPullRequests,
  getReleases,
  getRepository
} from '../github/github.client';
import { DeveloperSyncSource, SyncRunResult } from '../developer.types';

type Query = Record<string, unknown>;

export interface SyncRunOutcome {
  isInitialSync: boolean;
  counts: SyncRunResult;
}

const EMPTY_COUNTS: SyncRunResult = { commits: 0, pullRequests: 0, issues: 0, releases: 0 };

/** Mongoose duplicate-key error. Used as a backstop behind the read-before-write checks. */
function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

function parseOwnerRepo(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split('/');
  if (!owner || !repo) throw AppError.badRequest(`Invalid repository fullName: ${fullName}`);
  return { owner, repo };
}

function toDate(value: string | undefined | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Single atomic write for PRs / issues / releases.
 *
 * A read-then-write (findOne + `set()`/`create()`) silently drops every update —
 * `set()` alone never persists — and races a concurrent webhook sync on the
 * unique (repositoryId, githubId) index. `findOneAndUpdate` with upsert is one
 * round trip and cannot lose an update. A concurrent identical upsert can still
 * surface E11000; that is the other writer's row winning, so we retry once as a
 * plain update and swallow a second collision.
 */
async function upsertGitHubEntity(
  model: Model<any>,
  repositoryId: string,
  userId: string,
  githubId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const filter = { repositoryId, githubId } as Query;
  const update = { $set: fields, $setOnInsert: { userId, githubId } } as Query;
  try {
    await model.findOneAndUpdate(filter, update, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    try {
      await model.updateOne(filter, { $set: fields } as Query).exec();
    } catch (retryError) {
      if (!isDuplicateKeyError(retryError)) throw retryError;
    }
  }
}

export class SyncService {
  constructor(
    private repositoryService: RepositoryService,
    private connectionService: ConnectionService
  ) {}

  /** User-triggered full sync. */
  async runManualSync(userId: string, repositoryId: string): Promise<SyncRunOutcome> {
    return this.runSync(userId, repositoryId, 'manual', 'manual');
  }

  /** Webhook/scheduled sync. Failures are recorded, then rethrown for the caller to isolate. */
  async runSyncForEvent(
    userId: string,
    repositoryId: string,
    eventType: string,
    source: DeveloperSyncSource
  ): Promise<SyncRunOutcome> {
    return this.runSync(userId, repositoryId, eventType, source);
  }

  async listSyncLogs(userId: string, repositoryId: string, limit: number): Promise<IDeveloperSyncLog[]> {
    await this.repositoryService.getById(userId, repositoryId);
    return DeveloperSyncLogModel.find({ userId, repositoryId } as Query)
      .sort({ startedAt: -1 })
      .limit(limit)
      .exec();
  }

  private async runSync(
    userId: string,
    repositoryId: string,
    eventType: string,
    source: DeveloperSyncSource
  ): Promise<SyncRunOutcome> {
    // Ownership first: an unauthenticated caller must not be able to make us
    // write a sync log against someone else's repository.
    const repo = await this.repositoryService.getById(userId, repositoryId);

    // Captured BEFORE any write: a repository that has never synced treats this
    // run's backlog as historical, so downstream phases can distinguish it.
    const isInitialSync = !repo.lastSyncedAt;

    const log = await DeveloperSyncLogModel.create({
      userId,
      repositoryId: repo._id.toString(),
      source,
      eventType,
      status: 'running',
      startedAt: new Date()
    });

    try {
      const token = await this.connectionService.getAccessToken(userId);
      const counts = await this.dispatch(eventType, repo, { token });
      await DeveloperSyncLogModel.updateOne(
        { _id: log._id } as Query,
        {
          $set: {
            status: 'completed',
            recordsProcessed: JSON.stringify(counts),
            completedAt: new Date()
          }
        }
      ).exec();
      return { isInitialSync, counts };
    } catch (error) {
      await this.markFailed(log._id.toString(), repo._id.toString(), error);
      throw error;
    }
  }

  private async markFailed(logId: string, repositoryId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : 'Unknown error';
    try {
      await DeveloperSyncLogModel.updateOne(
        { _id: logId } as Query,
        { $set: { status: 'failed', errorMessage: message.slice(0, 500), completedAt: new Date() } }
      ).exec();
    } catch (logError) {
      logger.error('[developer] failed to mark sync log failed', { error: String(logError) });
    }
    try {
      await DeveloperRepositoryModel.updateOne({ _id: repositoryId } as Query, { $set: { syncStatus: 'error' } }).exec();
    } catch (repoError) {
      // Best-effort: a DB failure here must not mask the original error.
      logger.error('[developer] failed to mark repository syncStatus error', { error: String(repoError) });
    }
  }

  /** Route the event type onto the right set of syncs. */
  private async dispatch(
    eventType: string,
    repo: IDeveloperRepository,
    config: GitHubTokenConfig
  ): Promise<SyncRunResult> {
    const counts: SyncRunResult = { ...EMPTY_COUNTS };
    const isFullSync = eventType === 'manual' || eventType === 'repo_sync';
    if (isFullSync) {
      await this.syncMetadata(repo, config);
      counts.commits = await this.syncCommits(repo, config);
      counts.pullRequests = await this.syncPullRequests(repo, config);
      counts.issues = await this.syncIssues(repo, config);
      counts.releases = await this.syncReleases(repo, config);
      // Only now is the repository genuinely up to date.
      await this.finalizeFullSync(repo);
    } else if (eventType === 'push' || eventType === 'commit_sync') {
      counts.commits = await this.syncCommits(repo, config);
    } else if (eventType === 'pull_request' || eventType === 'pr_sync') {
      counts.pullRequests = await this.syncPullRequests(repo, config);
    } else if (eventType === 'issues' || eventType === 'issue_sync') {
      counts.issues = await this.syncIssues(repo, config);
    } else if (eventType === 'release' || eventType === 'release_sync') {
      counts.releases = await this.syncReleases(repo, config);
    }
    return counts;
  }

  private async syncMetadata(repo: IDeveloperRepository, config: GitHubTokenConfig): Promise<void> {
    const { owner, repo: repoName } = parseOwnerRepo(repo.fullName);
    const { data } = await getRepository(config, owner, repoName);
    if (!data) throw AppError.providerError('GitHub repository not found or inaccessible');
    await this.applyMetadata(repo, data);
  }

  private async applyMetadata(repo: IDeveloperRepository, gh: GitHubRepository): Promise<void> {
    repo.set({
      name: gh.name,
      fullName: gh.full_name,
      description: gh.description ?? undefined,
      defaultBranch: gh.default_branch || 'main',
      isPrivate: gh.private,
      ownerAvatarUrl: gh.owner?.avatar_url,
      language: gh.language ?? undefined,
      starsCount: String(gh.stargazers_count ?? 0),
      forksCount: String(gh.forks_count ?? 0),
      openIssuesCount: String(gh.open_issues_count ?? 0),
      syncStatus: 'synced',
      metadata: { ...(repo.metadata || {}), owner_login: gh.owner?.login }
    });
    await repo.save();
  }

  /**
   * Incremental commit sync. `lastCommitSyncedAt` is the cursor, so the first
   * run imports the full history. Per-commit detail is fetched only for SHAs we
   * have not stored — that is where the diff data for later analysis comes from.
   */
  private async syncCommits(repo: IDeveloperRepository, config: GitHubTokenConfig): Promise<number> {
    const { owner, repo: repoName } = parseOwnerRepo(repo.fullName);
    const { data: ghCommits } = await getCommits(config, owner, repoName, {
      since: repo.lastCommitSyncedAt ? repo.lastCommitSyncedAt.toISOString() : undefined
    });
    if (!Array.isArray(ghCommits)) return 0;

    const repositoryId = repo._id.toString();
    const userId = repo.userId;
    let stored = 0;

    for (const c of ghCommits) {
      const existing = await DeveloperCommitModel.findOne({ repositoryId, sha: c.sha } as Query).exec();
      if (existing) continue;
      // The list endpoint omits stats/files; the detail endpoint has them.
      // A 404 detail (force-pushed commit) still yields a usable list-level row.
      const { data: detail } = await getCommitDetail(config, owner, repoName, c.sha);
      try {
        const commit = await DeveloperCommitModel.create({
          userId,
          repositoryId,
          sha: c.sha,
          message: c.commit?.message ?? '',
          authorName: c.commit?.author?.name,
          authorEmail: c.commit?.author?.email,
          authorAvatarUrl: c.author?.avatar_url,
          committedAt: new Date(c.commit?.author?.date ?? new Date().toISOString()),
          pushedAt: toDate(c.commit?.committer?.date),
          additions: detail?.stats?.additions ?? 0,
          deletions: detail?.stats?.deletions ?? 0,
          filesChanged: detail?.files?.length ?? 0,
          url: c.html_url,
          verified: c.verification?.verified ?? false
        });
        if (detail?.files?.length) {
          await DeveloperCommitFileModel.insertMany(
            detail.files.map((f) => ({
              userId,
              repositoryId,
              commitId: commit._id.toString(),
              filename: f.filename,
              status: f.status,
              additions: f.additions ?? 0,
              deletions: f.deletions ?? 0,
              changes: (f.additions ?? 0) + (f.deletions ?? 0),
              previousFilename: f.previous_filename ?? undefined
            }))
          );
        }
        stored++;
      } catch (error) {
        // A concurrent run already inserted this SHA. Skip it rather than
        // aborting the whole sync.
        if (!isDuplicateKeyError(error)) throw error;
      }
    }

    // Cursor advances to the newest commit we actually retrieved, never to
    // `new Date()`: a wall-clock cursor would skip every commit GitHub has not
    // indexed yet when `since` is honoured, losing that window permanently.
    // An empty page means nothing was retrieved, so the cursor must not move.
    const newestFetched = ghCommits.reduce<Date | null>((newest, c) => {
      const at = toDate(c.commit?.author?.date);
      if (!at) return newest;
      return !newest || at.getTime() > newest.getTime() ? at : newest;
    }, null);
    if (newestFetched && (!repo.lastCommitSyncedAt || newestFetched > repo.lastCommitSyncedAt)) {
      repo.set({ lastCommitSyncedAt: newestFetched });
      await repo.save();
    }
    return stored;
  }

  private async syncPullRequests(repo: IDeveloperRepository, config: GitHubTokenConfig): Promise<number> {
    const { owner, repo: repoName } = parseOwnerRepo(repo.fullName);
    const { data: ghPRs } = await getPullRequests(config, owner, repoName);
    if (!Array.isArray(ghPRs)) return 0;
    const repositoryId = repo._id.toString();
    let stored = 0;

    for (const pr of ghPRs) {
      const githubId = String(pr.id);
      const fields = {
        number: pr.number,
        title: pr.title,
        body: pr.body ?? undefined,
        state: pr.state,
        authorLogin: pr.user?.login,
        authorAvatarUrl: pr.user?.avatar_url,
        sourceBranch: pr.head?.ref,
        targetBranch: pr.base?.ref,
        labels: (pr.labels || []).map((l) => l.name),
        additions: pr.additions ?? 0,
        deletions: pr.deletions ?? 0,
        changedFiles: pr.changed_files ?? 0,
        commentsCount: pr.comments ?? 0,
        reviewCommentsCount: pr.review_comments ?? 0,
        merged: pr.merged ?? false,
        mergedAt: toDate(pr.merged_at),
        mergedByLogin: pr.merged_by?.login,
        closedAt: toDate(pr.closed_at),
        url: pr.html_url
      };
      await upsertGitHubEntity(DeveloperPullRequestModel, repositoryId, repo.userId, githubId, fields);
      stored++;
    }

    repo.set({ lastPrSyncedAt: new Date() });
    await repo.save();
    return stored;
  }

  private async syncIssues(repo: IDeveloperRepository, config: GitHubTokenConfig): Promise<number> {
    const { owner, repo: repoName } = parseOwnerRepo(repo.fullName);
    const { data: ghIssues } = await getIssues(config, owner, repoName);
    if (!Array.isArray(ghIssues)) return 0;
    const repositoryId = repo._id.toString();
    let stored = 0;

    for (const issue of ghIssues) {
      // GitHub returns pull requests through the issues endpoint too.
      if (issue.pull_request) continue;
      const githubId = String(issue.id);
      const fields = {
        number: issue.number,
        title: issue.title,
        body: issue.body ?? undefined,
        state: issue.state,
        authorLogin: issue.user?.login,
        authorAvatarUrl: issue.user?.avatar_url,
        labels: (issue.labels || []).map((l) => l.name),
        assignees: (issue.assignees || []).map((a) => a.login),
        milestone: issue.milestone?.title,
        commentsCount: issue.comments ?? 0,
        closedAt: toDate(issue.closed_at),
        url: issue.html_url
      };
      await upsertGitHubEntity(DeveloperIssueModel, repositoryId, repo.userId, githubId, fields);
      stored++;
    }
    return stored;
  }

  private async syncReleases(repo: IDeveloperRepository, config: GitHubTokenConfig): Promise<number> {
    const { owner, repo: repoName } = parseOwnerRepo(repo.fullName);
    const { data: ghReleases } = await getReleases(config, owner, repoName);
    if (!Array.isArray(ghReleases)) return 0;
    const repositoryId = repo._id.toString();
    let stored = 0;

    for (const release of ghReleases) {
      const githubId = String(release.id);
      const fields = {
        tagName: release.tag_name,
        name: release.name ?? undefined,
        body: release.body ?? undefined,
        authorLogin: release.author?.login,
        authorAvatarUrl: release.author?.avatar_url,
        isDraft: release.draft ?? false,
        isPrerelease: release.prerelease ?? false,
        assetsCount: release.assets?.length ?? 0,
        url: release.html_url,
        publishedAt: toDate(release.published_at)
      };
      await upsertGitHubEntity(DeveloperReleaseModel, repositoryId, repo.userId, githubId, fields);
      stored++;
    }
    return stored;
  }

  /** Last synced-at flip, run only after every data sync succeeded. */
  private async finalizeFullSync(repo: IDeveloperRepository): Promise<void> {
    repo.set({ syncStatus: 'synced', lastSyncedAt: new Date() });
    await repo.save();
  }
}

export default SyncService;

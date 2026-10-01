import { AppError } from '../../../shared/errors/appError';
import { ActivityRepository } from './activity.repository';
import { IDeveloperActivity } from './activity.model';
import { RepositoryService } from '../repositories/repository.service';
import DeveloperActivityModel from './activity.model';
import DeveloperCommitModel from '../commits/commit.model';
import DeveloperCommitFileModel from '../commits/commitFile.model';
import DeveloperPullRequestModel from '../pullRequests/pullRequest.model';
import DeveloperIssueModel from '../issues/issue.model';
import DeveloperReleaseModel from '../releases/release.model';
import {
  CommitRecord,
  PRRecord,
  groupCommitsIntoActivities,
  isVendorPath
} from '../intelligence/commit-analyzer';
import {
  FileChange,
  categorizeChange,
  detectModule
} from '../intelligence/diff-analyzer';
import { buildScoredActivityInput, scoreImportance } from '../intelligence/importance-scorer';
import { detectMilestone } from '../intelligence/milestone-detector';
import { DevStory, buildStory } from '../intelligence/story-builder';
import { analyzePullRequest } from '../intelligence/pr-analyzer';

type Query = Record<string, unknown>;

export interface ActivityListFilter {
  repositoryId?: string;
  importance?: string;
  limit?: number;
  offset?: number;
}

export interface ActivityListResult {
  items: IDeveloperActivity[];
  total: number;
  limit: number;
  offset: number;
}

export interface IntelligenceResult {
  activities: IDeveloperActivity[];
  stories: DevStory[];
  activityIds: string[];
  newActivityIds: string[];
}

/** GitHub squash/merge commits carry the PR number as a `(#156)` suffix. */
const PR_REF_RE = /\(#(\d+)\)/;

export class ActivityService {
  constructor(
    private activityRepository: ActivityRepository,
    private repositoryService: RepositoryService
  ) {}

  /**
   * Full intelligence run for one repository:
   * raw commits/PRs → grouped activities → classified → scored
   * → milestone detection → evidence-backed stories → persisted.
   *
   * Idempotent: activities are keyed by their evidence (`evidenceKey`), so a
   * second run over the same commits creates nothing and reports zero new ids.
   */
  async runIntelligenceForRepository(userId: string, repositoryId: string): Promise<IntelligenceResult> {
    // Ownership first — nothing below this line runs for a foreign repository.
    await this.repositoryService.getById(userId, repositoryId);
    const repoId = repositoryId;

    const [commits, prs, issues, releases] = await Promise.all([
      DeveloperCommitModel.find({ userId, repositoryId: repoId } as Query).sort({ committedAt: -1 }).exec(),
      DeveloperPullRequestModel.find({ userId, repositoryId: repoId } as Query).exec(),
      DeveloperIssueModel.find({ userId, repositoryId: repoId } as Query).exec(),
      DeveloperReleaseModel.find({ userId, repositoryId: repoId } as Query).exec()
    ]);

    const filesByCommitId = await this.loadFilesByCommitId(userId, repoId, commits.map((c) => c._id.toString()));

    // SHAs already claimed by a persisted activity. Grouping runs on the
    // uncovered remainder only: an orphan group that absorbed an already-stored
    // SHA would produce a different evidenceKey and a second activity covering
    // the same commits — double-counted in memory and in opportunities.
    const coveredShas = await this.coveredShas(repoId);
    const freshCommits = coveredShas.size > 0 ? commits.filter((c) => !coveredShas.has(c.sha)) : commits;

    // Map commits onto PRs through the merge-commit suffix.
    const prsByNumber = new Map(prs.map((p) => [p.number, p]));
    const prCommitShas = new Map<number, string[]>();
    for (const c of freshCommits) {
      const prMatch = c.message?.match(PR_REF_RE);
      if (!prMatch) continue;
      const prNum = parseInt(prMatch[1], 10);
      const list = prCommitShas.get(prNum) ?? [];
      if (c.sha) list.push(c.sha);
      prCommitShas.set(prNum, list);
    }

    const commitRecords: CommitRecord[] = freshCommits.map((c) => ({
      id: c._id.toString(),
      sha: c.sha,
      message: c.message ?? '',
      committedAt: c.committedAt,
      files: (filesByCommitId.get(c._id.toString()) ?? []).map((f) => ({
        filename: f.filename,
        additions: f.additions ?? 0,
        deletions: f.deletions ?? 0
      }))
    }));

    const prRecords: PRRecord[] = prs
      .filter((pr) => (prCommitShas.get(pr.number) ?? []).length > 0)
      .map((pr) => ({
        id: pr._id.toString(),
        number: pr.number,
        title: pr.title ?? `PR #${pr.number}`,
        sourceBranch: pr.sourceBranch ?? null,
        state: pr.state,
        commitShas: prCommitShas.get(pr.number) ?? [],
        // PR body issue links come from the same closing-verb rule the PR
        // analyzer uses; a title that says "fixes #12" is still a linked issue.
        issueNumbers: analyzePullRequest({
          title: pr.title ?? '',
          body: pr.body ?? null,
          number: pr.number,
          state: pr.state
        }).linkedIssueNumbers
      }));

    const grouped = groupCommitsIntoActivities(commitRecords, prRecords);

    const stories: DevStory[] = [];
    const activities: IDeveloperActivity[] = [];
    const activityIds: string[] = [];
    const newActivityIds: string[] = [];

    for (const activity of grouped) {
      // Vendor/generated churn (node_modules, dist, lockfiles…) must not
      // inflate scoring, evidence totals, or downstream content.
      const activityFiles = this.aggregateFiles(commitRecords, filesByCommitId, activity.commitShas);
      const messages = this.loadCommitMessages(commitRecords, activity.commitShas);

      const { categories, affectedAreas } = categorizeChange(
        activityFiles,
        messages[0] ?? activity.title
      );

      const scored = scoreImportance(
        buildScoredActivityInput({
          files: activityFiles,
          categories,
          commitCount: activity.commitShas.length,
          hasPR: !!activity.prNumber && prsByNumber.has(activity.prNumber),
          prNumber: activity.prNumber,
          issueCount: activity.issueNumbers.length,
          hasNewFiles: activityFiles.some((f) => f.status === 'added'),
          hasMergedPR: activity.prNumber ? prsByNumber.get(activity.prNumber)?.state === 'closed' : false,
          hasRelease: releases.length > 0,
          affectedModules: [...new Set(activityFiles.map((f) => detectModule(f.filename)))],
          message: messages[0]
        })
      );

      const milestone = detectMilestone({
        title: activity.title,
        importanceLevel: scored.level,
        importanceScore: scored.score,
        commitCount: activity.commitShas.length,
        filesChanged: activityFiles.length
      });

      const story = buildStory({
        title: activity.title,
        type: categories[0] ?? 'OTHER',
        importance: scored.level,
        importanceScore: scored.score,
        commitMessages: messages,
        commitShas: activity.commitShas,
        files: activity.files,
        totalAdditions: activityFiles.reduce((s, f) => s + f.additions, 0),
        totalDeletions: activityFiles.reduce((s, f) => s + f.deletions, 0),
        prNumbers: activity.prNumber ? [activity.prNumber] : [],
        issueNumbers: activity.issueNumbers,
        affectedAreas,
        milestone: milestone.detected ? { title: milestone.title!, reason: milestone.reason! } : undefined
      });

      if (activity.type === 'standalone_commit' && scored.level === 'TRIVIAL') {
        continue;
      }

      // Stable dedupe key: sorted SHAs, so re-running with the same commits
      // produces byte-identical keys.
      const evidenceKey = JSON.stringify([...activity.commitShas].sort());
      const existing = await this.activityRepository.findByEvidenceKey(repoId, evidenceKey);
      if (existing) continue;

      const commitIds = this.idsForShas(commitRecords, activity.commitShas);
      const prIds = activity.prNumber && prsByNumber.has(activity.prNumber)
        ? [prsByNumber.get(activity.prNumber)!._id.toString()]
        : [];
      const issueIds = activity.issueNumbers
        .map((num) => issues.find((i) => i.number === num)?._id.toString())
        .filter((id): id is string => !!id);

      const { activity: persisted, created } = await this.activityRepository.create({
        userId,
        repositoryId: repoId,
        title: story.title,
        type: story.type,
        importance: scored.level,
        importanceScore: scored.score,
        problem: story.problem,
        summary: story.changes.join('\n'),
        changes: story.changes,
        affectedAreas: story.affectedAreas,
        isMilestone: !!story.milestone,
        milestoneTitle: story.milestone?.title,
        linkedInWorthy: scored.linkedInWorthy,
        evidence: story.evidence,
        evidenceKey,
        confidence: story.confidence,
        detectedAt: new Date(),
        commitIds,
        prIds,
        issueIds
      });

      // A duplicate-key race means another run persisted it first: not new work.
      if (!created) continue;

      activities.push(persisted);
      stories.push(story);
      activityIds.push(persisted._id.toString());
      newActivityIds.push(persisted._id.toString());
    }

    return { activities, stories, activityIds, newActivityIds };
  }

  async list(userId: string, filter: ActivityListFilter): Promise<ActivityListResult> {
    const limit = filter.limit ?? 20;
    const offset = filter.offset ?? 0;
    // repositoryId is user-supplied: verify ownership before it reaches a query.
    if (filter.repositoryId) {
      await this.repositoryService.getById(userId, filter.repositoryId);
    }
    const [items, total] = await Promise.all([
      this.activityRepository.listByUser({ userId, ...filter, limit, offset }),
      this.activityRepository.countByUser(userId, filter.repositoryId)
    ]);
    return { items, total, limit, offset };
  }

  async getById(userId: string, activityId: string): Promise<IDeveloperActivity> {
    const activity = await this.activityRepository.findOwned(userId, activityId);
    if (!activity) throw AppError.notFound('Activity not found');
    return activity;
  }

  async findByIds(userId: string, activityIds: string[]): Promise<IDeveloperActivity[]> {
    return this.activityRepository.findByIds(userId, activityIds);
  }

  async listByRepository(userId: string, repositoryId: string): Promise<IDeveloperActivity[]> {
    return this.activityRepository.listByRepository(userId, repositoryId);
  }

  /**
   * Every commit SHA already claimed by a persisted activity in this
   * repository. Activities stored without evidence shas contribute nothing —
   * they simply cannot overlap.
   */
  private async coveredShas(repositoryId: string): Promise<Set<string>> {
    const activities = await DeveloperActivityModel.find({ repositoryId } as Query, {
      'evidence.commitShas': 1
    }).exec();
    const covered = new Set<string>();
    for (const a of activities) {
      const shas = (a.evidence as { commitShas?: unknown } | undefined)?.commitShas;
      if (!Array.isArray(shas)) continue;
      for (const sha of shas) if (typeof sha === 'string') covered.add(sha);
    }
    return covered;
  }

  private async loadFilesByCommitId(
    userId: string,
    repositoryId: string,
    commitIds: string[]
  ): Promise<Map<string, { filename: string; status: string; additions: number; deletions: number }[]>> {
    const files = commitIds.length > 0
      ? await DeveloperCommitFileModel.find({ userId, repositoryId, commitId: { $in: commitIds } } as Query).exec()
      : [];
    const grouped = new Map<string, { filename: string; status: string; additions: number; deletions: number }[]>();
    for (const f of files) {
      const list = grouped.get(f.commitId) ?? [];
      list.push({
        filename: f.filename,
        status: f.status ?? 'modified',
        additions: f.additions ?? 0,
        deletions: f.deletions ?? 0
      });
      grouped.set(f.commitId, list);
    }
    return grouped;
  }

  /** Per-filename additions/deletions summed across the activity's commits, vendor paths removed. */
  private aggregateFiles(
    commits: CommitRecord[],
    filesByCommitId: Map<string, { filename: string; status: string; additions: number; deletions: number }[]>,
    shas: string[]
  ): FileChange[] {
    const shaSet = new Set(shas);
    const byId = new Map(commits.map((c) => [c.sha, c.id]));
    const activityFiles: FileChange[] = [];
    for (const [sha, commitId] of byId) {
      if (!shaSet.has(sha)) continue;
      for (const f of filesByCommitId.get(commitId) ?? []) {
        if (isVendorPath(f.filename)) continue;
        const existing = activityFiles.find((af) => af.filename === f.filename);
        if (existing) {
          existing.additions += f.additions;
          existing.deletions += f.deletions;
        } else {
          activityFiles.push({
            filename: f.filename,
            status: (f.status as FileChange['status']) ?? 'modified',
            additions: f.additions,
            deletions: f.deletions
          });
        }
      }
    }
    return activityFiles;
  }

  private loadCommitMessages(commits: CommitRecord[], shas: string[]): string[] {
    const shaSet = new Set(shas);
    return commits.filter((c) => shaSet.has(c.sha)).map((c) => c.message);
  }

  private idsForShas(commits: CommitRecord[], shas: string[]): string[] {
    const shaSet = new Set(shas);
    return commits.filter((c) => shaSet.has(c.sha)).map((c) => c.id);
  }
}

export default ActivityService;

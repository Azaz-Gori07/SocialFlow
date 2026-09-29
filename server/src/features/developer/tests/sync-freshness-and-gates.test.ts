import { mongoose } from '../../../database/db';
import DeveloperRepositoryModel from '../repositories/repository.model';
import DeveloperCommitModel from '../commits/commit.model';
import DeveloperCommitFileModel from '../commits/commitFile.model';
import DeveloperPullRequestModel from '../pullRequests/pullRequest.model';
import DeveloperIssueModel from '../issues/issue.model';
import DeveloperReleaseModel from '../releases/release.model';
import DeveloperActivityModel from '../activities/activity.model';
import DeveloperMemoryModel from '../memory/memory.model';
import DeveloperMemoryHistoryModel from '../memory/memoryHistory.model';
import DeveloperOpportunityModel from '../opportunities/opportunity.model';
import DeveloperSyncLogModel from '../sync/syncLog.model';
import DeveloperSettingsModel from '../settings/settings.model';
import DeveloperConnectionModel from '../connections/connection.model';
import DraftModel from '../../draft/draft.model';
import { syncService, pipelineService } from '../developer.routes';
import { ConnectionRepository } from '../connections/connection.repository';

/**
 * Regressions for the sync freshness and pipeline gate fixes.
 *
 * Every outbound call is served by the fetch stub — no network, no credentials.
 * The connection row is written through the real repository so the token is
 * encrypted exactly as in production.
 */

const userId = 'user_fresh_1';
const realFetch = global.fetch;

const GH_REPOSITORY = {
  id: 1,
  name: 'r',
  full_name: 'o/r',
  private: false,
  description: 'test repo',
  default_branch: 'main',
  language: 'TypeScript',
  stargazers_count: 3,
  forks_count: 1,
  open_issues_count: 0,
  owner: { login: 'o', avatar_url: 'https://a/o', id: 9 },
  updated_at: '2026-09-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  pushed_at: '2026-09-01T10:40:00Z'
};

function ghCommit(sha: string, message: string, date: string) {
  return {
    sha,
    html_url: `https://x/${sha.slice(0, 7)}`,
    author: { login: 'd', avatar_url: 'https://a/d' },
    commit: {
      message,
      author: { name: 'D', email: 'd@x.c', date },
      committer: { name: 'D', email: 'd@x.c', date }
    }
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

interface StubPayloads {
  commits: Array<ReturnType<typeof ghCommit>>;
  pulls: unknown[];
  issues: unknown[];
  releases: unknown[];
}

/** No `link` header → githubFetchAll stops after page 1. */
function stubGitHub(payloads: StubPayloads): jest.Mock {
  const mock = jest.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes('/repos/o/r/commits/')) {
      const sha = url.split('/commits/')[1].split('?')[0];
      const commit = payloads.commits.find((c) => c.sha === sha);
      return jsonResponse({
        sha,
        stats: { additions: 650, deletions: 180, total: 830 },
        files: DETAIL_FILES
      });
    }
    if (url.includes('/repos/o/r/commits')) return jsonResponse(payloads.commits);
    if (url.includes('/repos/o/r/pulls')) return jsonResponse(payloads.pulls);
    if (url.includes('/repos/o/r/issues')) return jsonResponse(payloads.issues);
    if (url.includes('/repos/o/r/releases')) return jsonResponse(payloads.releases);
    if (url.includes('/repos/o/r')) return jsonResponse(GH_REPOSITORY);
    return new Response('unexpected', { status: 500 });
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

async function clearAll(): Promise<void> {
  await Promise.all([
    DeveloperRepositoryModel.deleteMany({}),
    DeveloperCommitModel.deleteMany({}),
    DeveloperCommitFileModel.deleteMany({}),
    DeveloperPullRequestModel.deleteMany({}),
    DeveloperIssueModel.deleteMany({}),
    DeveloperReleaseModel.deleteMany({}),
    DeveloperActivityModel.deleteMany({}),
    DeveloperMemoryModel.deleteMany({}),
    DeveloperMemoryHistoryModel.deleteMany({}),
    DeveloperOpportunityModel.deleteMany({}),
    DeveloperSyncLogModel.deleteMany({}),
    DeveloperSettingsModel.deleteMany({}),
    DeveloperConnectionModel.deleteMany({}),
    DraftModel.deleteMany({ userId })
  ]);
}

async function seedRepo(
  lastSyncedAt: Date | null,
  lastCommitSyncedAt: Date | null = null
): Promise<string> {
  const repo = await DeveloperRepositoryModel.create({
    userId,
    githubId: 'gh-fresh-1',
    name: 'r',
    fullName: 'o/r',
    defaultBranch: 'main',
    lastSyncedAt,
    lastCommitSyncedAt
  });
  return repo._id.toString();
}

/**
 * Files per commit detail response. Six filenames across six modules, so a
 * grouped activity clears the TRIVIAL storage gate — the gate is correct
 * behaviour and these tests are about grouping, not scoring.
 */
const DETAIL_FILES = [
  { filename: 'src/retry.ts', status: 'modified' },
  { filename: 'api/retry.routes.ts', status: 'modified' },
  { filename: 'db/retry.model.ts', status: 'modified' },
  { filename: 'web/retry.tsx', status: 'modified' },
  { filename: 'tests/retry.test.ts', status: 'modified' },
  { filename: 'docs/retry.md', status: 'modified' }
].map((f) => ({ ...f, additions: 100, deletions: 30, changes: 130 }));

beforeEach(async () => {
  // Re-checked per test: the central setup disconnects in its own afterAll,
  // which jest registers before this file's afterAll.
  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve) => mongoose.connection.once('open', resolve));
  }
  await clearAll();
  await new ConnectionRepository().upsert(userId, {
    accessToken: 'fake-token',
    providerUserId: '1',
    metadata: { login: 'o' }
  });
});

afterEach(async () => {
  global.fetch = realFetch;
});

describe('PR/issue freshness across syncs', () => {
  // Inside the describe on purpose: jest runs a file-level afterAll after the
  // central setup has already disconnected, so teardown there would throw.
  afterAll(async () => {
    global.fetch = realFetch;
    await clearAll();
  });

  it('persists a merged/closed state instead of leaving the stored row stale', async () => {
    const repositoryId = await seedRepo(null);
    const openPull = {
      id: 900,
      number: 7,
      title: 'feat: retry api',
      body: null,
      state: 'open',
      user: { login: 'd', avatar_url: 'https://a/d' },
      head: { ref: 'feat', label: 'd:feat' },
      base: { ref: 'main', label: 'o:main' },
      labels: [],
      additions: 10,
      deletions: 1,
      changed_files: 1,
      merged: false,
      merged_at: null,
      merged_by: null,
      closed_at: null,
      comments: 0,
      review_comments: 0,
      html_url: 'https://x/pr/7',
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z'
    };

    stubGitHub({ commits: [], pulls: [openPull], issues: [], releases: [] });
    await syncService.runManualSync(userId, repositoryId);

    const stored = await DeveloperPullRequestModel.findOne({ repositoryId }).exec();
    expect(stored).not.toBeNull();
    expect(stored!.state).toBe('open');
    expect(stored!.merged).toBe(false);

    // Second sync sees the PR merged. A read-then-`set()` (no save) would
    // leave the stored row 'open' forever.
    stubGitHub({
      commits: [],
      pulls: [{ ...openPull, state: 'closed', merged: true, merged_at: '2026-09-02T09:00:00Z' }],
      issues: [],
      releases: []
    });
    await syncService.runManualSync(userId, repositoryId);

    const updated = await DeveloperPullRequestModel.findOne({ repositoryId }).exec();
    expect(updated!.state).toBe('closed');
    expect(updated!.merged).toBe(true);
    expect(updated!.mergedAt).toBeInstanceOf(Date);
    expect(await DeveloperPullRequestModel.countDocuments({ repositoryId })).toBe(1);
  });

  it('persists an issue state change and never duplicates the row', async () => {
    const repositoryId = await seedRepo(null);
    const issue = {
      id: 800,
      number: 12,
      title: 'flaky login test',
      body: null,
      state: 'open',
      user: { login: 'd', avatar_url: 'https://a/d' },
      labels: [],
      assignees: [],
      milestone: null,
      comments: 0,
      closed_at: null,
      html_url: 'https://x/i/12',
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z'
    };

    stubGitHub({ commits: [], pulls: [], issues: [issue], releases: [] });
    await syncService.runManualSync(userId, repositoryId);
    expect((await DeveloperIssueModel.findOne({ repositoryId }).exec())!.state).toBe('open');

    stubGitHub({
      commits: [],
      pulls: [],
      issues: [{ ...issue, state: 'closed', closed_at: '2026-09-02T09:00:00Z' }],
      releases: []
    });
    await syncService.runManualSync(userId, repositoryId);

    const updated = await DeveloperIssueModel.findOne({ repositoryId }).exec();
    expect(updated!.state).toBe('closed');
    expect(await DeveloperIssueModel.countDocuments({ repositoryId })).toBe(1);
  });

  it('persists a release body and does not duplicate it', async () => {
    const repositoryId = await seedRepo(null);
    const release = {
      id: 700,
      tag_name: 'v1.0.0',
      name: 'First',
      body: 'initial',
      author: { login: 'd', avatar_url: 'https://a/d' },
      draft: false,
      prerelease: false,
      assets: [],
      html_url: 'https://x/r/1',
      published_at: '2026-09-01T00:00:00Z',
      created_at: '2026-09-01T00:00:00Z'
    };

    stubGitHub({ commits: [], pulls: [], issues: [], releases: [release] });
    await syncService.runManualSync(userId, repositoryId);

    stubGitHub({
      commits: [],
      pulls: [],
      issues: [],
      releases: [{ ...release, body: 'initial + fixes' }]
    });
    await syncService.runManualSync(userId, repositoryId);

    const updated = await DeveloperReleaseModel.findOne({ repositoryId }).exec();
    expect(updated!.body).toBe('initial + fixes');
    expect(await DeveloperReleaseModel.countDocuments({ repositoryId })).toBe(1);
  });
});

describe('Commit cursor', () => {
  it('advances to the newest fetched commit, never past the data', async () => {
    const repositoryId = await seedRepo(null);
    const oldest = ghCommit('1'.repeat(40), 'feat: a', '2026-09-01T10:00:00Z');
    const newest = ghCommit('2'.repeat(40), 'feat: b', '2026-09-01T10:30:00Z');

    stubGitHub({ commits: [newest, oldest], pulls: [], issues: [], releases: [] });
    await syncService.runManualSync(userId, repositoryId);

    const repo = await DeveloperRepositoryModel.findById(repositoryId).exec();
    // A wall-clock cursor would be ~now, silently skipping any commit GitHub
    // has not indexed yet under `since`.
    expect(repo!.lastCommitSyncedAt!.toISOString()).toBe('2026-09-01T10:30:00.000Z');
  });

  it('leaves the cursor untouched when nothing is fetched', async () => {
    const seeded = new Date('2026-08-01T00:00:00Z');
    const repositoryId = await seedRepo(seeded, seeded);

    stubGitHub({ commits: [], pulls: [], issues: [], releases: [] });
    await syncService.runManualSync(userId, repositoryId);

    const repo = await DeveloperRepositoryModel.findById(repositoryId).exec();
    expect(repo!.lastCommitSyncedAt!.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });
});

describe('detectOpportunities setting', () => {
  // Real detected work, not a hand-seeded activity: the pipeline only writes
  // memory for activities it detected itself in this run.
  const worthy = [
    ghCommit('6'.repeat(40), 'feat: retry api', '2026-09-01T10:00:00Z'),
    ghCommit('7'.repeat(40), 'fix: retry guard', '2026-09-01T10:20:00Z')
  ];

  it('gates detection off while memory still records the work', async () => {
    const repositoryId = await seedRepo(new Date('2026-08-01T00:00:00Z'));
    await DeveloperSettingsModel.create({ userId, detectOpportunities: false });

    stubGitHub({ commits: worthy, pulls: [], issues: [], releases: [] });
    await syncService.runManualSync(userId, repositoryId);

    const off = await pipelineService.runPipelineForRepository(userId, repositoryId);
    expect(off.newActivityIds.length).toBeGreaterThan(0);
    expect(off.newOpportunities).toBe(0);
    expect(await DeveloperOpportunityModel.countDocuments({ repositoryId })).toBe(0);

    // Memory is unaffected by the gate — the work is still recorded.
    expect(await DeveloperMemoryModel.countDocuments({ repositoryId })).toBeGreaterThan(0);

    // With detection back on, the NEXT piece of work is queued. Detection is
    // scoped to newly detected activities by design, so this needs a new commit
    // rather than a re-run over the already-detected one.
    await DeveloperSettingsModel.updateOne({ userId }, { $set: { detectOpportunities: true } }).exec();
    stubGitHub({
      commits: [...worthy, ghCommit('8'.repeat(40), 'feat: retry metrics', '2026-09-02T10:00:00Z')],
      pulls: [],
      issues: [],
      releases: []
    });
    await syncService.runManualSync(userId, repositoryId);

    const on = await pipelineService.runPipelineForRepository(userId, repositoryId);
    expect(on.newActivityIds.length).toBeGreaterThan(0);
    expect(on.newOpportunities).toBeGreaterThan(0);
    const opportunities = await DeveloperOpportunityModel.find({ repositoryId }).exec();
    for (const o of opportunities) expect(o.status).toBe('pending');
  });
});

describe('Orphan re-grouping never overlaps a stored activity', () => {
  it('keeps activity commit sets pairwise disjoint when new commits arrive', async () => {
    const repositoryId = await seedRepo(null);
    const first = ghCommit('3'.repeat(40), 'feat: retry api', '2026-09-01T10:00:00Z');
    const second = ghCommit('4'.repeat(40), 'fix: retry guard', '2026-09-01T10:20:00Z');

    stubGitHub({ commits: [first, second], pulls: [], issues: [], releases: [] });
    await syncService.runManualSync(userId, repositoryId);
    const runOne = await pipelineService.runPipelineForRepository(userId, repositoryId);
    expect(runOne.newActivityIds.length).toBeGreaterThan(0);

    // A new commit sharing a filename inside the 1h window: the orphan
    // grouper would absorb it, and with the old code also re-absorb the two
    // stored SHAs, producing a second activity over the same commits.
    const third = ghCommit('5'.repeat(40), 'perf: retry pool', '2026-09-01T10:40:00Z');
    stubGitHub({ commits: [first, second, third], pulls: [], issues: [], releases: [] });
    await syncService.runManualSync(userId, repositoryId);
    const runTwo = await pipelineService.runPipelineForRepository(userId, repositoryId);
    expect(runTwo.newActivityIds.length).toBeGreaterThan(0);

    const activities = await DeveloperActivityModel.find({ repositoryId }).exec();
    const seen = new Set<string>();
    for (const a of activities) {
      const shas = ((a.evidence as { commitShas?: string[] }).commitShas ?? []).slice().sort();
      expect(shas.length).toBeGreaterThan(0);
      for (const sha of shas) {
        expect(seen.has(sha)).toBe(false);
        seen.add(sha);
      }
    }
    // The new commit is covered, exactly once.
    expect(seen.has(third.sha)).toBe(true);
    expect(seen.has(first.sha)).toBe(true);
    expect(seen.has(second.sha)).toBe(true);
  });
});

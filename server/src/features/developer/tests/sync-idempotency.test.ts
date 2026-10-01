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
import { syncService, pipelineService, contentService, opportunityService } from '../developer.routes';
import { ConnectionRepository } from '../connections/connection.repository';

/**
 * Sync + pipeline idempotency over a fully stubbed GitHub API
 * (ported from DevFlow apps/api/tests/sync-idempotency.test.ts).
 *
 * Every outbound call is served by the fetch stub below — no network, no real
 * credentials. The connection row is written through the real repository so the
 * token is encrypted exactly as in production.
 */

const userId = 'user_sync_1';
const realFetch = global.fetch;

const GH_COMMITS = [
  { sha: 'a'.repeat(40), html_url: 'https://x/a', author: { login: 'd', avatar_url: 'https://a/d' }, commit: { message: 'feat: add retry api', author: { name: 'D', email: 'd@x.c', date: '2026-09-01T10:00:00Z' }, committer: { name: 'D', email: 'd@x.c', date: '2026-09-01T10:00:00Z' } } },
  { sha: 'b'.repeat(40), html_url: 'https://x/b', author: { login: 'd', avatar_url: 'https://a/d' }, commit: { message: 'fix: retry guard', author: { name: 'D', email: 'd@x.c', date: '2026-09-01T10:20:00Z' }, committer: { name: 'D', email: 'd@x.c', date: '2026-09-01T10:20:00Z' } } },
  { sha: 'c'.repeat(40), html_url: 'https://x/c', author: { login: 'd', avatar_url: 'https://a/d' }, commit: { message: 'refactor: retry backoff', author: { name: 'D', email: 'd@x.c', date: '2026-09-01T10:40:00Z' }, committer: { name: 'D', email: 'd@x.c', date: '2026-09-01T10:40:00Z' } } }
];

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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

/** No `link` header → githubFetchAll stops after page 1. */
function stubGitHub(): jest.Mock {
  const mock = jest.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes('/repos/o/r/commits/')) {
      const sha = url.split('/commits/')[1].split('?')[0];
      return jsonResponse({
        sha,
        stats: { additions: 120, deletions: 30, total: 150 },
        files: [{ filename: 'src/api.ts', status: 'modified', additions: 120, deletions: 30 }]
      });
    }
    if (url.includes('/repos/o/r/commits')) return jsonResponse(GH_COMMITS);
    if (url.includes('/repos/o/r/pulls')) return jsonResponse([]);
    if (url.includes('/repos/o/r/issues')) return jsonResponse([]);
    if (url.includes('/repos/o/r/releases')) return jsonResponse([]);
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

async function seedRepo(lastSyncedAt: Date | null): Promise<string> {
  const repo = await DeveloperRepositoryModel.create({
    userId,
    githubId: 'gh-sync-1',
    name: 'r',
    fullName: 'o/r',
    defaultBranch: 'main',
    lastSyncedAt
  });
  return repo._id.toString();
}

/**
 * A post-worthy activity inserted directly. The stubbed GitHub payload is small
 * enough to score LOW, which the storage gate correctly rejects — so the
 * baseline test seeds the worthy work explicitly (same approach as DevFlow's
 * `seedHighActivity`) instead of relying on the fixture clearing the gate.
 */
async function seedHighActivity(repositoryId: string, evidenceKey: string): Promise<void> {
  await DeveloperActivityModel.create({
    userId,
    repositoryId,
    title: 'Meaningful api work',
    type: 'FEATURE',
    importance: 'HIGH',
    importanceScore: 70,
    changes: ['feat: add retry api'],
    affectedAreas: ['src'],
    isMilestone: false,
    linkedInWorthy: true,
    evidence: {
      prNumbers: [],
      issueNumbers: [],
      commitShas: ['x'],
      commitCount: 3,
      fileCount: 2,
      totalAdditions: 300,
      totalDeletions: 40
    },
    evidenceKey,
    confidence: 90,
    detectedAt: new Date(),
    commitIds: [],
    prIds: [],
    issueIds: []
  });
}

beforeEach(async () => {
  // Re-checked per test: the central setup disconnects in its own afterAll,
  // which jest registers before this file's afterAll.
  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve) => mongoose.connection.once('open', resolve));
  }
  await clearAll();
  // Real repository → real encryption, so getAccessToken works end to end.
  await new ConnectionRepository().upsert(userId, {
    accessToken: 'fake-token',
    providerUserId: '1',
    metadata: { login: 'o' }
  });
});

afterEach(async () => {
  global.fetch = realFetch;
});

describe('Unseen-SHA sync idempotency', () => {
  // Inside the describe on purpose: jest runs a file-level afterAll after the
  // central setup has already disconnected, so teardown there would throw.
  afterAll(async () => {
    global.fetch = realFetch;
    await clearAll();
  });
  it('stores each SHA once across repeated syncs, and the pipeline adds no duplicate activities', async () => {
    stubGitHub();
    const repositoryId = await seedRepo(null);

    const first = await syncService.runManualSync(userId, repositoryId);
    expect(first.counts.commits).toBe(3);

    const second = await syncService.runManualSync(userId, repositoryId);
    expect(second.counts.commits).toBe(0);

    const commits = await DeveloperCommitModel.find({ repositoryId }).exec();
    expect(commits).toHaveLength(3);
    // Per-commit file detail was imported for the downstream diff analysis.
    const files = await DeveloperCommitFileModel.find({ repositoryId }).exec();
    expect(files).toHaveLength(3);

    const pipelineFirst = await pipelineService.runPipelineForRepository(userId, repositoryId);
    expect(pipelineFirst.newActivityIds.length).toBeGreaterThan(0);
    const activitiesAfterFirst = await DeveloperActivityModel.countDocuments({ repositoryId });

    const pipelineSecond = await pipelineService.runPipelineForRepository(userId, repositoryId);
    expect(pipelineSecond.newActivityIds).toHaveLength(0);
    expect(await DeveloperActivityModel.countDocuments({ repositoryId })).toBe(activitiesAfterFirst);
  });
});

describe('Initial-sync baseline (no flood)', () => {
  it('stores baseline opportunities but never generates a draft from them', async () => {
    stubGitHub();
    const repositoryId = await seedRepo(null);

    // Never-synced repository: the first run is a backlog, not news.
    const sync = await syncService.runManualSync(userId, repositoryId);
    expect(sync.isInitialSync).toBe(true);
    await seedHighActivity(repositoryId, JSON.stringify(['baseline-seed']));

    const detection = await opportunityService.detectAndStore(userId, repositoryId, { baseline: true });
    expect(detection.created).toBeGreaterThanOrEqual(1);
    const opportunities = await DeveloperOpportunityModel.find({ repositoryId }).exec();
    expect(opportunities).toHaveLength(detection.created);
    for (const opportunity of opportunities) {
      expect(opportunity.status).toBe('baseline');
    }

    // Auto generation is explicitly opted into: baseline rows still stay out.
    await DeveloperSettingsModel.create({
      userId,
      autoContent: true,
      generateDrafts: true,
      schedMaxPosts: 3
    });
    const auto = await contentService.runAutoGeneration(userId);
    expect(auto.generated).toBe(0);
    expect(auto.pending).toBe(0);
    expect(await DraftModel.countDocuments({ userId })).toBe(0);
  });

  it('stores the same work as pending once the repository has synced before', async () => {
    const repositoryId = await seedRepo(new Date('2026-08-01T00:00:00Z'));
    await seedHighActivity(repositoryId, JSON.stringify(['pending-seed']));

    const detection = await opportunityService.detectAndStore(userId, repositoryId);
    expect(detection.created).toBe(1);

    const opportunities = await DeveloperOpportunityModel.find({ repositoryId }).exec();
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0].status).toBe('pending');
  });
});

describe('Duplicate events never duplicate derived data', () => {
  it('leaves activity, opportunity and draft counts unchanged across two full cycles', async () => {
    stubGitHub();
    const repositoryId = await seedRepo(null);

    // First full cycle: baseline repo → sync then pipeline.
    await syncService.runManualSync(userId, repositoryId);
    await pipelineService.runPipelineForRepository(userId, repositoryId);

    const snapshot = {
      activities: await DeveloperActivityModel.countDocuments({ repositoryId }),
      opportunities: await DeveloperOpportunityModel.countDocuments({ repositoryId }),
      drafts: await DraftModel.countDocuments({ userId })
    };
    expect(snapshot.activities).toBeGreaterThan(0);

    // Second identical cycle: the repo is synced now, so detection is pending,
    // but nothing new may be created.
    await syncService.runManualSync(userId, repositoryId);
    await pipelineService.runPipelineForRepository(userId, repositoryId);

    expect(await DeveloperActivityModel.countDocuments({ repositoryId })).toBe(snapshot.activities);
    expect(await DeveloperOpportunityModel.countDocuments({ repositoryId })).toBe(snapshot.opportunities);
    expect(await DraftModel.countDocuments({ userId })).toBe(snapshot.drafts);
  });
});

import { mongoose } from '../../../database/db';
import DeveloperRepositoryModel from '../repositories/repository.model';
import DeveloperCommitModel from '../commits/commit.model';
import DeveloperCommitFileModel from '../commits/commitFile.model';
import DeveloperPullRequestModel from '../pullRequests/pullRequest.model';
import DeveloperActivityModel from '../activities/activity.model';
import DeveloperMemoryModel from '../memory/memory.model';
import DeveloperMemoryHistoryModel from '../memory/memoryHistory.model';
import DeveloperOpportunityModel from '../opportunities/opportunity.model';
import DeveloperSyncLogModel from '../sync/syncLog.model';
import DeveloperSettingsModel from '../settings/settings.model';
import DeveloperConnectionModel from '../connections/connection.model';
import { pipelineService } from '../developer.routes';

/**
 * Intelligence pipeline idempotency (ported from DevFlow apps/api/tests/intelligence.test.ts).
 *
 * The pipeline is driven through the real dependency graph exported by
 * developer.routes — no mocks — so what is asserted here is the composition
 * that runs in production, not a stubbed approximation of it.
 */

const userId = 'user_intelligence_1';
let repositoryId: string;

const COMMIT_DEFS = [
  { sha: 'a1'.repeat(20), message: 'feat: add signup flow (#156)', filename: 'src/auth/signup.ts', additions: 80, deletions: 0, status: 'added' },
  { sha: 'b2'.repeat(20), message: 'fix: validation bug (#156)', filename: 'src/auth/validation.ts', additions: 60, deletions: 15, status: 'modified' },
  { sha: 'c3'.repeat(20), message: 'test: cover signup (#156)', filename: 'src/auth/signup.test.ts', additions: 90, deletions: 0, status: 'added' }
];

async function clearDeveloperData(): Promise<void> {
  await Promise.all([
    DeveloperRepositoryModel.deleteMany({}),
    DeveloperCommitModel.deleteMany({}),
    DeveloperCommitFileModel.deleteMany({}),
    DeveloperPullRequestModel.deleteMany({}),
    DeveloperActivityModel.deleteMany({}),
    DeveloperMemoryModel.deleteMany({}),
    DeveloperMemoryHistoryModel.deleteMany({}),
    DeveloperOpportunityModel.deleteMany({}),
    DeveloperSyncLogModel.deleteMany({}),
    DeveloperSettingsModel.deleteMany({}),
    DeveloperConnectionModel.deleteMany({})
  ]);
}

async function seedRepositoryWithPullRequestGroup(): Promise<void> {
  const repo = await DeveloperRepositoryModel.create({
    userId,
    githubId: 'gh-intelligence-1',
    name: 'r',
    fullName: 'o/r',
    defaultBranch: 'main',
    lastSyncedAt: new Date()
  });
  repositoryId = repo._id.toString();

  const base = new Date('2026-08-01T10:00:00Z');
  for (let i = 0; i < COMMIT_DEFS.length; i++) {
    const def = COMMIT_DEFS[i];
    const commit = await DeveloperCommitModel.create({
      userId,
      repositoryId,
      sha: def.sha,
      message: def.message,
      authorName: 'Test Dev',
      committedAt: new Date(base.getTime() + i * 60_000),
      additions: def.additions,
      deletions: def.deletions,
      filesChanged: 1
    });
    // Each commit touches a real file so the pipeline has evidence to classify.
    await DeveloperCommitFileModel.create({
      userId,
      repositoryId,
      commitId: commit._id.toString(),
      filename: def.filename,
      status: def.status,
      additions: def.additions,
      deletions: def.deletions,
      changes: def.additions + def.deletions
    });
  }

  // PR #156 is what binds the three commits into one story.
  await DeveloperPullRequestModel.create({
    userId,
    repositoryId,
    githubId: 'pr-156',
    number: 156,
    title: 'Add signup flow and validation',
    body: 'Fixes #142 - signup flow validation unreliable',
    state: 'closed',
    sourceBranch: 'feature/signup',
    targetBranch: 'main',
    labels: [],
    additions: 230,
    deletions: 15,
    changedFiles: 3,
    merged: true,
    mergedAt: new Date(base.getTime() + 600_000)
  });
}

describe('Developer intelligence pipeline', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }
  });

  // Inside the describe on purpose: jest runs a file-level afterAll after the
  // central setup has already disconnected, so teardown there would throw.
  afterAll(async () => {
    await clearDeveloperData();
  });

  beforeEach(async () => {
    await clearDeveloperData();
    await seedRepositoryWithPullRequestGroup();
  });

  describe('Idempotency', () => {
    it('creates activities on the first run and nothing on the second', async () => {
      const first = await pipelineService.runPipelineForRepository(userId, repositoryId);
      expect(first.newActivityIds.length).toBeGreaterThan(0);

      const afterFirst = await DeveloperActivityModel.countDocuments({ repositoryId });

      const second = await pipelineService.runPipelineForRepository(userId, repositoryId);
      expect(second.newActivityIds).toHaveLength(0);

      const afterSecond = await DeveloperActivityModel.countDocuments({ repositoryId });
      expect(afterSecond).toBe(afterFirst);
    });
  });

  describe('PR-link grouping', () => {
    it('groups the three commits sharing PR #156 into exactly one activity', async () => {
      const result = await pipelineService.runPipelineForRepository(userId, repositoryId);

      const activities = await DeveloperActivityModel.find({ repositoryId }).exec();
      expect(activities).toHaveLength(1);
      expect(result.activities).toHaveLength(1);

      const evidence = activities[0].evidence as {
        prNumbers: number[];
        commitCount: number;
        commitShas: string[];
      };
      expect(evidence.commitCount).toBe(3);
      expect(evidence.prNumbers).toContain(156);
      expect(evidence.commitShas.sort()).toEqual(COMMIT_DEFS.map((c) => c.sha).sort());
    });
  });

  describe('Memory: inference is not fact', () => {
    it('writes memory only from evidence and never invents a percentage', async () => {
      const first = await pipelineService.runPipelineForRepository(userId, repositoryId);
      expect(first.memoryWritten).toBeGreaterThan(0);

      const entries = await DeveloperMemoryModel.find({ repositoryId }).exec();
      expect(entries.length).toBeGreaterThan(0);

      for (const entry of entries) {
        const evidence = (entry.evidence ?? {}) as Record<string, unknown>;
        expect(Object.keys(evidence).length).toBeGreaterThan(0);
        // Every entry is linked back to the activity it was derived from.
        expect(entry.sourceActivityId).toBeTruthy();
        expect(entry.value).not.toMatch(/\d+%/);
      }
    });

    it('does not create new memory rows on a repeat run', async () => {
      await pipelineService.runPipelineForRepository(userId, repositoryId);
      const count1 = await DeveloperMemoryModel.countDocuments({ repositoryId });

      const second = await pipelineService.runPipelineForRepository(userId, repositoryId);
      expect(second.memoryWritten).toBe(0);

      const count2 = await DeveloperMemoryModel.countDocuments({ repositoryId });
      expect(count2).toBe(count1);
    });
  });

  describe('Cross-module data relationships', () => {
    it('stores an evidenceKey that is set and stable across re-runs', async () => {
      await pipelineService.runPipelineForRepository(userId, repositoryId);

      const firstRead = await DeveloperActivityModel.findOne({ repositoryId }).exec();
      expect(firstRead?.evidenceKey).toBeTruthy();
      expect(JSON.parse(firstRead!.evidenceKey!)).toEqual(
        COMMIT_DEFS.map((c) => c.sha).sort()
      );

      await pipelineService.runPipelineForRepository(userId, repositoryId);

      const secondRead = await DeveloperActivityModel.findOne({ repositoryId }).exec();
      expect(secondRead!.evidenceKey).toBe(firstRead!.evidenceKey);
    });

    it('rejects a duplicate commit insert (unique repositoryId + sha)', async () => {
      await expect(
        DeveloperCommitModel.create({
          userId,
          repositoryId,
          sha: COMMIT_DEFS[0].sha,
          message: 'duplicate insert',
          committedAt: new Date()
        })
      ).rejects.toMatchObject({ code: 11000 });
    });
  });
});

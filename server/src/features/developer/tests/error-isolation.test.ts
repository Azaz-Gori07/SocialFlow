import crypto from 'crypto';
import { mongoose } from '../../../database/db';
import { env } from '../../../shared/config/env.config';
import DeveloperRepositoryModel from '../repositories/repository.model';
import DeveloperSyncLogModel from '../sync/syncLog.model';
import DeveloperActivityModel from '../activities/activity.model';
import DeveloperMemoryModel from '../memory/memory.model';
import DeveloperMemoryHistoryModel from '../memory/memoryHistory.model';
import DeveloperOpportunityModel from '../opportunities/opportunity.model';
import DeveloperSettingsModel from '../settings/settings.model';
import DeveloperConnectionModel from '../connections/connection.model';
import DraftModel from '../../draft/draft.model';
import { syncAndProcess } from '../jobs/syncOrchestrator';
import { runDeveloperSchedulerTick } from '../jobs/developer.scheduler';
import { handleGitHubWebhook } from '../github/github.webhook';
import { contentService } from '../developer.routes';
import { ConnectionRepository } from '../connections/connection.repository';

/**
 * Error isolation (test #21).
 *
 * The contract under test: a failure in one stage is recorded and contained, it
 * never takes down the caller. Stage 1 (sync) throws so the caller knows nothing
 * was imported; stages 2 and 3 are swallowed and reported. Webhooks answer 202
 * regardless. The scheduler tick never rejects.
 */

const userId = 'user_isolation_1';
const realFetch = global.fetch;
const realWebhookSecret = env.GITHUB_WEBHOOK_SECRET;

/** GitHub returns 500 → githubFetch throws GitHubApiError. */
function stubFailingGitHub(): jest.Mock {
  const mock = jest.fn(async () => new Response('upstream exploded', { status: 500 }));
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

async function clearData(): Promise<void> {
  await Promise.all([
    DeveloperRepositoryModel.deleteMany({}),
    DeveloperSyncLogModel.deleteMany({}),
    DeveloperActivityModel.deleteMany({}),
    DeveloperMemoryModel.deleteMany({}),
    DeveloperMemoryHistoryModel.deleteMany({}),
    DeveloperOpportunityModel.deleteMany({}),
    DeveloperSettingsModel.deleteMany({ userId }),
    DeveloperConnectionModel.deleteMany({}),
    DraftModel.deleteMany({ userId })
  ]);
}

async function seedRepo(lastSyncedAt: Date | null): Promise<string> {
  const repo = await DeveloperRepositoryModel.create({
    userId,
    githubId: 'gh-isolation-1',
    name: 'r',
    fullName: 'o/r',
    defaultBranch: 'main',
    lastSyncedAt
  });
  return repo._id.toString();
}

describe('Developer error isolation', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }
  });

  // Inside the describe on purpose: jest runs a file-level afterAll after the
  // central setup has already disconnected, so teardown there would throw.
  afterAll(async () => {
    global.fetch = realFetch;
    env.GITHUB_WEBHOOK_SECRET = realWebhookSecret;
    env.developerFlowEnabled = false;
    await clearData();
  });

  beforeEach(async () => {
    await clearData();
    await new ConnectionRepository().upsert(userId, {
      accessToken: 'fake-token',
      providerUserId: '1',
      metadata: { login: 'o' }
    });
  });

  afterEach(() => {
    global.fetch = realFetch;
    env.GITHUB_WEBHOOK_SECRET = realWebhookSecret;
  });

  describe('syncAndProcess stage 1 failure', () => {
    it('rejects, and records both a failed sync log and an error syncStatus', async () => {
      stubFailingGitHub();
      const repositoryId = await seedRepo(null);

      // Nothing was imported, so the caller must see the failure.
      await expect(syncAndProcess(userId, repositoryId, 'manual', 'manual')).rejects.toThrow();

      const logs = await DeveloperSyncLogModel.find({ repositoryId }).exec();
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe('failed');
      expect(logs[0].errorMessage).toBeTruthy();
      expect(logs[0].completedAt).toBeTruthy();

      const repo = await DeveloperRepositoryModel.findById(repositoryId).exec();
      expect(repo?.syncStatus).toBe('error');
    });

    it('does not write any derived rows when the sync failed', async () => {
      stubFailingGitHub();
      const repositoryId = await seedRepo(null);

      await expect(syncAndProcess(userId, repositoryId, 'manual', 'manual')).rejects.toThrow();

      expect(await DeveloperActivityModel.countDocuments({ repositoryId })).toBe(0);
      expect(await DeveloperMemoryModel.countDocuments({ repositoryId })).toBe(0);
      expect(await DeveloperOpportunityModel.countDocuments({ repositoryId })).toBe(0);
      expect(await DraftModel.countDocuments({ userId })).toBe(0);
    });
  });

  describe('GitHub webhook', () => {
    it('acknowledges a signed delivery even though the sync throws', async () => {
      stubFailingGitHub();
      env.GITHUB_WEBHOOK_SECRET = 'whsec-test';
      const repositoryId = await seedRepo(null);

      const rawBody = Buffer.from(
        JSON.stringify({ repository: { full_name: 'o/r' }, action: 'opened' }),
        'utf8'
      );
      const signature =
        'sha256=' + crypto.createHmac('sha256', 'whsec-test').update(rawBody).digest('hex');

      // Must resolve, not reject: GitHub disables the webhook on a non-2xx.
      const result = await handleGitHubWebhook(rawBody, {
        'x-github-event': 'push',
        'x-github-delivery': 'delivery-1',
        'x-hub-signature-256': signature
      });

      expect(result.accepted).toBe(true);
      expect(result.dispatched).toBe(1);
      expect(result.deliveryId).toBe('delivery-1');
    });

    it('rejects an invalid signature', async () => {
      stubFailingGitHub();
      env.GITHUB_WEBHOOK_SECRET = 'whsec-test';
      await seedRepo(null);

      const rawBody = Buffer.from(JSON.stringify({ repository: { full_name: 'o/r' } }), 'utf8');

      await expect(
        handleGitHubWebhook(rawBody, {
          'x-github-event': 'push',
          'x-hub-signature-256': 'sha256=' + '0'.repeat(64)
        })
      ).rejects.toThrow('Invalid webhook signature');
    });

    it('acknowledges an event that is not a sync trigger', async () => {
      env.GITHUB_WEBHOOK_SECRET = 'whsec-test';
      await seedRepo(null);

      const rawBody = Buffer.from(JSON.stringify({ repository: { full_name: 'o/r' } }), 'utf8');
      const signature =
        'sha256=' + crypto.createHmac('sha256', 'whsec-test').update(rawBody).digest('hex');

      const result = await handleGitHubWebhook(rawBody, {
        'x-github-event': 'star',
        'x-hub-signature-256': signature
      });

      expect(result.accepted).toBe(true);
      expect(result.dispatched).toBe(0);
      expect(result.message).toContain('Ignored event');
    });

    it('acknowledges a delivery for a repository nobody connected', async () => {
      env.GITHUB_WEBHOOK_SECRET = 'whsec-test';

      const rawBody = Buffer.from(
        JSON.stringify({ repository: { full_name: 'unknown/repo' } }),
        'utf8'
      );
      const signature =
        'sha256=' + crypto.createHmac('sha256', 'whsec-test').update(rawBody).digest('hex');

      const result = await handleGitHubWebhook(rawBody, {
        'x-github-event': 'push',
        'x-hub-signature-256': signature
      });

      expect(result.accepted).toBe(true);
      expect(result.dispatched).toBe(0);
    });

    it('refuses to process anything when no webhook secret is configured', async () => {
      env.GITHUB_WEBHOOK_SECRET = undefined;

      await expect(
        handleGitHubWebhook(Buffer.from('{}'), { 'x-github-event': 'push' })
      ).rejects.toThrow();
    });
  });

  describe('runAutoGeneration', () => {
    it('returns zeros and creates no drafts when the automation gate is off', async () => {
      await DeveloperSettingsModel.create({ userId, autoContent: false, generateDrafts: false });

      const result = await contentService.runAutoGeneration(userId);

      expect(result.generated).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.pending).toBe(0);
      expect(result.created).toEqual([]);
      expect(await DraftModel.countDocuments({ userId })).toBe(0);
    });

    it('returns zeros for a user with no settings row at all', async () => {
      const result = await contentService.runAutoGeneration(userId);

      expect(result.generated).toBe(0);
      expect(result.created).toEqual([]);
    });

    it('never rejects when the settings read fails', async () => {
      // A transient DB failure must degrade to defaults, not crash the caller.
      const original = DeveloperSettingsModel.findOne;
      try {
        // @ts-expect-error - deliberately breaking the model to simulate a DB fault
        DeveloperSettingsModel.findOne = () => ({ exec: () => Promise.reject(new Error('db down')) });

        await expect(contentService.runAutoGeneration(userId)).resolves.toBeTruthy();
      } finally {
        DeveloperSettingsModel.findOne = original;
      }
    });
  });

  describe('scheduler tick', () => {
    it('resolves without an unhandled rejection when a repository sync throws', async () => {
      stubFailingGitHub();
      env.developerFlowEnabled = true;
      // Stale enough to be picked up by the tick.
      await seedRepo(new Date(Date.now() - 60 * 60 * 1000));

      await expect(runDeveloperSchedulerTick()).resolves.toBeUndefined();

      // The failure is recorded rather than swallowed silently.
      const logs = await DeveloperSyncLogModel.find({ userId }).exec();
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe('failed');
    });

    it('is a no-op when the feature flag is off', async () => {
      env.developerFlowEnabled = false;
      await seedRepo(new Date(Date.now() - 60 * 60 * 1000));

      await expect(runDeveloperSchedulerTick()).resolves.toBeUndefined();
      expect(await DeveloperSyncLogModel.countDocuments({ userId })).toBe(0);
    });

    it('skips repositories that have never synced (the first sync is a user action)', async () => {
      env.developerFlowEnabled = true;
      await seedRepo(null);

      await expect(runDeveloperSchedulerTick()).resolves.toBeUndefined();
      expect(await DeveloperSyncLogModel.countDocuments({ userId })).toBe(0);
    });
  });
});

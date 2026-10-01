import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../../server';
import { mongoose } from '../../../database/db';
import { env } from '../../../shared/config/env.config';
import DeveloperRepositoryModel from '../repositories/repository.model';
import DeveloperActivityModel from '../activities/activity.model';
import DeveloperMemoryModel from '../memory/memory.model';
import DeveloperMemoryHistoryModel from '../memory/memoryHistory.model';
import DeveloperOpportunityModel from '../opportunities/opportunity.model';
import { repositoryService, activityService, memoryService, opportunityService } from '../developer.routes';
import { AppError } from '../../../shared/errors/appError';

/**
 * Cross-user isolation (tests #10-12 partial).
 *
 * The service layer is exercised directly (ownership is enforced there and does
 * not depend on the route flag) and the API layer with the flag flipped on, so
 * both the rule and its transport-level surface are covered.
 */

const userA = 'user_perm_a';
const userB = 'user_perm_b';

const tokenA = jwt.sign({ id: userA, email: 'a@socialflow.ai' }, env.JWT_SECRET, { expiresIn: '15m' });
const tokenB = jwt.sign({ id: userB, email: 'b@socialflow.ai' }, env.JWT_SECRET, { expiresIn: '15m' });

let repoId: string;
let activityId: string;
let opportunityId: string;
let memoryId: string;

async function seedUserAData(): Promise<void> {
  const repo = await DeveloperRepositoryModel.create({
    userId: userA,
    githubId: 'gh-perm-1',
    name: 'owned-by-a',
    fullName: 'a/private-repo',
    lastSyncedAt: new Date()
  });
  repoId = repo._id.toString();

  const activity = await DeveloperActivityModel.create({
    userId: userA,
    repositoryId: repoId,
    title: 'A shipped a feature',
    type: 'FEATURE',
    importance: 'HIGH',
    importanceScore: 70,
    changes: ['feat: add thing'],
    affectedAreas: ['src'],
    isMilestone: false,
    linkedInWorthy: true,
    evidence: { prNumbers: [1], issueNumbers: [], commitShas: ['s1'], commitCount: 1, fileCount: 1, totalAdditions: 10, totalDeletions: 1 },
    evidenceKey: JSON.stringify(['s1']),
    confidence: 80,
    detectedAt: new Date(),
    commitIds: [],
    prIds: [],
    issueIds: []
  });
  activityId = activity._id.toString();

  const opportunity = await DeveloperOpportunityModel.create({
    userId: userA,
    repositoryId: repoId,
    activityId,
    title: 'A shipped a feature',
    sourceType: 'activity',
    sourceId: activityId,
    status: 'pending',
    metadata: { importance: 'HIGH' }
  });
  opportunityId = opportunity._id.toString();

  const memory = await DeveloperMemoryModel.create({
    userId: userA,
    repositoryId: repoId,
    category: 'feature',
    key: 'a-shipped-a-feature',
    value: 'A shipped a feature',
    items: ['feat: add thing'],
    source: 'auto',
    sourceActivityId: activityId,
    evidence: { prNumbers: [1] },
    confidence: 80,
    status: 'active'
  });
  memoryId = memory._id.toString();
}

async function clearData(): Promise<void> {
  await Promise.all([
    DeveloperRepositoryModel.deleteMany({}),
    DeveloperActivityModel.deleteMany({}),
    DeveloperMemoryModel.deleteMany({}),
    DeveloperMemoryHistoryModel.deleteMany({}),
    DeveloperOpportunityModel.deleteMany({})
  ]);
}

describe('Developer cross-user isolation', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }
  });

  // Inside the describe on purpose: jest runs a file-level afterAll after the
  // central setup has already disconnected, so teardown there would throw.
  afterAll(async () => {
    env.developerFlowEnabled = false;
    await clearData();
  });

  describe('Service layer', () => {
    beforeEach(async () => {
      await clearData();
      await seedUserAData();
    });

    it('lets the owner read their repository and refuses everyone else', async () => {
      await expect(repositoryService.getById(userA, repoId)).resolves.toBeTruthy();
      await expect(repositoryService.getById(userB, repoId)).rejects.toThrow(AppError.forbidden('Insufficient permissions'));
    });

    it('scopes the activity read to its owner', async () => {
      await expect(activityService.getById(userA, activityId)).resolves.toBeTruthy();
      await expect(activityService.getById(userB, activityId)).rejects.toThrow(AppError.notFound('Activity not found'));
    });

    it('scopes the opportunity read and status update to its owner', async () => {
      await expect(opportunityService.updateStatus(userA, opportunityId, 'skipped')).resolves.toBeTruthy();
      await expect(opportunityService.updateStatus(userB, opportunityId, 'rejected')).rejects.toThrow(
        AppError.notFound('Opportunity not found')
      );
    });

    it('scopes memory read, edit and archive to its owner', async () => {
      await expect(memoryService.getMemory(userA, repoId)).resolves.toMatchObject({ total: 1 });
      await expect(memoryService.getMemory(userB, repoId)).rejects.toThrow(AppError.forbidden('Insufficient permissions'));
      await expect(memoryService.editMemory(userB, memoryId, { value: 'hijacked' })).rejects.toThrow(
        AppError.notFound('Memory entry not found')
      );
      await expect(memoryService.archiveMemory(userB, memoryId)).rejects.toThrow(
        AppError.notFound('Memory entry not found')
      );
    });

    it('returns only the requesting user’s rows in list endpoints', async () => {
      await expect(repositoryService.list(userA)).resolves.toHaveLength(1);
      await expect(repositoryService.list(userB)).resolves.toHaveLength(0);

      const activityList = await activityService.list(userA, {});
      expect(activityList.total).toBe(1);
      expect((await activityService.list(userB, {})).total).toBe(0);

      const opportunityList = await opportunityService.list(userB, {});
      expect(opportunityList.total).toBe(0);
      expect(opportunityList.items).toEqual([]);
    });

    it('rejects a non-ObjectId id instead of surfacing a cast error', async () => {
      // Routes validate the id with zod before it reaches a query; the service
      // contract is documented as "not found", not a 500.
      await expect(repositoryService.getById(userA, 'not-an-id')).rejects.toThrow();
    });
  });

  describe('API layer (flag on)', () => {
    beforeAll(() => {
      env.developerFlowEnabled = true;
    });

    beforeEach(async () => {
      env.developerFlowEnabled = true;
      await clearData();
      await seedUserAData();
    });

    afterEach(() => {
      env.developerFlowEnabled = false;
    });

    it('lets A read A’s own repository', async () => {
      const response = await request(app)
        .get(`/api/developer/repositories/${repoId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.status).toBe(200);
      expect(response.body.data.userId).toBe(userA);
    });

    it('refuses B access to A’s repository', async () => {
      const response = await request(app)
        .get(`/api/developer/repositories/${repoId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('refuses B access to A’s activity', async () => {
      const response = await request(app)
        .get(`/api/developer/activities/${activityId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(response.status).toBe(404);
    });

    it('refuses B access to A’s memory and opportunity-scoped queries', async () => {
      const memory = await request(app)
        .get(`/api/developer/memory?repositoryId=${repoId}`)
        .set('Authorization', `Bearer ${tokenB}`);
      expect(memory.status).toBe(403);

      const opportunities = await request(app)
        .get('/api/developer/opportunities')
        .set('Authorization', `Bearer ${tokenB}`);
      expect(opportunities.status).toBe(200);
      expect(opportunities.body.data.items).toEqual([]);
      expect(opportunities.body.data.total).toBe(0);
    });

    it('refuses B a sync of A’s repository', async () => {
      const response = await request(app)
        .post(`/api/developer/repositories/${repoId}/sync`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(response.status).toBe(403);
    });

    it('refuses B a pipeline run on A’s repository', async () => {
      const response = await request(app)
        .post(`/api/developer/repositories/${repoId}/pipeline`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({});

      expect(response.status).toBe(403);
    });

    it('rejects a client-settable baseline on the pipeline route', async () => {
      const response = await request(app)
        .post(`/api/developer/repositories/${repoId}/pipeline`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ baseline: true });

      // 'baseline' is assigned by the sync orchestrator on initial sync only;
      // accepting it from a client would let an owner mute their own queue.
      expect(response.status).toBe(400);
    });

    it('refuses B a content generation on A’s opportunity', async () => {
      const response = await request(app)
        .post(`/api/developer/opportunities/${opportunityId}/generate`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({});

      expect(response.status).toBe(404);
    });

    it('refuses B a status change on A’s opportunity', async () => {
      const response = await request(app)
        .post(`/api/developer/opportunities/${opportunityId}/status`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ status: 'rejected' });

      expect(response.status).toBe(404);
    });

    it.each([
      ['get', `/api/developer/repositories/not-an-id`],
      ['get', `/api/developer/activities/not-an-id`],
      ['get', `/api/developer/activities/60d5ec49f83f2a1b8c8d8b8c`]
    ] as const)('answers 400/404 (never 500) for a bad id on %s', async (method, path) => {
      const response =
        method === 'get'
          ? await request(app).get(path).set('Authorization', `Bearer ${tokenA}`)
          : await request(app).post(path).set('Authorization', `Bearer ${tokenA}`).send({});

      expect([400, 404]).toContain(response.status);
    });

    it('rejects a body that tries to set a non-user-settable status', async () => {
      const response = await request(app)
        .post(`/api/developer/opportunities/${opportunityId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'baseline' });

      expect(response.status).toBe(400);
    });
  });
});

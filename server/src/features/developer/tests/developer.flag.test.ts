import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../../server';
import { mongoose } from '../../../database/db';
import { env } from '../../../shared/config/env.config';
import DeveloperRepositoryModel from '../repositories/repository.model';
import DeveloperActivityModel from '../activities/activity.model';
import DeveloperOpportunityModel from '../opportunities/opportunity.model';
import DraftModel from '../../draft/draft.model';

/**
 * Feature-flag behaviour (test #22).
 *
 * Mechanism: `env` is a plain exported object, so the gate can be flipped at
 * runtime by assigning `env.developerFlowEnabled`. The gate middleware and
 * DeveloperService.getStatus both read it live, which is what makes the ON
 * cases testable in the same process.
 *
 * The GitHub webhook route is different on purpose: server.ts mounts it at
 * import time behind the same flag, so it can only be observed in the OFF state
 * (absent → 404). That is asserted below rather than simulated.
 */

const userId = 'user_flag_1';
const token = jwt.sign({ id: userId, email: 'flag@socialflow.ai' }, env.JWT_SECRET, { expiresIn: '15m' });

async function clearData(): Promise<void> {
  await Promise.all([
    DeveloperRepositoryModel.deleteMany({}),
    DeveloperActivityModel.deleteMany({}),
    DeveloperOpportunityModel.deleteMany({}),
    DraftModel.deleteMany({ userId })
  ]);
}

describe('Developer feature flag', () => {
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

  describe('Flag OFF (the default — jest.env.setup.js never sets the flag)', () => {
    beforeEach(() => {
      env.developerFlowEnabled = false;
    });

    it('reports itself as disabled on the public status endpoint', async () => {
      const response = await request(app).get('/api/developer/status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.enabled).toBe(false);
    });

    it.each([
      ['get', '/api/developer/overview'],
      ['get', '/api/developer/repositories'],
      ['get', '/api/developer/activities'],
      ['get', '/api/developer/opportunities'],
      ['get', '/api/developer/memory'],
      ['get', '/api/developer/sync-logs'],
      ['get', '/api/developer/settings/automation'],
      ['post', '/api/developer/content/auto-run'],
      ['post', '/api/developer/repositories/sync']
    ] as const)('404s %s %s', async (method, path) => {
      const response =
        method === 'get'
          ? await request(app).get(path).set('Authorization', `Bearer ${token}`)
          : await request(app).post(path).set('Authorization', `Bearer ${token}`).send({});

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('does not mount the GitHub webhook route at all', async () => {
      // server.ts only mounts it when the flag is on, so with the flag off the
      // path is indistinguishable from anything else that does not exist.
      const response = await request(app)
        .post('/api/webhooks/github')
        .set('x-github-event', 'push')
        .set('x-hub-signature-256', 'sha256=deadbeef')
        .send({});

      expect(response.status).toBe(404);
    });
  });

  describe('Flag ON', () => {
    beforeAll(async () => {
      env.developerFlowEnabled = true;
    });

    beforeEach(async () => {
      env.developerFlowEnabled = true;
      await clearData();
    });

    afterEach(() => {
      env.developerFlowEnabled = false;
    });

    it('reports itself as enabled', async () => {
      const response = await request(app).get('/api/developer/status');

      expect(response.status).toBe(200);
      expect(response.body.data.enabled).toBe(true);
    });

    it('rejects an unauthenticated request to the overview', async () => {
      const response = await request(app).get('/api/developer/overview');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('rejects a malformed token', async () => {
      const response = await request(app)
        .get('/api/developer/overview')
        .set('Authorization', 'Bearer not-a-real-token');

      expect(response.status).toBe(401);
    });

    it('serves the overview with a valid token and zero counts', async () => {
      const response = await request(app)
        .get('/api/developer/overview')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.enabled).toBe(true);
      expect(response.body.data.repositories).toBe(0);
      expect(response.body.data.activities).toBe(0);
      expect(response.body.data.opportunities).toBe(0);
    });

    it('serves the repository list with a valid token', async () => {
      const response = await request(app)
        .get('/api/developer/repositories')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.items).toEqual([]);
      expect(response.body.data.total).toBe(0);
    });
  });

  describe('Draft routes stay reachable regardless of the flag', () => {
    it('creates a draft with the flag off', async () => {
      env.developerFlowEnabled = false;

      const response = await request(app)
        .post('/api/drafts')
        .set('Authorization', `Bearer ${token}`)
        .send({ platform: 'linkedin', contentType: 'post', caption: 'A plain draft.' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.userId).toBe(userId);
    });
  });
});

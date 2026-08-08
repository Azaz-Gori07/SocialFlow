import request from 'supertest';
import app from '../../../server';
import { db, mongoose } from '../../../database/db';
import jwt from 'jsonwebtoken';
import { env } from '../../../shared/config/env.config';

/**
 * Integration tests for the social OAuth surface in a keyless test
 * environment. Without provider client credentials the API must behave
 * honestly: 503 on connect attempts (never a fake URL or account), 400 on
 * invalid state, and full CRUD for the account list.
 */
describe('SocialController Integration Tests', () => {
  let userToken: string;
  let userId: string;

  const testUser = {
    email: 'social_integration_test@socialflow.ai',
    password: 'password123',
    fullName: 'Social Integration User'
  };

  beforeAll(async () => {
    // Wait for DB connection
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => {
        mongoose.connection.once('open', resolve);
      });
    }

    // Clean up
    await db.users.deleteMany({ email: { $regex: /social_integration/i } });
    await db.socialAccounts.deleteMany({});

    // Register user (returns userId, generates JWT directly)
    const regResponse = await request(app).post('/api/auth/register').send(testUser);
    userId = regResponse.body.data.userId;
    userToken = jwt.sign({ id: userId, email: testUser.email }, env.JWT_SECRET, { expiresIn: '15m' });
  });

  afterAll(async () => {
    // Clean up
    await db.users.deleteMany({ email: { $regex: /social_integration/i } });
    await db.socialAccounts.deleteMany({});
  });

  describe('POST /api/social/connect/:platform', () => {
    it('should return 503 for a valid platform when provider credentials are not configured', async () => {
      const response = await request(app)
        .post('/api/social/connect/twitter')
        .set('Authorization', `Bearer ${userToken}`);

      // No Twitter client credentials in the test environment: the API must
      // not fabricate an authorization URL or mock account.
      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not configured for twitter');
    });

    it('should fail with 400 for invalid platform', async () => {
      const response = await request(app)
        .post('/api/social/connect/invalidplatform')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should fail with 401 when no token is provided', async () => {
      const response = await request(app).post('/api/social/connect/twitter');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/social/callback/:platform', () => {
    it('should redirect to the frontend with an error when the OAuth state is unknown', async () => {
      const response = await request(app)
        .get('/api/social/callback/twitter')
        .query({
          code: 'unknown_authorization_code',
          state: 'unknown_state'
        });

      // The one-time transaction store has no entry for this state, so the
      // callback fails and the browser is redirected with an error flag.
      expect(response.status).toBe(302);
      expect(response.header.location).toContain('/settings?connection=error');
    });

    it('should redirect with an error when code or state parameters are missing', async () => {
      const response = await request(app)
        .get('/api/social/callback/twitter')
        .query({ code: 'mock_code' });

      expect(response.status).toBe(302);
      expect(response.header.location).toContain('/settings?connection=error');
    });
  });

  describe('GET /api/social/accounts', () => {
    it('should return an empty list when no accounts are connected', async () => {
      const response = await request(app)
        .get('/api/social/accounts')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });

    it('should fail with 401 when no token is provided', async () => {
      const response = await request(app).get('/api/social/accounts');
      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/social/accounts/:id', () => {
    it('should fail with 404 when the account does not exist', async () => {
      const response = await request(app)
        .delete('/api/social/accounts/000000000000000000000000')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });
});

import request from 'supertest';
import app from '../../../server';
import { mongoose } from '../../../database/db';
import UserModel from '../../user/user.model';
import { WorkspaceModel, WorkspaceMemberModel } from '../workspace.model';
import jwt from 'jsonwebtoken';
import { env } from '../../../shared/config/env.config';

describe('WorkspaceController Integration Tests', () => {
  let ownerToken: string;
  let guestToken: string;
  let ownerId: string;
  let guestId: string;
  let workspaceId: string;

  const ownerUser = {
    email: 'ws_owner_integration@socialflow.ai',
    password: 'password123',
    fullName: 'Workspace Owner'
  };

  const guestUser = {
    email: 'ws_guest_integration@socialflow.ai',
    password: 'password123',
    fullName: 'Workspace Guest'
  };

  beforeAll(async () => {
    // Wait for DB connection
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => {
        mongoose.connection.once('open', resolve);
      });
    }

    // Clean up
    await UserModel.deleteMany({ email: { $regex: /_integration/i } });
    await WorkspaceModel.deleteMany({});
    await WorkspaceMemberModel.deleteMany({});

    // Register users (register creates user + workspace, sends OTP — extract userId, generate JWT directly)
    const ownerReg = await request(app).post('/api/auth/register').send(ownerUser);
    ownerId = ownerReg.body.data.userId;
    workspaceId = ownerReg.body.data.workspace.id;

    const guestReg = await request(app).post('/api/auth/register').send(guestUser);
    guestId = guestReg.body.data.userId;

    // Generate JWT tokens directly for testing workspace/comment flows (not auth)
    ownerToken = jwt.sign({ id: ownerId, email: ownerUser.email }, env.JWT_SECRET, { expiresIn: '15m' });
    guestToken = jwt.sign({ id: guestId, email: guestUser.email }, env.JWT_SECRET, { expiresIn: '15m' });
  });

  afterAll(async () => {
    // Clean up
    await UserModel.deleteMany({ email: { $regex: /_integration/i } });
    await WorkspaceModel.deleteMany({});
    await WorkspaceMemberModel.deleteMany({});
  });

  describe('POST /api/workspace', () => {
    it('should create a new workspace successfully', async () => {
      const response = await request(app)
        .post('/api/workspace')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Acme Corporate Workspace' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Acme Corporate Workspace');
      expect(response.body.data.role).toBe('owner');

      // Verify DB entry
      const dbWs = await WorkspaceModel.findById(response.body.data.id);
      expect(dbWs).toBeTruthy();
      expect(dbWs?.name).toBe('Acme Corporate Workspace');
    });

    it('should fail workspace creation if validation rules are violated', async () => {
      const response = await request(app)
        .post('/api/workspace')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: '' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/workspace/invite', () => {
    it('should allow owner to invite guest as viewer', async () => {
      const response = await request(app)
        .post('/api/workspace/invite')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          workspaceId: workspaceId,
          email: guestUser.email,
          role: 'viewer'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.role).toBe('viewer');
      expect(response.body.data.email).toBe(guestUser.email);
    });

    it('should deny permission if guest tries to invite someone (RBAC validation)', async () => {
      const response = await request(app)
        .post('/api/workspace/invite')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          workspaceId: workspaceId,
          email: 'another_user@socialflow.ai',
          role: 'viewer'
        });

      // Guest is not an owner or admin on this workspace
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Access denied');
    });
  });

  describe('GET /api/workspace/:workspaceId/members', () => {
    it('should allow members to view roster', async () => {
      const response = await request(app)
        .get(`/api/workspace/${workspaceId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2); // Owner + Guest
    });
  });

  describe('DELETE /api/workspace/:workspaceId/member', () => {
    it('should allow owner to remove member', async () => {
      const response = await request(app)
        .delete(`/api/workspace/${workspaceId}/member`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ userId: guestId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify removal
      const member = await WorkspaceMemberModel.findOne({ workspaceId, userId: guestId });
      expect(member).toBeNull();
    });
  });
});

import request from 'supertest';
import app from '../../../server';
import { mongoose } from '../../../database/db';
import UserModel from '../../user/user.model';
import { WorkspaceModel, WorkspaceMemberModel } from '../../workspace/workspace.model';
import SocialAccountModel from '../../social/social.model';
import CommentModel from '../comment.model';
import jwt from 'jsonwebtoken';
import { env } from '../../../shared/config/env.config';

describe('CommentController Integration Tests', () => {
  let ownerToken: string;
  let guestToken: string;
  let ownerId: string;
  let guestId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let testCommentId: string;

  const ownerUser = {
    email: 'comment_owner_integration@socialflow.ai',
    password: 'password123',
    fullName: 'Comment Owner'
  };

  const guestUser = {
    email: 'comment_guest_integration@socialflow.ai',
    password: 'password123',
    fullName: 'Comment Guest'
  };

  beforeAll(async () => {
    // Wait for DB connection
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => {
        mongoose.connection.once('open', resolve);
      });
    }

    // Clean up collections
    await UserModel.deleteMany({ email: { $regex: /comment_/i } });
    await WorkspaceModel.deleteMany({ name: { $regex: /Comment Workspace/i } });
    await WorkspaceMemberModel.deleteMany({});
    await SocialAccountModel.deleteMany({ accountId: 'tw_integration_123' });
    await CommentModel.deleteMany({ postId: 'post_integration_123' });

    // Register owner (creates user + workspace, sends OTP — extract userId, generate JWT directly)
    const ownerReg = await request(app).post('/api/auth/register').send(ownerUser);
    ownerId = ownerReg.body.data.userId;
    workspaceId = ownerReg.body.data.workspace.id;

    // Register guest (creates another workspace)
    const guestReg = await request(app).post('/api/auth/register').send(guestUser);
    guestId = guestReg.body.data.userId;
    otherWorkspaceId = guestReg.body.data.workspace.id;

    // Generate JWT tokens directly for testing comment flows (not auth)
    ownerToken = jwt.sign({ id: ownerId, email: ownerUser.email }, env.JWT_SECRET, { expiresIn: '15m' });
    guestToken = jwt.sign({ id: guestId, email: guestUser.email }, env.JWT_SECRET, { expiresIn: '15m' });

    // Link a social account for owner
    await SocialAccountModel.create({
      userId: ownerId,
      platform: 'twitter',
      accountId: 'tw_integration_123',
      username: 'test_user',
      displayName: 'Test User',
      accessToken: 'encrypted_token'
    });

    // Seed comment linked to that social account
    const comment = await CommentModel.create({
      platform: 'twitter',
      accountId: 'tw_integration_123',
      postId: 'post_integration_123',
      author: {
        username: 'fan_123',
        displayName: 'Fan 123'
      },
      message: 'I love this tool, is there a free trial?',
      status: 'unresolved',
      replies: [],
      createdAt: new Date().toISOString()
    });
    testCommentId = comment._id.toString();
  });

  afterAll(async () => {
    // Clean up
    await UserModel.deleteMany({ email: { $regex: /comment_/i } });
    await WorkspaceModel.deleteMany({ name: { $regex: /Comment Workspace/i } });
    await WorkspaceMemberModel.deleteMany({});
    await SocialAccountModel.deleteMany({ accountId: 'tw_integration_123' });
    await CommentModel.deleteMany({ postId: 'post_integration_123' });
  });

  describe('GET /api/comments', () => {
    it('should successfully retrieve comments for the workspace', async () => {
      const response = await request(app)
        .get('/api/comments')
        .query({ workspaceId })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].message).toBe('I love this tool, is there a free trial?');
    });

    it('should filter comments by status', async () => {
      const response = await request(app)
        .get('/api/comments')
        .query({ workspaceId, status: 'resolved' })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
    });

    it('should deny access if user is not a member of the workspace', async () => {
      const response = await request(app)
        .get('/api/comments')
        .query({ workspaceId: otherWorkspaceId }) // Owner requesting guest's workspace comments
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should fail validation if workspaceId is missing', async () => {
      const response = await request(app)
        .get('/api/comments')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/comments/reply', () => {
    it('should reply to a comment and mark it resolved', async () => {
      const response = await request(app)
        .post('/api/comments/reply')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          workspaceId,
          commentId: testCommentId,
          message: 'Yes! We have a completely free tier.'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('resolved');
      expect(response.body.data.replies).toHaveLength(1);
      expect(response.body.data.replies[0].message).toBe('Yes! We have a completely free tier.');
    });

    it('should fail if message is empty', async () => {
      const response = await request(app)
        .post('/api/comments/reply')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          workspaceId,
          commentId: testCommentId,
          message: ''
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/comments/resolve/:id', () => {
    it('should mark a comment status unresolved', async () => {
      const response = await request(app)
        .put(`/api/comments/resolve/${testCommentId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          workspaceId,
          status: 'unresolved'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('unresolved');
    });
  });

  describe('PUT /api/comments/assign/:id', () => {
    it('should fail assignment if assignee is not a member of the workspace', async () => {
      const response = await request(app)
        .put(`/api/comments/assign/${testCommentId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          workspaceId,
          assignedTo: guestId // Guest is not a member of Owner's workspace
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should assign a comment if assignee is added to workspace', async () => {
      // First invite guest to Owner's workspace
      await request(app)
        .post('/api/workspace/invite')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          workspaceId,
          email: guestUser.email,
          role: 'viewer'
        });

      const response = await request(app)
        .put(`/api/comments/assign/${testCommentId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          workspaceId,
          assignedTo: guestId
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.assignedTo).toBe(guestId);
    });
  });

  describe('POST /api/comments/ai-suggestions', () => {
    it('should return professional, friendly, and brand suggestion replies', async () => {
      const response = await request(app)
        .post('/api/comments/ai-suggestions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          workspaceId,
          commentId: testCommentId
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('professional');
      expect(response.body.data).toHaveProperty('friendly');
      expect(response.body.data).toHaveProperty('brand');
    });
  });
});

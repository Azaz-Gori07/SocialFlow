"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const server_1 = __importDefault(require("../../../server"));
const db_1 = require("../../../database/db");
describe('PostController Integration Tests', () => {
    let userToken;
    let userId;
    let postId;
    const testUser = {
        email: 'post_integration_test@socialflow.ai',
        password: 'password123',
        fullName: 'Post Integration User'
    };
    beforeAll(async () => {
        // Clean up
        await db_1.db.users.deleteMany({ email: { $regex: /post_integration/i } });
        await db_1.db.posts.deleteMany({});
        // Register user
        const regResponse = await (0, supertest_1.default)(server_1.default).post('/api/auth/register').send(testUser);
        userToken = regResponse.body.data.accessToken;
        userId = regResponse.body.data.user.id;
    });
    afterAll(async () => {
        // Clean up
        await db_1.db.users.deleteMany({ email: { $regex: /post_integration/i } });
        await db_1.db.posts.deleteMany({});
    });
    describe('POST /api/posts', () => {
        it('should create a draft post successfully', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .post('/api/posts')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                content: 'This is a test draft post!',
                platforms: ['twitter', 'linkedin'],
                status: 'draft'
            });
            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data.content).toBe('This is a test draft post!');
            expect(response.body.data.status).toBe('draft');
            expect(response.body.data.platforms).toEqual(['twitter', 'linkedin']);
            postId = response.body.data.id;
        });
        it('should fail creation if validation checks are violated', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .post('/api/posts')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                content: '', // invalid content
                platforms: [] // invalid platforms
            });
            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
        it('should fail scheduling if scheduledAt is in the past', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .post('/api/posts')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                content: 'A post from the past!',
                platforms: ['twitter'],
                status: 'scheduled',
                scheduledAt: new Date(Date.now() - 3600 * 1000).toISOString() // past hour
            });
            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('Validation Failed');
        });
    });
    describe('GET /api/posts/list', () => {
        it('should retrieve list of posts for the authenticated user', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .get('/api/posts/list')
                .set('Authorization', `Bearer ${userToken}`);
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.length).toBe(1);
            expect(response.body.data[0].id).toBe(postId);
        });
    });
    describe('GET /api/posts/:id', () => {
        it('should retrieve details of a single post', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .get(`/api/posts/${postId}`)
                .set('Authorization', `Bearer ${userToken}`);
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.id).toBe(postId);
        });
        it('should return 404 for nonexistent post', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .get('/api/posts/60d5ec49f83f2a1b8c8d8b8c')
                .set('Authorization', `Bearer ${userToken}`);
            expect(response.status).toBe(404);
        });
    });
    describe('PUT /api/posts/:id', () => {
        it('should update post content successfully', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .put(`/api/posts/${postId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                content: 'This is updated draft content!'
            });
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.content).toBe('This is updated draft content!');
            // Check DB update
            const dbPost = await db_1.db.posts.findById(postId);
            expect(dbPost?.content).toBe('This is updated draft content!');
        });
    });
    describe('DELETE /api/posts/:id', () => {
        it('should delete post successfully', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .delete(`/api/posts/${postId}`)
                .set('Authorization', `Bearer ${userToken}`);
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            // Verify deletion
            const dbPost = await db_1.db.posts.findById(postId);
            expect(dbPost).toBeNull();
        });
    });
});

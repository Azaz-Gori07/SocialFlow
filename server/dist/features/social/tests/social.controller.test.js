"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const server_1 = __importDefault(require("../../../server"));
const db_1 = require("../../../database/db");
describe('SocialController Integration Tests', () => {
    let userToken;
    let userId;
    let accountId;
    const testUser = {
        email: 'social_integration_test@socialflow.ai',
        password: 'password123',
        fullName: 'Social Integration User'
    };
    beforeAll(async () => {
        // Clean up
        await db_1.db.users.deleteMany({ email: { $regex: /social_integration/i } });
        await db_1.db.socialAccounts.deleteMany({});
        // Register user
        const regResponse = await (0, supertest_1.default)(server_1.default).post('/api/auth/register').send(testUser);
        userToken = regResponse.body.data.accessToken;
        userId = regResponse.body.data.user.id;
    });
    afterAll(async () => {
        // Clean up
        await db_1.db.users.deleteMany({ email: { $regex: /social_integration/i } });
        await db_1.db.socialAccounts.deleteMany({});
    });
    describe('GET /api/social/connect/:platform', () => {
        it('should generate authorization URL for valid platform', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .get('/api/social/connect/twitter')
                .set('Authorization', `Bearer ${userToken}`);
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            const url = response.body.data.url;
            expect(url.includes('https://twitter.com/i/oauth2/authorize') || url.includes('/callback/twitter')).toBe(true);
        });
        it('should fail with 400 for invalid platform', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .get('/api/social/connect/invalidplatform')
                .set('Authorization', `Bearer ${userToken}`);
            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
        it('should fail with 401 when no token is provided', async () => {
            const response = await (0, supertest_1.default)(server_1.default).get('/api/social/connect/twitter');
            expect(response.status).toBe(401);
        });
    });
    describe('GET /api/social/callback/:platform', () => {
        let stateParam;
        beforeEach(async () => {
            const connectResponse = await (0, supertest_1.default)(server_1.default)
                .get('/api/social/connect/twitter')
                .set('Authorization', `Bearer ${userToken}`);
            const authUrl = new URL(connectResponse.body.data.url);
            stateParam = authUrl.searchParams.get('state');
        });
        it('should handle OAuth redirect and redirect browser back to React SPA', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .get('/api/social/callback/twitter')
                .query({
                code: 'mock_authorization_code_x',
                state: stateParam
            });
            // Verification redirect landing target
            expect(response.status).toBe(302);
            expect(response.header.location).toContain('/settings?connection=success&platform=twitter');
            // Verify connection in database
            const accounts = await db_1.db.socialAccounts.find({ userId });
            expect(accounts.length).toBe(1);
            expect(accounts[0].platform).toBe('twitter');
            accountId = accounts[0]._id.toString();
        });
        it('should fail if code or state parameters are missing', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .get('/api/social/callback/twitter')
                .query({
                code: 'mock_code'
            });
            expect(response.status).toBe(302);
            expect(response.header.location).toContain('/settings?connection=error');
        });
    });
    describe('GET /api/social/accounts', () => {
        it('should retrieve list of user connected social accounts without exposing tokens', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .get('/api/social/accounts')
                .set('Authorization', `Bearer ${userToken}`);
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.length).toBe(1);
            const account = response.body.data[0];
            expect(account.id).toBe(accountId);
            expect(account.platform).toBe('twitter');
            // Crucial security check: sensitive tokens must not be exposed to clients
            expect(account).not.toHaveProperty('accessToken');
            expect(account).not.toHaveProperty('refreshToken');
        });
    });
    describe('DELETE /api/social/accounts/:id', () => {
        it('should disconnect social account successfully', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .delete(`/api/social/accounts/${accountId}`)
                .set('Authorization', `Bearer ${userToken}`);
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            // Verify removal
            const dbAccount = await db_1.db.socialAccounts.findById(accountId);
            expect(dbAccount).toBeNull();
        });
    });
});

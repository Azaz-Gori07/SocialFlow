"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const server_1 = __importDefault(require("../../../server"));
const db_1 = require("../../../database/db");
const user_model_1 = __importDefault(require("../../user/user.model"));
describe('AuthController Integration Tests', () => {
    const testUser = {
        email: 'integration_test@socialflow.ai',
        password: 'password123',
        fullName: 'Integration Test User'
    };
    beforeAll(async () => {
        // Wait for DB to be connected if needed
        if (db_1.mongoose.connection.readyState !== 1) {
            await new Promise((resolve) => {
                db_1.mongoose.connection.once('open', resolve);
            });
        }
    });
    afterAll(async () => {
        // Clear test records
        await user_model_1.default.deleteMany({ email: { $regex: /integration_test/i } });
    });
    beforeEach(async () => {
        // Clean up test records
        await user_model_1.default.deleteMany({ email: { $regex: /integration_test/i } });
    });
    describe('POST /api/auth/register', () => {
        it('should register a new user successfully and create default workspace', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .post('/api/auth/register')
                .send(testUser);
            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('accessToken');
            expect(response.body.data).toHaveProperty('refreshToken');
            expect(response.body.data.user.email).toBe(testUser.email.toLowerCase());
            expect(response.body.data.workspace.name).toBe(`${testUser.fullName}'s Workspace`);
            // Verify user is in database
            const dbUser = await user_model_1.default.findOne({ email: testUser.email.toLowerCase() });
            expect(dbUser).toBeTruthy();
            expect(dbUser?.fullName).toBe(testUser.fullName);
        });
        it('should fail registration if validation rules are violated', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .post('/api/auth/register')
                .send({
                email: 'invalid-email',
                password: '123',
                fullName: ''
            });
            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('Validation Failed');
        });
        it('should fail registration if email already exists', async () => {
            // First registration
            await (0, supertest_1.default)(server_1.default).post('/api/auth/register').send(testUser);
            // Second registration with same email
            const response = await (0, supertest_1.default)(server_1.default)
                .post('/api/auth/register')
                .send(testUser);
            expect(response.status).toBe(409);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('User with this email already exists');
        });
    });
    describe('POST /api/auth/login', () => {
        beforeEach(async () => {
            // Register a user for login testing
            await (0, supertest_1.default)(server_1.default).post('/api/auth/register').send(testUser);
        });
        it('should login successfully with correct credentials', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .post('/api/auth/login')
                .send({
                email: testUser.email,
                password: testUser.password
            });
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('accessToken');
            expect(response.body.data.user.email).toBe(testUser.email.toLowerCase());
        });
        it('should fail login with incorrect password', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .post('/api/auth/login')
                .send({
                email: testUser.email,
                password: 'wrongpassword'
            });
            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('Invalid email or password');
        });
    });
    describe('GET /api/auth/me', () => {
        let accessToken;
        beforeEach(async () => {
            const regResponse = await (0, supertest_1.default)(server_1.default).post('/api/auth/register').send(testUser);
            accessToken = regResponse.body.data.accessToken;
        });
        it('should retrieve current user details with valid token', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${accessToken}`);
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.email).toBe(testUser.email.toLowerCase());
        });
        it('should fail with 401 when no token is provided', async () => {
            const response = await (0, supertest_1.default)(server_1.default).get('/api/auth/me');
            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
        });
    });
});

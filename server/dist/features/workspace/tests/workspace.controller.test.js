"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const server_1 = __importDefault(require("../../../server"));
const db_1 = require("../../../database/db");
const user_model_1 = __importDefault(require("../../user/user.model"));
const workspace_model_1 = require("../workspace.model");
describe('WorkspaceController Integration Tests', () => {
    let ownerToken;
    let guestToken;
    let ownerId;
    let guestId;
    let workspaceId;
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
        if (db_1.mongoose.connection.readyState !== 1) {
            await new Promise((resolve) => {
                db_1.mongoose.connection.once('open', resolve);
            });
        }
        // Clean up
        await user_model_1.default.deleteMany({ email: { $regex: /_integration/i } });
        await workspace_model_1.WorkspaceModel.deleteMany({});
        await workspace_model_1.WorkspaceMemberModel.deleteMany({});
        // Register users
        const ownerReg = await (0, supertest_1.default)(server_1.default).post('/api/auth/register').send(ownerUser);
        ownerToken = ownerReg.body.data.accessToken;
        ownerId = ownerReg.body.data.user.id;
        workspaceId = ownerReg.body.data.workspace.id; // register automatically creates a workspace
        const guestReg = await (0, supertest_1.default)(server_1.default).post('/api/auth/register').send(guestUser);
        guestToken = guestReg.body.data.accessToken;
        guestId = guestReg.body.data.user.id;
    });
    afterAll(async () => {
        // Clean up
        await user_model_1.default.deleteMany({ email: { $regex: /_integration/i } });
        await workspace_model_1.WorkspaceModel.deleteMany({});
        await workspace_model_1.WorkspaceMemberModel.deleteMany({});
    });
    describe('POST /api/workspace', () => {
        it('should create a new workspace successfully', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .post('/api/workspace')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({ name: 'Acme Corporate Workspace' });
            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data.name).toBe('Acme Corporate Workspace');
            expect(response.body.data.role).toBe('owner');
            // Verify DB entry
            const dbWs = await workspace_model_1.WorkspaceModel.findById(response.body.data.id);
            expect(dbWs).toBeTruthy();
            expect(dbWs?.name).toBe('Acme Corporate Workspace');
        });
        it('should fail workspace creation if validation rules are violated', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .post('/api/workspace')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({ name: '' });
            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
    });
    describe('POST /api/workspace/invite', () => {
        it('should allow owner to invite guest as viewer', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
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
            const response = await (0, supertest_1.default)(server_1.default)
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
            const response = await (0, supertest_1.default)(server_1.default)
                .get(`/api/workspace/${workspaceId}/members`)
                .set('Authorization', `Bearer ${ownerToken}`);
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.length).toBeGreaterThanOrEqual(2); // Owner + Guest
        });
    });
    describe('DELETE /api/workspace/:workspaceId/member', () => {
        it('should allow owner to remove member', async () => {
            const response = await (0, supertest_1.default)(server_1.default)
                .delete(`/api/workspace/${workspaceId}/member`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({ userId: guestId });
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            // Verify removal
            const member = await workspace_model_1.WorkspaceMemberModel.findOne({ workspaceId, userId: guestId });
            expect(member).toBeNull();
        });
    });
});

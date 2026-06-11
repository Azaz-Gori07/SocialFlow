"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const workspace_service_1 = require("../workspace.service");
const workspace_repository_1 = require("../workspace.repository");
const user_repository_1 = require("../../user/user.repository");
const appError_1 = require("../../../shared/errors/appError");
jest.mock('../workspace.repository');
jest.mock('../../user/user.repository');
describe('WorkspaceService Unit Tests', () => {
    let workspaceService;
    let mockWorkspaceRepository;
    let mockUserRepository;
    const mockUser = { _id: 'user_owner', email: 'owner@socialflow.ai', fullName: 'Owner User' };
    const mockInviter = { _id: 'user_inviter', email: 'inviter@socialflow.ai', fullName: 'Inviter User' };
    const mockTarget = { _id: 'user_target', email: 'target@socialflow.ai', fullName: 'Target User' };
    const mockWorkspace = {
        _id: 'ws_123',
        name: 'Acme Workspace',
        ownerId: 'user_owner',
        createdAt: new Date(),
        updatedAt: new Date()
    };
    const mockMembership = {
        _id: 'mb_123',
        workspaceId: 'ws_123',
        userId: 'user_owner',
        role: 'owner',
        createdAt: new Date()
    };
    beforeEach(() => {
        mockWorkspaceRepository = new workspace_repository_1.WorkspaceRepository();
        mockUserRepository = new user_repository_1.UserRepository();
        workspaceService = new workspace_service_1.WorkspaceService(mockWorkspaceRepository, mockUserRepository);
        jest.clearAllMocks();
    });
    describe('createWorkspace', () => {
        it('should create workspace and add owner successfully', async () => {
            mockUserRepository.findById.mockResolvedValue(mockUser);
            mockWorkspaceRepository.createWorkspace.mockResolvedValue(mockWorkspace);
            mockWorkspaceRepository.addMember.mockResolvedValue(mockMembership);
            const result = await workspaceService.createWorkspace('Acme Workspace', 'user_owner');
            expect(mockUserRepository.findById).toHaveBeenCalledWith('user_owner');
            expect(mockWorkspaceRepository.createWorkspace).toHaveBeenCalledWith('Acme Workspace', 'user_owner');
            expect(mockWorkspaceRepository.addMember).toHaveBeenCalledWith(mockWorkspace._id, 'user_owner', 'owner');
            expect(result.name).toBe('Acme Workspace');
            expect(result.role).toBe('owner');
        });
        it('should throw AppError notFound if owner user does not exist', async () => {
            mockUserRepository.findById.mockResolvedValue(null);
            await expect(workspaceService.createWorkspace('Acme Workspace', 'nonexistent_user')).rejects.toThrow(new appError_1.AppError('Owner user profile not found', 404));
        });
    });
    describe('inviteMember', () => {
        it('should invite a user successfully if caller is owner', async () => {
            mockWorkspaceRepository.findWorkspaceById.mockResolvedValue(mockWorkspace);
            mockWorkspaceRepository.findMember.mockResolvedValueOnce({ role: 'owner' }).mockResolvedValueOnce(null);
            mockUserRepository.findByEmail.mockResolvedValue(mockTarget);
            mockWorkspaceRepository.addMember.mockResolvedValue({ role: 'editor', createdAt: new Date() });
            const result = await workspaceService.inviteMember({
                workspaceId: 'ws_123',
                email: 'target@socialflow.ai',
                role: 'editor'
            }, 'user_owner');
            expect(mockWorkspaceRepository.addMember).toHaveBeenCalledWith('ws_123', 'user_target', 'editor');
            expect(result.email).toBe('target@socialflow.ai');
            expect(result.role).toBe('editor');
        });
        it('should throw forbidden if caller is not owner or admin', async () => {
            mockWorkspaceRepository.findWorkspaceById.mockResolvedValue(mockWorkspace);
            mockWorkspaceRepository.findMember.mockResolvedValue({ role: 'viewer' });
            await expect(workspaceService.inviteMember({
                workspaceId: 'ws_123',
                email: 'target@socialflow.ai',
                role: 'editor'
            }, 'user_viewer')).rejects.toThrow(new appError_1.AppError('Only workspace Owners or Admins can invite team members', 403));
        });
        it('should throw conflict if user is already a member', async () => {
            mockWorkspaceRepository.findWorkspaceById.mockResolvedValue(mockWorkspace);
            mockWorkspaceRepository.findMember.mockResolvedValueOnce({ role: 'owner' }); // caller check
            mockUserRepository.findByEmail.mockResolvedValue(mockTarget);
            mockWorkspaceRepository.findMember.mockResolvedValueOnce({ role: 'editor' }); // existing member check
            await expect(workspaceService.inviteMember({
                workspaceId: 'ws_123',
                email: 'target@socialflow.ai',
                role: 'editor'
            }, 'user_owner')).rejects.toThrow(new appError_1.AppError('User is already a member of this workspace', 409));
        });
    });
});

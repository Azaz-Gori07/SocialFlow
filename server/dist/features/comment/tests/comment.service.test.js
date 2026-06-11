"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const comment_service_1 = require("../comment.service");
const comment_repository_1 = require("../comment.repository");
const workspace_repository_1 = require("../../workspace/workspace.repository");
const social_repository_1 = require("../../social/social.repository");
const user_repository_1 = require("../../user/user.repository");
const appError_1 = require("../../../shared/errors/appError");
jest.mock('../comment.repository');
jest.mock('../../workspace/workspace.repository');
jest.mock('../../social/social.repository');
jest.mock('../../user/user.repository');
// Mock mongoose for activity logging/notifications
jest.mock('mongoose', () => {
    const actualMongoose = jest.requireActual('mongoose');
    const mockSave = jest.fn().mockResolvedValue({});
    const mockActivityLog = jest.fn().mockImplementation(() => ({
        save: mockSave
    }));
    const mockNotification = jest.fn().mockImplementation(() => ({
        save: mockSave
    }));
    return {
        ...actualMongoose,
        models: {
            ActivityLog: mockActivityLog,
            Notification: mockNotification
        },
        model: jest.fn((name) => {
            if (name === 'ActivityLog')
                return mockActivityLog;
            if (name === 'Notification')
                return mockNotification;
            return actualMongoose.model(name);
        })
    };
});
describe('CommentService Unit Tests', () => {
    let commentService;
    let mockCommentRepository;
    let mockWorkspaceRepository;
    let mockSocialRepository;
    let mockUserRepository;
    const mockUser = { _id: 'user_123', email: 'teammate@socialflow.ai', fullName: 'Teammate User', avatarUrl: 'avatar.png' };
    const mockTeammate = { _id: 'user_456', email: 'other@socialflow.ai', fullName: 'Other User' };
    const mockWorkspaceMember = { workspaceId: 'ws_123', userId: 'user_123', role: 'editor' };
    const mockWorkspaceTeammate = { workspaceId: 'ws_123', userId: 'user_456', role: 'viewer' };
    const mockSocialAccount = {
        _id: 'sa_123',
        userId: 'user_123',
        platform: 'twitter',
        accountId: 'tw_acc_123',
        username: 'test_handle',
        displayName: 'Test Handle',
        accessToken: 'encrypted'
    };
    const mockComment = {
        _id: 'c_123',
        platform: 'twitter',
        accountId: 'tw_acc_123',
        postId: 'post_123',
        author: { username: 'commenter_1' },
        message: 'Is there a free trial?',
        status: 'unresolved',
        replies: [],
        createdAt: new Date().toISOString()
    };
    beforeEach(() => {
        mockCommentRepository = new comment_repository_1.CommentRepository();
        mockWorkspaceRepository = new workspace_repository_1.WorkspaceRepository();
        mockSocialRepository = new social_repository_1.SocialRepository();
        mockUserRepository = new user_repository_1.UserRepository();
        commentService = new comment_service_1.CommentService(mockCommentRepository, mockWorkspaceRepository, mockSocialRepository, mockUserRepository);
        jest.clearAllMocks();
    });
    describe('listComments', () => {
        it('should successfully list comments for accounts linked to a workspace', async () => {
            mockWorkspaceRepository.findMember.mockResolvedValue(mockWorkspaceMember);
            mockWorkspaceRepository.listMembers.mockResolvedValue([mockWorkspaceMember, mockWorkspaceTeammate]);
            mockSocialRepository.findAccountsByUserId.mockImplementation(async (userId) => {
                if (userId === 'user_123')
                    return [mockSocialAccount];
                return [];
            });
            mockCommentRepository.findCommentsByAccountIds.mockResolvedValue([mockComment]);
            const result = await commentService.listComments('ws_123', 'user_123', { status: 'unresolved' });
            expect(mockWorkspaceRepository.findMember).toHaveBeenCalledWith('ws_123', 'user_123');
            expect(mockSocialRepository.findAccountsByUserId).toHaveBeenCalledWith('user_123');
            expect(mockCommentRepository.findCommentsByAccountIds).toHaveBeenCalledWith(['tw_acc_123'], { status: 'unresolved' });
            expect(result).toHaveLength(1);
            expect(result[0]._id).toBe('c_123');
        });
        it('should throw AppError forbidden if caller is not a member of the workspace', async () => {
            mockWorkspaceRepository.findMember.mockResolvedValue(null);
            await expect(commentService.listComments('ws_123', 'user_non_member', {})).rejects.toThrow(new appError_1.AppError('Unauthorized access to workspace data', 403));
        });
        it('should return empty list if no social accounts are connected by members of the workspace', async () => {
            mockWorkspaceRepository.findMember.mockResolvedValue(mockWorkspaceMember);
            mockWorkspaceRepository.listMembers.mockResolvedValue([mockWorkspaceMember]);
            mockSocialRepository.findAccountsByUserId.mockResolvedValue([]);
            const result = await commentService.listComments('ws_123', 'user_123', {});
            expect(result).toEqual([]);
            expect(mockCommentRepository.findCommentsByAccountIds).not.toHaveBeenCalled();
        });
    });
    describe('replyToComment', () => {
        it('should push a reply, auto-resolve comment, and log activity', async () => {
            mockWorkspaceRepository.findMember.mockResolvedValue(mockWorkspaceMember);
            mockCommentRepository.findCommentById.mockResolvedValue(mockComment);
            mockWorkspaceRepository.listMembers.mockResolvedValue([mockWorkspaceMember]);
            mockSocialRepository.findAccountsByUserId.mockResolvedValue([mockSocialAccount]);
            mockUserRepository.findById.mockResolvedValue(mockUser);
            const mockUpdatedComment = { ...mockComment, status: 'resolved', replies: [{ message: 'Test Reply' }] };
            mockCommentRepository.pushReply.mockResolvedValue(mockUpdatedComment);
            const result = await commentService.replyToComment('c_123', 'Test Reply', 'ws_123', 'user_123');
            expect(mockCommentRepository.pushReply).toHaveBeenCalledWith('c_123', expect.objectContaining({
                message: 'Test Reply',
                author: expect.objectContaining({
                    username: 'teammate',
                    displayName: 'Teammate User',
                    isSystemUser: true
                })
            }));
            expect(result.status).toBe('resolved');
        });
        it('should throw forbidden if comment belongs to account outside the workspace', async () => {
            mockWorkspaceRepository.findMember.mockResolvedValue(mockWorkspaceMember);
            mockCommentRepository.findCommentById.mockResolvedValue(mockComment);
            mockWorkspaceRepository.listMembers.mockResolvedValue([mockWorkspaceMember]);
            mockSocialRepository.findAccountsByUserId.mockResolvedValue([]); // No accounts linked
            await expect(commentService.replyToComment('c_123', 'Test Reply', 'ws_123', 'user_123')).rejects.toThrow(new appError_1.AppError('Access denied to comment', 403));
        });
    });
    describe('resolveComment', () => {
        it('should update status and resolve the comment', async () => {
            mockWorkspaceRepository.findMember.mockResolvedValue(mockWorkspaceMember);
            mockCommentRepository.findCommentById.mockResolvedValue(mockComment);
            mockWorkspaceRepository.listMembers.mockResolvedValue([mockWorkspaceMember]);
            mockSocialRepository.findAccountsByUserId.mockResolvedValue([mockSocialAccount]);
            const mockResolvedComment = { ...mockComment, status: 'resolved' };
            mockCommentRepository.updateComment.mockResolvedValue(mockResolvedComment);
            const result = await commentService.resolveComment('c_123', 'resolved', 'ws_123', 'user_123');
            expect(mockCommentRepository.updateComment).toHaveBeenCalledWith('c_123', { status: 'resolved' });
            expect(result.status).toBe('resolved');
        });
    });
    describe('assignComment', () => {
        it('should assign comment to workspace teammate', async () => {
            mockWorkspaceRepository.findMember.mockResolvedValueOnce(mockWorkspaceMember); // caller check
            mockCommentRepository.findCommentById.mockResolvedValue(mockComment);
            mockWorkspaceRepository.listMembers.mockResolvedValue([mockWorkspaceMember, mockWorkspaceTeammate]);
            mockSocialRepository.findAccountsByUserId.mockResolvedValue([mockSocialAccount]);
            mockWorkspaceRepository.findMember.mockResolvedValueOnce(mockWorkspaceTeammate); // assignee check
            const mockAssignedComment = { ...mockComment, assignedTo: 'user_456' };
            mockCommentRepository.updateComment.mockResolvedValue(mockAssignedComment);
            const result = await commentService.assignComment('c_123', 'user_456', 'ws_123', 'user_123');
            expect(mockCommentRepository.updateComment).toHaveBeenCalledWith('c_123', { assignedTo: 'user_456' });
            expect(result.assignedTo).toBe('user_456');
        });
        it('should throw bad request if assignee is not a member of the workspace', async () => {
            mockWorkspaceRepository.findMember.mockResolvedValueOnce(mockWorkspaceMember); // caller check
            mockCommentRepository.findCommentById.mockResolvedValue(mockComment);
            mockWorkspaceRepository.listMembers.mockResolvedValue([mockWorkspaceMember]);
            mockSocialRepository.findAccountsByUserId.mockResolvedValue([mockSocialAccount]);
            mockWorkspaceRepository.findMember.mockResolvedValueOnce(null); // assignee check (not member)
            await expect(commentService.assignComment('c_123', 'user_non_member', 'ws_123', 'user_123')).rejects.toThrow(new appError_1.AppError('Assigned user is not a member of this workspace', 400));
        });
    });
    describe('suggestReply', () => {
        it('should generate professional, friendly, and brand suggestions using fallback templates', async () => {
            mockWorkspaceRepository.findMember.mockResolvedValue(mockWorkspaceMember);
            mockCommentRepository.findCommentById.mockResolvedValue(mockComment); // "Is there a free trial?"
            mockWorkspaceRepository.listMembers.mockResolvedValue([mockWorkspaceMember]);
            mockSocialRepository.findAccountsByUserId.mockResolvedValue([mockSocialAccount]);
            const result = await commentService.suggestReply('c_123', 'ws_123', 'user_123');
            expect(result).toHaveProperty('professional');
            expect(result).toHaveProperty('friendly');
            expect(result).toHaveProperty('brand');
            expect(result.friendly).toContain('free plan');
        });
    });
});

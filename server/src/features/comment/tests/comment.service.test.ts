// Must be before any service imports — register ActivityLog/Notification with a mock save
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  const mSave = jest.fn().mockResolvedValue(undefined);
  const MockModel = function (this: any, data: any) { Object.assign(this, data); } as any;
  MockModel.prototype.save = mSave;
  return {
    ...actual,
    models: new Proxy(actual.models, {
      get(target: any, prop: string) {
        if (prop === 'ActivityLog' || prop === 'Notification') return MockModel;
        return target[prop];
      }
    }),
    model: jest.fn((name: string, schema?: any) => {
      if (name === 'ActivityLog' || name === 'Notification') return MockModel;
      if (schema) return actual.model(name, schema);
      return actual.model(name);
    })
  };
});

import { CommentService } from '../comment.service';
import { CommentRepository } from '../comment.repository';
import { WorkspaceRepository } from '../../workspace/workspace.repository';
import { SocialRepository } from '../../social/social.repository';
import { UserRepository } from '../../user/user.repository';
import { AppError } from '../../../shared/errors/appError';

jest.mock('../comment.repository');
jest.mock('../../workspace/workspace.repository');
jest.mock('../../social/social.repository');
jest.mock('../../user/user.repository');

describe('CommentService Unit Tests', () => {
  let commentService: CommentService;
  let mockCommentRepository: jest.Mocked<CommentRepository>;
  let mockWorkspaceRepository: jest.Mocked<WorkspaceRepository>;
  let mockSocialRepository: jest.Mocked<SocialRepository>;
  let mockUserRepository: jest.Mocked<UserRepository>;

  const mockUser: any = { _id: 'user_123', email: 'teammate@socialflow.ai', fullName: 'Teammate User', avatarUrl: 'avatar.png' };
  const mockTeammate: any = { _id: 'user_456', email: 'other@socialflow.ai', fullName: 'Other User' };
  const mockWorkspaceMember: any = { workspaceId: 'ws_123', userId: 'user_123', role: 'editor' };
  const mockWorkspaceTeammate: any = { workspaceId: 'ws_123', userId: 'user_456', role: 'viewer' };
  
  const mockSocialAccount: any = {
    _id: 'sa_123',
    userId: 'user_123',
    platform: 'twitter',
    accountId: 'tw_acc_123',
    username: 'test_handle',
    displayName: 'Test Handle',
    accessToken: 'encrypted'
  };

  const mockComment: any = {
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
    mockCommentRepository = new CommentRepository() as jest.Mocked<CommentRepository>;
    mockWorkspaceRepository = new WorkspaceRepository() as jest.Mocked<WorkspaceRepository>;
    mockSocialRepository = new SocialRepository() as jest.Mocked<SocialRepository>;
    mockUserRepository = new UserRepository() as jest.Mocked<UserRepository>;

    commentService = new CommentService(
      mockCommentRepository,
      mockWorkspaceRepository,
      mockSocialRepository,
      mockUserRepository
    );
    jest.clearAllMocks();
  });

  describe('listComments', () => {
    it('should successfully list comments for accounts linked to a workspace', async () => {
      mockWorkspaceRepository.findMember.mockResolvedValue(mockWorkspaceMember);
      mockWorkspaceRepository.listMembers.mockResolvedValue([mockWorkspaceMember, mockWorkspaceTeammate]);
      mockSocialRepository.findAccountsByUserId.mockImplementation(async (userId) => {
        if (userId === 'user_123') return [mockSocialAccount];
        return [];
      });
      mockCommentRepository.findCommentsByAccountIds.mockResolvedValue([mockComment]);

      const result = await commentService.listComments('ws_123', 'user_123', { workspaceId: 'ws_123', status: 'unresolved' });

      expect(mockWorkspaceRepository.findMember).toHaveBeenCalledWith('ws_123', 'user_123');
      expect(mockSocialRepository.findAccountsByUserId).toHaveBeenCalledWith('user_123');
      expect(mockCommentRepository.findCommentsByAccountIds).toHaveBeenCalledWith(['tw_acc_123'], { workspaceId: 'ws_123', status: 'unresolved' });
      expect(result).toHaveLength(1);
      expect(result[0]._id).toBe('c_123');
    });

    it('should throw AppError forbidden if caller is not a member of the workspace', async () => {
      mockWorkspaceRepository.findMember.mockResolvedValue(null);

      await expect(
        commentService.listComments('ws_123', 'user_non_member', { workspaceId: 'ws_123' })
      ).rejects.toThrow(new AppError('Unauthorized access to workspace data', 403));
    });

    it('should return empty list if no social accounts are connected by members of the workspace', async () => {
      mockWorkspaceRepository.findMember.mockResolvedValue(mockWorkspaceMember);
      mockWorkspaceRepository.listMembers.mockResolvedValue([mockWorkspaceMember]);
      mockSocialRepository.findAccountsByUserId.mockResolvedValue([]);

      const result = await commentService.listComments('ws_123', 'user_123', { workspaceId: 'ws_123' });

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
      mockCommentRepository.pushReply.mockResolvedValue(mockUpdatedComment as any);

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

      await expect(
        commentService.replyToComment('c_123', 'Test Reply', 'ws_123', 'user_123')
      ).rejects.toThrow(new AppError('Access denied to comment', 403));
    });
  });

  describe('resolveComment', () => {
    it('should update status and resolve the comment', async () => {
      mockWorkspaceRepository.findMember.mockResolvedValue(mockWorkspaceMember);
      mockCommentRepository.findCommentById.mockResolvedValue(mockComment);
      mockWorkspaceRepository.listMembers.mockResolvedValue([mockWorkspaceMember]);
      mockSocialRepository.findAccountsByUserId.mockResolvedValue([mockSocialAccount]);
      
      const mockResolvedComment = { ...mockComment, status: 'resolved' };
      mockCommentRepository.updateComment.mockResolvedValue(mockResolvedComment as any);

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
      mockCommentRepository.updateComment.mockResolvedValue(mockAssignedComment as any);

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

      await expect(
        commentService.assignComment('c_123', 'user_non_member', 'ws_123', 'user_123')
      ).rejects.toThrow(new AppError('Assigned user is not a member of this workspace', 400));
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

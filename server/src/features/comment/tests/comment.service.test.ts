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
jest.mock('../../../services/social/providers/provider.factory', () => ({
  ProviderFactory: { getConfiguredProvider: jest.fn() }
}));
jest.mock('../../social/social.service', () => ({
  SocialService: jest.fn().mockImplementation(() => ({
    resolveAccountTokenBundle: jest.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' })
  }))
}));

import { ProviderFactory } from '../../../services/social/providers/provider.factory';
import { SocialService } from '../../social/social.service';

describe('CommentService Unit Tests', () => {
  let commentService: CommentService;
  let mockCommentRepository: jest.Mocked<CommentRepository>;
  let mockWorkspaceRepository: jest.Mocked<WorkspaceRepository>;
  let mockSocialRepository: jest.Mocked<SocialRepository>;
  let mockUserRepository: jest.Mocked<UserRepository>;

  const mockUser: any = { _id: 'user_123', email: 'teammate@socialflow.ai', fullName: 'Teammate User', avatarUrl: 'avatar.png' };
  const mockWorkspaceMember: any = { workspaceId: 'ws_123', userId: 'user_123', role: 'editor' };
  const mockWorkspaceTeammate: any = { workspaceId: 'ws_123', userId: 'user_456', role: 'viewer' };

  const mockSocialAccount: any = {
    _id: 'sa_123',
    userId: 'user_123',
    platform: 'twitter',
    providerAccountId: 'tw_acc_123',
    accountType: 'profile',
    username: 'test_handle',
    displayName: 'Test Handle',
    encryptedAccessToken: 'encrypted'
  };

  const mockComment: any = {
    _id: 'c_123',
    workspaceId: 'ws_123',
    platform: 'twitter',
    accountId: 'sa_123',
    externalAccountId: 'tw_acc_123',
    externalPostId: 'post_123',
    externalCommentId: 'ext_c_1',
    author: { username: 'commenter_1', displayName: 'Commenter' },
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

    // Config-level resetMocks wipes factory implementations; restore them
    // BEFORE constructing the service (its constructor instantiates SocialService).
    jest.clearAllMocks();
    (SocialService as unknown as jest.Mock).mockImplementation(() => ({
      resolveAccountTokenBundle: jest.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' })
    }));
    (ProviderFactory.getConfiguredProvider as jest.Mock).mockReturnValue({
      getCapabilities: () => ({ commentsWrite: true }),
      replyToComment: jest.fn().mockResolvedValue({ externalReplyId: 'ext_reply_1' })
    });

    commentService = new CommentService(
      mockCommentRepository,
      mockWorkspaceRepository,
      mockSocialRepository,
      mockUserRepository
    );
  });

  describe('listComments', () => {
    it('should successfully list comments for a workspace', async () => {
      mockWorkspaceRepository.findMember.mockResolvedValue(mockWorkspaceMember);
      mockCommentRepository.findCommentsByWorkspaceId.mockResolvedValue([mockComment]);

      const result = await commentService.listComments('ws_123', 'user_123', { workspaceId: 'ws_123', status: 'unresolved' });

      expect(mockWorkspaceRepository.findMember).toHaveBeenCalledWith('ws_123', 'user_123');
      expect(mockCommentRepository.findCommentsByWorkspaceId).toHaveBeenCalledWith('ws_123', { workspaceId: 'ws_123', status: 'unresolved' });
      expect(result).toHaveLength(1);
      expect(result[0]._id).toBe('c_123');
    });

    it('should throw AppError forbidden if caller is not a member of the workspace', async () => {
      mockWorkspaceRepository.findMember.mockResolvedValue(null);

      await expect(
        commentService.listComments('ws_123', 'user_non_member', { workspaceId: 'ws_123' })
      ).rejects.toThrow(new AppError('Unauthorized access to workspace data', 403));
    });

    it('should return empty list when the workspace has no comments', async () => {
      mockWorkspaceRepository.findMember.mockResolvedValue(mockWorkspaceMember);
      mockCommentRepository.findCommentsByWorkspaceId.mockResolvedValue([]);

      const result = await commentService.listComments('ws_123', 'user_123', { workspaceId: 'ws_123' });

      expect(result).toEqual([]);
      expect(mockCommentRepository.findCommentsByWorkspaceId).toHaveBeenCalled();
    });
  });

  describe('replyToComment', () => {
    it('should send the reply to the provider FIRST and store it with the external reply id', async () => {
      mockWorkspaceRepository.findMember.mockResolvedValue(mockWorkspaceMember);
      mockCommentRepository.findCommentById.mockResolvedValue(mockComment);
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockSocialRepository.findAccountById.mockResolvedValue(mockSocialAccount);

      const mockUpdatedComment = { ...mockComment, replies: [{ message: 'Test Reply' }] };
      mockCommentRepository.pushReply.mockResolvedValue(mockUpdatedComment as any);

      const result = await commentService.replyToComment('c_123', 'Test Reply', 'ws_123', 'user_123');

      const provider = ProviderFactory.getConfiguredProvider('twitter') as any;
      expect(provider.replyToComment).toHaveBeenCalledWith(
        expect.objectContaining({ tokens: { accessToken: 'at', refreshToken: 'rt' } }),
        'ext_c_1',
        'Test Reply'
      );
      expect(mockCommentRepository.pushReply).toHaveBeenCalledWith('c_123', expect.objectContaining({
        message: 'Test Reply',
        externalReplyId: 'ext_reply_1',
        sentToProvider: true,
        author: expect.objectContaining({
          username: 'teammate',
          displayName: 'Teammate User',
          isSystemUser: true
        })
      }));
      expect(result.replies).toHaveLength(1);
    });

    it('should throw badRequest when the platform does not support comment replies', async () => {
      mockWorkspaceRepository.findMember.mockResolvedValue(mockWorkspaceMember);
      mockCommentRepository.findCommentById.mockResolvedValue(mockComment);
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockSocialRepository.findAccountById.mockResolvedValue(mockSocialAccount);
      (ProviderFactory.getConfiguredProvider as jest.Mock).mockReturnValue({
        getCapabilities: () => ({ commentsWrite: false }),
        replyToComment: jest.fn()
      });

      await expect(
        commentService.replyToComment('c_123', 'Test Reply', 'ws_123', 'user_123')
      ).rejects.toThrow(
        new AppError('Replying to comments is not supported for twitter (profile)', 400)
      );
    });

    it('should throw forbidden if the comment belongs to another workspace', async () => {
      mockWorkspaceRepository.findMember.mockResolvedValue(mockWorkspaceMember);
      mockCommentRepository.findCommentById.mockResolvedValue({ ...mockComment, workspaceId: 'ws_other' });

      await expect(
        commentService.replyToComment('c_123', 'Test Reply', 'ws_123', 'user_123')
      ).rejects.toThrow(new AppError('Access denied to comment', 403));
    });
  });

  describe('resolveComment', () => {
    it('should update the resolution status', async () => {
      mockWorkspaceRepository.findMember.mockResolvedValue(mockWorkspaceMember);
      mockCommentRepository.findCommentById.mockResolvedValue(mockComment);

      const mockResolvedComment = { ...mockComment, status: 'resolved' };
      mockCommentRepository.updateComment.mockResolvedValue(mockResolvedComment as any);

      const result = await commentService.resolveComment('c_123', 'resolved', 'ws_123', 'user_123');

      expect(mockCommentRepository.updateComment).toHaveBeenCalledWith('c_123', { status: 'resolved' });
      expect(result.status).toBe('resolved');
    });
  });

  describe('assignComment', () => {
    it('should assign comment to workspace teammate', async () => {
      mockWorkspaceRepository.findMember
        .mockResolvedValueOnce(mockWorkspaceMember) // caller check
        .mockResolvedValueOnce(mockWorkspaceTeammate); // assignee check
      mockCommentRepository.findCommentById.mockResolvedValue(mockComment);

      const mockAssignedComment = { ...mockComment, assignedTo: 'user_456' };
      mockCommentRepository.updateComment.mockResolvedValue(mockAssignedComment as any);

      const result = await commentService.assignComment('c_123', 'user_456', 'ws_123', 'user_123');

      expect(mockCommentRepository.updateComment).toHaveBeenCalledWith('c_123', { assignedTo: 'user_456' });
      expect(result.assignedTo).toBe('user_456');
    });

    it('should throw bad request if assignee is not a member of the workspace', async () => {
      mockWorkspaceRepository.findMember
        .mockResolvedValueOnce(mockWorkspaceMember) // caller check
        .mockResolvedValueOnce(null); // assignee check (not member)
      mockCommentRepository.findCommentById.mockResolvedValue(mockComment);

      await expect(
        commentService.assignComment('c_123', 'user_non_member', 'ws_123', 'user_123')
      ).rejects.toThrow(new AppError('Assigned user is not a member of this workspace', 400));
    });
  });

  describe('suggestReply', () => {
    it('should throw badRequest when no AI provider key is configured (never falls back to templates)', async () => {
      mockWorkspaceRepository.findMember.mockResolvedValue(mockWorkspaceMember);
      mockCommentRepository.findCommentById.mockResolvedValue(mockComment);

      await expect(
        commentService.suggestReply('c_123', 'ws_123', 'user_123')
      ).rejects.toThrow(
        new AppError(
          'AI reply suggestions require an API key. Configure OPENAI_API_KEY or CLAUDE_API_KEY to use this feature.',
          400
        )
      );
    });
  });
});

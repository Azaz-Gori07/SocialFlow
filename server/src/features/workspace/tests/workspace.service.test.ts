import { WorkspaceService } from '../workspace.service';
import { WorkspaceRepository } from '../workspace.repository';
import { UserRepository } from '../../user/user.repository';
import { AppError } from '../../../shared/errors/appError';

jest.mock('../workspace.repository');
jest.mock('../../user/user.repository');

describe('WorkspaceService Unit Tests', () => {
  let workspaceService: WorkspaceService;
  let mockWorkspaceRepository: jest.Mocked<WorkspaceRepository>;
  let mockUserRepository: jest.Mocked<UserRepository>;

  const mockUser: any = { _id: 'user_owner', email: 'owner@socialflow.ai', fullName: 'Owner User' };
  const mockInviter: any = { _id: 'user_inviter', email: 'inviter@socialflow.ai', fullName: 'Inviter User' };
  const mockTarget: any = { _id: 'user_target', email: 'target@socialflow.ai', fullName: 'Target User' };

  const mockWorkspace: any = {
    _id: 'ws_123',
    name: 'Acme Workspace',
    ownerId: 'user_owner',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockMembership: any = {
    _id: 'mb_123',
    workspaceId: 'ws_123',
    userId: 'user_owner',
    role: 'owner',
    createdAt: new Date()
  };

  beforeEach(() => {
    mockWorkspaceRepository = new WorkspaceRepository() as jest.Mocked<WorkspaceRepository>;
    mockUserRepository = new UserRepository() as jest.Mocked<UserRepository>;
    workspaceService = new WorkspaceService(mockWorkspaceRepository, mockUserRepository);
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

      await expect(
        workspaceService.createWorkspace('Acme Workspace', 'nonexistent_user')
      ).rejects.toThrow(new AppError('Owner user profile not found', 404));
    });
  });

  describe('inviteMember', () => {
    it('should invite a user successfully if caller is owner', async () => {
      mockWorkspaceRepository.findWorkspaceById.mockResolvedValue(mockWorkspace);
      mockWorkspaceRepository.findMember.mockResolvedValueOnce({ role: 'owner' } as any).mockResolvedValueOnce(null);
      mockUserRepository.findByEmail.mockResolvedValue(mockTarget);
      mockWorkspaceRepository.addMember.mockResolvedValue({ role: 'editor', createdAt: new Date() } as any);

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
      mockWorkspaceRepository.findMember.mockResolvedValue({ role: 'viewer' } as any);

      await expect(
        workspaceService.inviteMember({
          workspaceId: 'ws_123',
          email: 'target@socialflow.ai',
          role: 'editor'
        }, 'user_viewer')
      ).rejects.toThrow(new AppError('Only workspace Owners or Admins can invite team members', 403));
    });

    it('should throw conflict if user is already a member', async () => {
      mockWorkspaceRepository.findWorkspaceById.mockResolvedValue(mockWorkspace);
      mockWorkspaceRepository.findMember.mockResolvedValueOnce({ role: 'owner' } as any); // caller check
      mockUserRepository.findByEmail.mockResolvedValue(mockTarget);
      mockWorkspaceRepository.findMember.mockResolvedValueOnce({ role: 'editor' } as any); // existing member check

      await expect(
        workspaceService.inviteMember({
          workspaceId: 'ws_123',
          email: 'target@socialflow.ai',
          role: 'editor'
        }, 'user_owner')
      ).rejects.toThrow(new AppError('User is already a member of this workspace', 409));
    });
  });
});

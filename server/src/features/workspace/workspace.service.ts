import { WorkspaceRepository } from './workspace.repository';
import { UserRepository } from '../user/user.repository';
import { AppError } from '../../shared/errors/appError';
import { InviteMemberInput, UpdateRoleInput } from './workspace.validation';

/**
 * Minimal notification interface for dependency injection.
 * Used to decouple WorkspaceService from the database module so
 * tests can run without triggering a MongoDB connection.
 */
export interface NotificationCollection {
  create(data: any): Promise<any>;
}

export class WorkspaceService {
  /**
   * Injected notification collection.
   * In production: set to db.notifications in routes.ts
   * In tests: left as undefined (notification creation silently skipped)
   */
  public notificationCollection: NotificationCollection | undefined;

  constructor(
    private workspaceRepository: WorkspaceRepository,
    private userRepository: UserRepository
  ) {}

  async createWorkspace(name: string, ownerId: string) {
    const user = await this.userRepository.findById(ownerId);
    if (!user) {
      throw AppError.notFound('Owner user profile not found');
    }

    const workspace = await this.workspaceRepository.createWorkspace(name, ownerId);
    
    // Add owner member mapping
    const member = await this.workspaceRepository.addMember(
      workspace._id.toString(),
      ownerId,
      'owner'
    );

    return {
      id: workspace._id.toString(),
      name: workspace.name,
      ownerId: workspace.ownerId,
      role: member.role,
      createdAt: workspace.createdAt.toISOString()
    };
  }

  async inviteMember(input: InviteMemberInput, callerId: string) {
    const { workspaceId, email, role } = input;

    // Check if workspace exists
    const workspace = await this.workspaceRepository.findWorkspaceById(workspaceId);
    if (!workspace) {
      throw AppError.notFound('Workspace not found');
    }

    // Verify caller permissions (caller must be owner or admin to invite)
    const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
    if (!callerMember || (callerMember.role !== 'owner' && callerMember.role !== 'admin')) {
      throw AppError.forbidden('Only workspace Owners or Admins can invite team members');
    }

    // Locate target user by email
    const targetUser = await this.userRepository.findByEmail(email);
    if (!targetUser) {
      throw AppError.notFound(`No registered user found with email: ${email}`);
    }

    // Check if target user is already a member
    const existingMember = await this.workspaceRepository.findMember(workspaceId, targetUser._id.toString());
    if (existingMember) {
      throw AppError.conflict('User is already a member of this workspace');
    }

    // Add membership
    const membership = await this.workspaceRepository.addMember(
      workspaceId,
      targetUser._id.toString(),
      role
    );

    // Send notification to the invited user (P1.3)
    await this.sendWorkspaceInviteNotification(
      targetUser._id.toString(),
      workspace.name,
      role
    );

    return {
      workspaceId,
      userId: targetUser._id.toString(),
      fullName: targetUser.fullName,
      email: targetUser.email,
      role: membership.role,
      joinedAt: membership.createdAt.toISOString()
    };
  }

  /**
   * Update member role in a workspace (P1.2)
   * Only owners can change roles. Owners cannot be modified.
   */
  async updateMemberRole(input: UpdateRoleInput, callerId: string) {
    const { workspaceId, memberUserId, role } = input;

    // Check if workspace exists
    const workspace = await this.workspaceRepository.findWorkspaceById(workspaceId);
    if (!workspace) {
      throw AppError.notFound('Workspace not found');
    }

    // Only owners can change roles
    const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
    if (!callerMember || callerMember.role !== 'owner') {
      throw AppError.forbidden('Only workspace Owners can update member roles');
    }

    // Check target membership
    const targetMember = await this.workspaceRepository.findMember(workspaceId, memberUserId);
    if (!targetMember) {
      throw AppError.notFound('Member not found in workspace');
    }

    // Cannot change owner role
    if (targetMember.role === 'owner') {
      throw AppError.badRequest('Cannot change workspace owner role');
    }

    const updated = await this.workspaceRepository.updateMemberRole(workspaceId, memberUserId, role);
    if (!updated) {
      throw AppError.internal('Failed to update member role');
    }

    return {
      workspaceId,
      userId: memberUserId,
      role: updated.role
    };
  }

  /**
   * Send a notification when a user is invited/added to a workspace (P1.3)
   * Best-effort — does not throw on failure.
   * Uses injected notificationCollection if available; otherwise silently skips.
   */
  private async sendWorkspaceInviteNotification(
    userId: string,
    workspaceName: string,
    role: string
  ): Promise<void> {
    try {
      if (!this.notificationCollection) return; // No provider (e.g. test env)
      await this.notificationCollection.create({
        userId,
        title: 'Joined Workspace',
        message: `You have been added to the workspace "${workspaceName}" as ${role}.`,
        read: false,
        type: 'workspace_invite'
      });
    } catch {
      // Swallow — notification is best-effort
    }
  }

  async listMembers(workspaceId: string, callerId: string) {
    // Check if caller has membership
    const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
    if (!callerMember) {
      throw AppError.forbidden('Unauthorized access to workspace data');
    }

    const members = await this.workspaceRepository.listMembers(workspaceId);
    
    // Enrich member list with profiles from userRepository
    const enrichedList = [];
    for (const member of members) {
      const user = await this.userRepository.findById(member.userId);
      if (user) {
        enrichedList.push({
          userId: user._id.toString(),
          fullName: user.fullName,
          email: user.email,
          avatarUrl: user.avatarUrl,
          role: member.role,
          joinedAt: member.createdAt.toISOString()
        });
      }
    }
    return enrichedList;
  }

  async listWorkspacesForUser(userId: string) {
    const memberships = await this.workspaceRepository.listWorkspacesForUser(userId);
    
    const workspacesList = [];
    for (const member of memberships) {
      const workspace = await this.workspaceRepository.findWorkspaceById(member.workspaceId);
      if (workspace) {
        workspacesList.push({
          id: workspace._id.toString(),
          name: workspace.name,
          role: member.role,
          ownerId: workspace.ownerId,
          createdAt: workspace.createdAt.toISOString()
        });
      }
    }
    return workspacesList;
  }

  async removeMember(workspaceId: string, targetUserId: string, callerId: string) {
    // Check if workspace exists
    const workspace = await this.workspaceRepository.findWorkspaceById(workspaceId);
    if (!workspace) throw AppError.notFound('Workspace not found');

    const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
    if (!callerMember) throw AppError.forbidden('Unauthorized access to workspace');

    const targetMember = await this.workspaceRepository.findMember(workspaceId, targetUserId);
    if (!targetMember) throw AppError.notFound('Member not found in workspace');

    if (targetMember.role === 'owner') {
      throw AppError.badRequest('Cannot remove the workspace Owner');
    }

    // Role hierarchies checks
    if (callerMember.role === 'admin' && targetMember.role === 'admin') {
      throw AppError.forbidden('Admins cannot remove other Admins or Owners');
    }

    if (callerMember.role !== 'owner' && callerMember.role !== 'admin' && callerId !== targetUserId) {
      throw AppError.forbidden('Insufficient permissions to remove member');
    }

    await this.workspaceRepository.removeMember(workspaceId, targetUserId);
    return true;
  }
}
export default WorkspaceService;

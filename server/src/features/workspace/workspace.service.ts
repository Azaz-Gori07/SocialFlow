import { WorkspaceRepository } from './workspace.repository';
import { UserRepository } from '../user/user.repository';
import { AppError } from '../../shared/errors/appError';
import { InviteMemberInput, UpdateRoleInput } from './workspace.validation';
import crypto from 'crypto';
import { db } from '../../database/db';
import { DraftModel } from '../draft/draft.model';
import { EncryptionAdapter } from '../../services/social/adapters/encryption.adapter';
import { DEFAULT_WORKSPACE_SETTINGS, IWorkspace, IWorkspaceSettings } from './workspace.model';

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

    // One batch query instead of one roundtrip per membership (N+1).
    const workspaces = await this.workspaceRepository.findWorkspacesByIds(
      memberships.map((m) => m.workspaceId)
    );
    const byId = new Map(workspaces.map((w) => [w._id.toString(), w]));

    // Preserve membership order — the client treats workspaces[0] as default.
    const workspacesList = [];
    for (const member of memberships) {
      const workspace = byId.get(member.workspaceId);
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

  // ---------------------------------------------------------------------------
  // Workspace settings / API key / data export
  // ---------------------------------------------------------------------------

  private settingsWithDefaults(settings?: IWorkspaceSettings | any): IWorkspaceSettings {
    const current = settings && typeof settings.toObject === 'function' ? settings.toObject() : settings || {};
    const merged = { ...DEFAULT_WORKSPACE_SETTINGS, ...current };
    delete (merged as any)._id;
    return merged;
  }

  private async requireWorkspaceMembership(workspaceId: string, callerId: string): Promise<IWorkspace> {
    const workspace = await this.workspaceRepository.findWorkspaceById(workspaceId);
    if (!workspace) throw AppError.notFound('Workspace not found');

    const member = await this.workspaceRepository.findMember(workspaceId, callerId);
    if (!member && workspace.ownerId !== callerId) {
      throw AppError.forbidden('Unauthorized access to workspace data');
    }
    return workspace;
  }

  private async requireWorkspaceAdmin(workspaceId: string, callerId: string): Promise<IWorkspace> {
    const workspace = await this.requireWorkspaceMembership(workspaceId, callerId);
    if (workspace.ownerId === callerId) return workspace;

    const member = await this.workspaceRepository.findMember(workspaceId, callerId);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      throw AppError.forbidden('Only workspace Owners or Admins can change these settings');
    }
    return workspace;
  }

  async getSettings(workspaceId: string, callerId: string) {
    const workspace = await this.requireWorkspaceMembership(workspaceId, callerId);
    return {
      workspaceId: workspace._id.toString(),
      name: workspace.name,
      settings: this.settingsWithDefaults(workspace.settings)
    };
  }

  async updateWorkspace(
    workspaceId: string,
    callerId: string,
    input: { name?: string; settings?: Partial<IWorkspaceSettings> }
  ) {
    const workspace = await this.requireWorkspaceAdmin(workspaceId, callerId);

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.settings !== undefined) {
      patch.settings = {
        ...this.settingsWithDefaults(workspace.settings),
        ...input.settings
      };
    }

    const updated = await this.workspaceRepository.updateWorkspace(workspaceId, patch as any);
    if (!updated) throw AppError.notFound('Workspace not found');

    return {
      workspaceId: updated._id.toString(),
      name: updated.name,
      settings: this.settingsWithDefaults(updated.settings)
    };
  }

  private buildApiKey() {
    const key = `sf_live_${crypto.randomBytes(24).toString('base64url')}`;
    return {
      key,
      hash: crypto.createHash('sha256').update(key).digest('hex'),
      prefix: key.slice(0, 16)
    };
  }

  async getApiKey(workspaceId: string, callerId: string) {
    const workspace = await this.requireWorkspaceAdmin(workspaceId, callerId);
    if (!workspace.apiKeyHash) {
      return { exists: false, key: null, prefix: null, createdAt: null };
    }

    let key: string | null = null;
    if (workspace.apiKeyEncrypted) {
      try {
        key = EncryptionAdapter.decrypt(workspace.apiKeyEncrypted);
      } catch {
        key = null;
      }
    }

    return {
      exists: true,
      key,
      prefix: workspace.apiKeyPrefix || null,
      createdAt: workspace.apiKeyCreatedAt || null
    };
  }

  async createApiKey(workspaceId: string, callerId: string) {
    await this.requireWorkspaceAdmin(workspaceId, callerId);
    const generated = this.buildApiKey();
    await this.workspaceRepository.updateWorkspace(workspaceId, {
      apiKeyHash: generated.hash,
      apiKeyPrefix: generated.prefix,
      apiKeyEncrypted: EncryptionAdapter.encrypt(generated.key),
      apiKeyCreatedAt: new Date(),
      apiKeyLastUsedAt: undefined
    } as any);

    return { exists: true, key: generated.key, prefix: generated.prefix, createdAt: new Date() };
  }

  async revokeApiKey(workspaceId: string, callerId: string) {
    const workspace = await this.requireWorkspaceAdmin(workspaceId, callerId);
    if (!workspace.apiKeyHash) {
      return { revoked: false };
    }
    await this.workspaceRepository.clearApiKey(workspaceId);
    return { revoked: true };
  }

  /**
   * Full workspace backup. Tokens/session secrets are stripped: the archive is
   * for content and analytics, not credentials.
   */
  async exportWorkspace(workspaceId: string, callerId: string) {
    const workspace = await this.requireWorkspaceMembership(workspaceId, callerId);
    const ownerId = workspace.ownerId;

    const [members, owner, posts, drafts, comments, notifications, accounts, analytics, activity] =
      await Promise.all([
        this.workspaceRepository.listMembers(workspaceId),
        this.userRepository.findById(ownerId),
        db.posts.find({ workspaceId }).limit(5000).lean(),
        // Personal collections belong to the caller, not the workspace owner:
        // an admin must not be able to export someone else's drafts, alerts or
        // accounts. Workspace-scoped content stays scoped to the workspace.
        DraftModel.find({ userId: callerId }).limit(5000).lean(),
        db.comments.find({ workspaceId }).limit(5000).lean(),
        db.notifications.find({ userId: callerId }).limit(5000).lean(),
        db.socialAccounts.find({ userId: callerId }).limit(200).lean(),
        db.analytics.find({ userId: callerId }).limit(10000).lean(),
        db.activityLogs.find({ workspaceId }).limit(5000).lean()
      ]);

    const safeAccounts = (accounts as any[]).map((account) => {
      const {
        encryptedAccessToken,
        encryptedRefreshToken,
        accessToken,
        refreshToken,
        xSessionAuthTokenEncrypted,
        xSessionCt0Encrypted,
        ...rest
      } = account;
      return rest;
    });

    return {
      exportedAt: new Date().toISOString(),
      version: 1,
      workspace: {
        id: workspace._id.toString(),
        name: workspace.name,
        ownerId: workspace.ownerId,
        settings: this.settingsWithDefaults(workspace.settings),
        createdAt: workspace.createdAt
      },
      owner: owner
        ? {
            id: owner._id.toString(),
            email: owner.email,
            fullName: owner.fullName
          }
        : null,
      members: members.map((m) => ({
        userId: m.userId,
        role: m.role,
        joinedAt: m.createdAt
      })),
      posts,
      drafts,
      comments,
      notifications,
      accounts: safeAccounts,
      analytics,
      activity
    };
  }
}
export default WorkspaceService;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceService = void 0;
const appError_1 = require("../../shared/errors/appError");
class WorkspaceService {
    workspaceRepository;
    userRepository;
    /**
     * Injected notification collection.
     * In production: set to db.notifications in routes.ts
     * In tests: left as undefined (notification creation silently skipped)
     */
    notificationCollection;
    constructor(workspaceRepository, userRepository) {
        this.workspaceRepository = workspaceRepository;
        this.userRepository = userRepository;
    }
    async createWorkspace(name, ownerId) {
        const user = await this.userRepository.findById(ownerId);
        if (!user) {
            throw appError_1.AppError.notFound('Owner user profile not found');
        }
        const workspace = await this.workspaceRepository.createWorkspace(name, ownerId);
        // Add owner member mapping
        const member = await this.workspaceRepository.addMember(workspace._id.toString(), ownerId, 'owner');
        return {
            id: workspace._id.toString(),
            name: workspace.name,
            ownerId: workspace.ownerId,
            role: member.role,
            createdAt: workspace.createdAt.toISOString()
        };
    }
    async inviteMember(input, callerId) {
        const { workspaceId, email, role } = input;
        // Check if workspace exists
        const workspace = await this.workspaceRepository.findWorkspaceById(workspaceId);
        if (!workspace) {
            throw appError_1.AppError.notFound('Workspace not found');
        }
        // Verify caller permissions (caller must be owner or admin to invite)
        const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
        if (!callerMember || (callerMember.role !== 'owner' && callerMember.role !== 'admin')) {
            throw appError_1.AppError.forbidden('Only workspace Owners or Admins can invite team members');
        }
        // Locate target user by email
        const targetUser = await this.userRepository.findByEmail(email);
        if (!targetUser) {
            throw appError_1.AppError.notFound(`No registered user found with email: ${email}`);
        }
        // Check if target user is already a member
        const existingMember = await this.workspaceRepository.findMember(workspaceId, targetUser._id.toString());
        if (existingMember) {
            throw appError_1.AppError.conflict('User is already a member of this workspace');
        }
        // Add membership
        const membership = await this.workspaceRepository.addMember(workspaceId, targetUser._id.toString(), role);
        // Send notification to the invited user (P1.3)
        await this.sendWorkspaceInviteNotification(targetUser._id.toString(), workspace.name, role);
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
    async updateMemberRole(input, callerId) {
        const { workspaceId, memberUserId, role } = input;
        // Check if workspace exists
        const workspace = await this.workspaceRepository.findWorkspaceById(workspaceId);
        if (!workspace) {
            throw appError_1.AppError.notFound('Workspace not found');
        }
        // Only owners can change roles
        const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
        if (!callerMember || callerMember.role !== 'owner') {
            throw appError_1.AppError.forbidden('Only workspace Owners can update member roles');
        }
        // Check target membership
        const targetMember = await this.workspaceRepository.findMember(workspaceId, memberUserId);
        if (!targetMember) {
            throw appError_1.AppError.notFound('Member not found in workspace');
        }
        // Cannot change owner role
        if (targetMember.role === 'owner') {
            throw appError_1.AppError.badRequest('Cannot change workspace owner role');
        }
        const updated = await this.workspaceRepository.updateMemberRole(workspaceId, memberUserId, role);
        if (!updated) {
            throw appError_1.AppError.internal('Failed to update member role');
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
    async sendWorkspaceInviteNotification(userId, workspaceName, role) {
        try {
            if (!this.notificationCollection)
                return; // No provider (e.g. test env)
            await this.notificationCollection.create({
                userId,
                title: 'Joined Workspace',
                message: `You have been added to the workspace "${workspaceName}" as ${role}.`,
                read: false,
                type: 'workspace_invite'
            });
        }
        catch {
            // Swallow — notification is best-effort
        }
    }
    async listMembers(workspaceId, callerId) {
        // Check if caller has membership
        const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
        if (!callerMember) {
            throw appError_1.AppError.forbidden('Unauthorized access to workspace data');
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
    async listWorkspacesForUser(userId) {
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
    async removeMember(workspaceId, targetUserId, callerId) {
        // Check if workspace exists
        const workspace = await this.workspaceRepository.findWorkspaceById(workspaceId);
        if (!workspace)
            throw appError_1.AppError.notFound('Workspace not found');
        const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
        if (!callerMember)
            throw appError_1.AppError.forbidden('Unauthorized access to workspace');
        const targetMember = await this.workspaceRepository.findMember(workspaceId, targetUserId);
        if (!targetMember)
            throw appError_1.AppError.notFound('Member not found in workspace');
        if (targetMember.role === 'owner') {
            throw appError_1.AppError.badRequest('Cannot remove the workspace Owner');
        }
        // Role hierarchies checks
        if (callerMember.role === 'admin' && targetMember.role === 'admin') {
            throw appError_1.AppError.forbidden('Admins cannot remove other Admins or Owners');
        }
        if (callerMember.role !== 'owner' && callerMember.role !== 'admin' && callerId !== targetUserId) {
            throw appError_1.AppError.forbidden('Insufficient permissions to remove member');
        }
        await this.workspaceRepository.removeMember(workspaceId, targetUserId);
        return true;
    }
}
exports.WorkspaceService = WorkspaceService;
exports.default = WorkspaceService;

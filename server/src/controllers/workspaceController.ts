import { Response } from 'express';
import { db } from '../database/db';
import { AuthenticatedRequest } from '../middleware/auth';
import { WorkspaceRole } from '../types';

export const WorkspaceController = {
  createWorkspace: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { name } = req.body;
      if (!name) return res.status(400).json({ message: 'Workspace name is required' });

      const workspace = await db.workspaces.create({
        name,
        ownerId: userId
      });

      // Add user as Owner member
      await db.workspaceMembers.create({
        workspaceId: workspace._id,
        userId,
        role: 'owner'
      });

      // Log activity
      await db.activityLogs.create({
        userId,
        workspaceId: workspace._id,
        action: 'WORKSPACE_CREATED',
        details: `Created workspace "${name}"`
      });

      return res.status(201).json({
        id: workspace._id,
        name: workspace.name,
        role: 'owner'
      });
    } catch (error) {
      console.error('Create workspace error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  listWorkspaces: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const memberships = await db.workspaceMembers.find({ userId });
      const workspacesList = [];

      for (const member of memberships) {
        const workspace = await db.workspaces.findById(member.workspaceId);
        if (workspace) {
          workspacesList.push({
            id: workspace._id,
            name: workspace.name,
            role: member.role,
            ownerId: workspace.ownerId
          });
        }
      }

      return res.json(workspacesList);
    } catch (error) {
      console.error('List workspaces error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  inviteMember: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { workspaceId, email, role } = req.body;
      if (!workspaceId || !email || !role) {
        return res.status(400).json({ message: 'WorkspaceId, email, and role are required' });
      }

      // Check caller's role in the workspace (only owner or admin can invite)
      const callerMembership = await db.workspaceMembers.findOne({ workspaceId, userId });
      if (!callerMembership || (callerMembership.role !== 'owner' && callerMembership.role !== 'admin')) {
        return res.status(403).json({ message: 'Permissions denied. Only Owner or Admin can invite members' });
      }

      // Find user to invite
      const userToInvite = await db.users.findOne({ email: email.toLowerCase() });
      if (!userToInvite) {
        return res.status(404).json({ message: 'No registered user found with this email' });
      }

      // Check if already in workspace
      const existingMember = await db.workspaceMembers.findOne({ workspaceId, userId: userToInvite._id });
      if (existingMember) {
        return res.status(400).json({ message: 'User is already a member of this workspace' });
      }

      // Add member
      const newMember = await db.workspaceMembers.create({
        workspaceId,
        userId: userToInvite._id,
        role: role as WorkspaceRole
      });

      // Send notification to the invited user
      const workspace = await db.workspaces.findById(workspaceId);
      await db.notifications.create({
        userId: userToInvite._id,
        title: 'Joined Workspace',
        message: `You have been added to the workspace "${workspace?.name}" as ${role}.`,
        read: false,
        type: 'workspace_invite'
      });

      return res.status(201).json(newMember);
    } catch (error) {
      console.error('Invite member error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  updateRole: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { workspaceId, memberUserId, role } = req.body;
      if (!workspaceId || !memberUserId || !role) {
        return res.status(400).json({ message: 'WorkspaceId, memberUserId, and role are required' });
      }

      // Check caller's role (only owner can change roles)
      const callerMembership = await db.workspaceMembers.findOne({ workspaceId, userId });
      if (!callerMembership || callerMembership.role !== 'owner') {
        return res.status(403).json({ message: 'Only workspace Owner can update member roles' });
      }

      // Check target membership
      const targetMembership = await db.workspaceMembers.findOne({ workspaceId, userId: memberUserId });
      if (!targetMembership) {
        return res.status(404).json({ message: 'Member not found in this workspace' });
      }

      if (targetMembership.role === 'owner') {
        return res.status(400).json({ message: 'Cannot change workspace owner role' });
      }

      const updated = await db.workspaceMembers.updateOne(
        { workspaceId, userId: memberUserId },
        { $set: { role } }
      );

      return res.json(updated);
    } catch (error) {
      console.error('Update member role error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  removeMember: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { workspaceId, memberUserId } = req.body;
      if (!workspaceId || !memberUserId) {
        return res.status(400).json({ message: 'WorkspaceId and memberUserId are required' });
      }

      // Check caller's role (only owner or admin can remove, admin cannot remove owners/admins)
      const callerMembership = await db.workspaceMembers.findOne({ workspaceId, userId });
      if (!callerMembership) {
        return res.status(403).json({ message: 'Unauthorized access to workspace' });
      }

      const targetMembership = await db.workspaceMembers.findOne({ workspaceId, userId: memberUserId });
      if (!targetMembership) {
        return res.status(404).json({ message: 'Member not found' });
      }

      if (targetMembership.role === 'owner') {
        return res.status(400).json({ message: 'Cannot remove the workspace Owner' });
      }

      // Admins can only remove Editors and Viewers
      if (callerMembership.role === 'admin' && (targetMembership.role === 'admin' || targetMembership.role === 'owner')) {
        return res.status(403).json({ message: 'Admins cannot remove other Admins or Owners' });
      }

      if (callerMembership.role !== 'owner' && callerMembership.role !== 'admin' && userId !== memberUserId) {
        return res.status(403).json({ message: 'Permissions denied to remove member' });
      }

      await db.workspaceMembers.deleteOne({ workspaceId, userId: memberUserId });
      return res.json({ message: 'Member removed from workspace successfully' });
    } catch (error) {
      console.error('Remove member error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  getWorkspaceMembers: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { workspaceId } = req.params;

      // Verify user is member of this workspace
      const callerMembership = await db.workspaceMembers.findOne({ workspaceId, userId });
      if (!callerMembership) {
        return res.status(403).json({ message: 'Unauthorized access to workspace' });
      }

      const memberships = await db.workspaceMembers.find({ workspaceId });
      const membersList = [];

      for (const member of memberships) {
        const userObj = await db.users.findById(member.userId);
        if (userObj) {
          membersList.push({
            userId: userObj._id,
            fullName: userObj.fullName,
            email: userObj.email,
            avatarUrl: userObj.avatarUrl,
            role: member.role,
            joinedAt: member.createdAt
          });
        }
      }

      return res.json(membersList);
    } catch (error) {
      console.error('Get workspace members error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
};

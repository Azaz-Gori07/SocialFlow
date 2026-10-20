import { Router } from 'express';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { WorkspaceRepository } from './workspace.repository';
import { UserRepository } from '../user/user.repository';
import { validate } from '../../shared/middleware/validate.middleware';
import { authenticate, requireRole } from '../../shared/middleware/rbac.middleware';
import { createWorkspaceSchema, inviteMemberSchema, updateRoleSchema, updateWorkspaceSchema, updateSettingsSchema } from './workspace.validation';
import { db } from '../../database/db';

const router = Router();

// Instantiate dependency graph
const userRepository = new UserRepository();
const workspaceRepository = new WorkspaceRepository();
const workspaceService = new WorkspaceService(workspaceRepository, userRepository);
// P1.3: Inject notification collection for workspace invite notifications
workspaceService.notificationCollection = db.notifications;
const workspaceController = new WorkspaceController(workspaceService);

// Workspace Endpoints
router.post(
  '/',
  authenticate as any,
  validate({ body: createWorkspaceSchema }),
  workspaceController.create as any
);

router.get(
  '/list',
  authenticate as any,
  workspaceController.listWorkspaces as any
);

router.get(
  '/',
  authenticate as any,
  workspaceController.listWorkspaces as any
);

router.post(
  '/invite',
  authenticate as any,
  validate({ body: inviteMemberSchema }),
  requireRole(['owner', 'admin']) as any,
  workspaceController.invite as any
);

router.get(
  '/:workspaceId/members',
  authenticate as any,
  requireRole(['owner', 'admin', 'editor', 'viewer']) as any,
  workspaceController.listMembers as any
);

router.delete(
  '/:workspaceId/member',
  authenticate as any,
  requireRole(['owner', 'admin']) as any, // P1: editors cannot remove members
  workspaceController.removeMember as any
);

// P1.2: Update member role (owner only)
router.put(
  '/role',
  authenticate as any,
  validate({ body: updateRoleSchema }),
  requireRole(['owner']) as any,
  workspaceController.updateRole as any
);

// Workspace settings, API key, and data export
router.patch(
  '/:workspaceId',
  authenticate as any,
  validate({ body: updateWorkspaceSchema }),
  requireRole(['owner', 'admin']) as any,
  workspaceController.updateWorkspace as any
);

router.get(
  '/:workspaceId/settings',
  authenticate as any,
  requireRole(['owner', 'admin']) as any,
  workspaceController.getSettings as any
);

router.put(
  '/:workspaceId/settings',
  authenticate as any,
  validate({ body: updateSettingsSchema }),
  requireRole(['owner', 'admin']) as any,
  workspaceController.updateSettings as any
);

router.get(
  '/:workspaceId/api-key',
  authenticate as any,
  requireRole(['owner']) as any,
  workspaceController.getApiKey as any
);

router.post(
  '/:workspaceId/api-key',
  authenticate as any,
  requireRole(['owner']) as any,
  workspaceController.createApiKey as any
);

router.delete(
  '/:workspaceId/api-key',
  authenticate as any,
  requireRole(['owner']) as any,
  workspaceController.revokeApiKey as any
);

router.get(
  '/:workspaceId/export',
  authenticate as any,
  requireRole(['owner', 'admin']) as any,
  workspaceController.exportWorkspace as any
);

export default router;
export { workspaceController, workspaceService, workspaceRepository };

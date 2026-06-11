import { Response, NextFunction } from 'express';
import { WorkspaceService } from './workspace.service';
import { ApiResponse } from '../../shared/utils/response.util';
import { AuthenticatedRequest as AuthenticatedUserRequest } from '../../shared/middleware/rbac.middleware';
import { AppError } from '../../shared/errors/appError';

export class WorkspaceController {
  constructor(private workspaceService: WorkspaceService) {}

  create = async (req: AuthenticatedUserRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }
      
      const { name } = req.body;
      const workspace = await this.workspaceService.createWorkspace(name, req.user.id);
      
      return ApiResponse.success(res, workspace, 'Workspace created successfully', 201);
    } catch (error) {
      next(error);
    }
  };

  invite = async (req: AuthenticatedUserRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const invitation = await this.workspaceService.inviteMember(req.body, req.user.id);
      return ApiResponse.success(res, invitation, 'Member invited successfully', 201);
    } catch (error) {
      next(error);
    }
  };

  listMembers = async (req: AuthenticatedUserRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const { workspaceId } = req.params;
      const members = await this.workspaceService.listMembers(workspaceId, req.user.id);
      
      return ApiResponse.success(res, members, 'Workspace members roster retrieved', 200);
    } catch (error) {
      next(error);
    }
  };

  listWorkspaces = async (req: AuthenticatedUserRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const workspaces = await this.workspaceService.listWorkspacesForUser(req.user.id);
      return ApiResponse.success(res, workspaces, 'Workspaces list retrieved', 200);
    } catch (error) {
      next(error);
    }
  };

  removeMember = async (req: AuthenticatedUserRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const { workspaceId } = req.params;
      const { userId } = req.body;

      if (!userId) {
        return next(AppError.badRequest('Target member userId is required'));
      }

      await this.workspaceService.removeMember(workspaceId, userId, req.user.id);
      return ApiResponse.success(res, null, 'Member removed from workspace successfully', 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update a member's role in the workspace (P1.2).
   * Frontend equivalent: api.workspaces.updateRole(workspaceId, memberUserId, role)
   */
  updateRole = async (req: AuthenticatedUserRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const result = await this.workspaceService.updateMemberRole(req.body, req.user.id);
      return ApiResponse.success(res, result, 'Member role updated successfully', 200);
    } catch (error) {
      next(error);
    }
  };
}
export default WorkspaceController;

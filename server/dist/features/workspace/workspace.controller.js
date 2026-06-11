"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceController = void 0;
const response_util_1 = require("../../shared/utils/response.util");
const appError_1 = require("../../shared/errors/appError");
class WorkspaceController {
    workspaceService;
    constructor(workspaceService) {
        this.workspaceService = workspaceService;
    }
    create = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const { name } = req.body;
            const workspace = await this.workspaceService.createWorkspace(name, req.user.id);
            return response_util_1.ApiResponse.success(res, workspace, 'Workspace created successfully', 201);
        }
        catch (error) {
            next(error);
        }
    };
    invite = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const invitation = await this.workspaceService.inviteMember(req.body, req.user.id);
            return response_util_1.ApiResponse.success(res, invitation, 'Member invited successfully', 201);
        }
        catch (error) {
            next(error);
        }
    };
    listMembers = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const { workspaceId } = req.params;
            const members = await this.workspaceService.listMembers(workspaceId, req.user.id);
            return response_util_1.ApiResponse.success(res, members, 'Workspace members roster retrieved', 200);
        }
        catch (error) {
            next(error);
        }
    };
    listWorkspaces = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const workspaces = await this.workspaceService.listWorkspacesForUser(req.user.id);
            return response_util_1.ApiResponse.success(res, workspaces, 'Workspaces list retrieved', 200);
        }
        catch (error) {
            next(error);
        }
    };
    removeMember = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const { workspaceId } = req.params;
            const { userId } = req.body;
            if (!userId) {
                return next(appError_1.AppError.badRequest('Target member userId is required'));
            }
            await this.workspaceService.removeMember(workspaceId, userId, req.user.id);
            return response_util_1.ApiResponse.success(res, null, 'Member removed from workspace successfully', 200);
        }
        catch (error) {
            next(error);
        }
    };
    /**
     * Update a member's role in the workspace (P1.2).
     * Frontend equivalent: api.workspaces.updateRole(workspaceId, memberUserId, role)
     */
    updateRole = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const result = await this.workspaceService.updateMemberRole(req.body, req.user.id);
            return response_util_1.ApiResponse.success(res, result, 'Member role updated successfully', 200);
        }
        catch (error) {
            next(error);
        }
    };
}
exports.WorkspaceController = WorkspaceController;
exports.default = WorkspaceController;

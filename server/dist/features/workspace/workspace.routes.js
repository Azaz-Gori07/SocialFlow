"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceRepository = exports.workspaceService = exports.workspaceController = void 0;
const express_1 = require("express");
const workspace_controller_1 = require("./workspace.controller");
const workspace_service_1 = require("./workspace.service");
const workspace_repository_1 = require("./workspace.repository");
const user_repository_1 = require("../user/user.repository");
const validate_middleware_1 = require("../../shared/middleware/validate.middleware");
const rbac_middleware_1 = require("../../shared/middleware/rbac.middleware");
const workspace_validation_1 = require("./workspace.validation");
const db_1 = require("../../database/db");
const router = (0, express_1.Router)();
// Instantiate dependency graph
const userRepository = new user_repository_1.UserRepository();
const workspaceRepository = new workspace_repository_1.WorkspaceRepository();
exports.workspaceRepository = workspaceRepository;
const workspaceService = new workspace_service_1.WorkspaceService(workspaceRepository, userRepository);
exports.workspaceService = workspaceService;
// P1.3: Inject notification collection for workspace invite notifications
workspaceService.notificationCollection = db_1.db.notifications;
const workspaceController = new workspace_controller_1.WorkspaceController(workspaceService);
exports.workspaceController = workspaceController;
// Workspace Endpoints
router.post('/', rbac_middleware_1.authenticate, (0, validate_middleware_1.validate)({ body: workspace_validation_1.createWorkspaceSchema }), workspaceController.create);
router.get('/list', rbac_middleware_1.authenticate, workspaceController.listWorkspaces);
router.post('/invite', rbac_middleware_1.authenticate, (0, validate_middleware_1.validate)({ body: workspace_validation_1.inviteMemberSchema }), (0, rbac_middleware_1.requireRole)(['owner', 'admin']), workspaceController.invite);
router.get('/:workspaceId/members', rbac_middleware_1.authenticate, (0, rbac_middleware_1.requireRole)(['owner', 'admin', 'editor', 'viewer']), workspaceController.listMembers);
router.delete('/:workspaceId/member', rbac_middleware_1.authenticate, (0, rbac_middleware_1.requireRole)(['owner', 'admin']), // P1: editors cannot remove members
workspaceController.removeMember);
// P1.2: Update member role (owner only)
router.put('/role', rbac_middleware_1.authenticate, (0, validate_middleware_1.validate)({ body: workspace_validation_1.updateRoleSchema }), (0, rbac_middleware_1.requireRole)(['owner']), workspaceController.updateRole);
exports.default = router;

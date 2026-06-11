"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const appError_1 = require("../errors/appError");
const env_config_1 = require("../config/env.config");
const mongoose_1 = __importDefault(require("mongoose"));
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(appError_1.AppError.unauthorized('Access token required'));
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, env_config_1.env.JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch (error) {
        return next(appError_1.AppError.unauthorized('Invalid or expired access token'));
    }
}
// Enforce workspace member role constraints (RBAC)
function requireRole(allowedRoles) {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized('Authentication context required'));
            }
            // Locate workspaceId in request body, query params, or URL path parameters
            const workspaceId = req.params.workspaceId || req.body.workspaceId || req.query.workspaceId;
            if (!workspaceId) {
                return next(appError_1.AppError.badRequest('Workspace ID is required for this operation'));
            }
            // Check member role dynamically via direct DB query on WorkspaceMember collection
            const WorkspaceMemberModel = mongoose_1.default.model('WorkspaceMember');
            const member = await WorkspaceMemberModel.findOne({
                workspaceId: workspaceId.toString(),
                userId: req.user.id
            }).exec();
            if (!member) {
                return next(appError_1.AppError.forbidden('Access denied. You are not a member of this workspace.'));
            }
            if (!allowedRoles.includes(member.role)) {
                return next(appError_1.AppError.forbidden(`Access denied. Insufficient permissions. Required one of: [${allowedRoles.join(', ')}]`));
            }
            next();
        }
        catch (error) {
            next(error);
        }
    };
}

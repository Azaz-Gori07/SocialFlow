"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCommentsQuerySchema = exports.listPostsQuerySchema = exports.listWorkspaceQuerySchema = exports.updateRoleSchema = exports.inviteMemberSchema = exports.createWorkspaceSchema = void 0;
const zod_1 = require("zod");
exports.createWorkspaceSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Workspace name must be at least 2 characters long').max(50, 'Workspace name cannot exceed 50 characters')
});
exports.inviteMemberSchema = zod_1.z.object({
    workspaceId: zod_1.z.string().min(1, 'Workspace ID is required'),
    email: zod_1.z.string().email('Invalid email address format'),
    role: zod_1.z.enum(['admin', 'editor', 'viewer'], {
        message: "Role must be one of: 'admin', 'editor', or 'viewer'"
    })
});
exports.updateRoleSchema = zod_1.z.object({
    workspaceId: zod_1.z.string().min(1, 'Workspace ID is required'),
    memberUserId: zod_1.z.string().min(1, 'Member user ID is required'),
    role: zod_1.z.enum(['admin', 'editor', 'viewer'], {
        message: "Role must be one of: 'admin', 'editor', or 'viewer'"
    })
});
exports.listWorkspaceQuerySchema = zod_1.z.object({
    limit: zod_1.z.string().optional().transform((val) => {
        if (!val)
            return 50;
        const parsed = parseInt(val, 10);
        return isNaN(parsed) || parsed < 1 ? 50 : Math.min(parsed, 200);
    }),
    offset: zod_1.z.string().optional().transform((val) => {
        if (!val)
            return 0;
        const parsed = parseInt(val, 10);
        return isNaN(parsed) || parsed < 0 ? 0 : parsed;
    })
});
exports.listPostsQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(['draft', 'scheduled', 'published', 'failed']).optional(),
    limit: zod_1.z.string().optional().transform((val) => {
        if (!val)
            return 50;
        const parsed = parseInt(val, 10);
        return isNaN(parsed) || parsed < 1 ? 50 : Math.min(parsed, 200);
    }),
    offset: zod_1.z.string().optional().transform((val) => {
        if (!val)
            return 0;
        const parsed = parseInt(val, 10);
        return isNaN(parsed) || parsed < 0 ? 0 : parsed;
    })
});
exports.listCommentsQuerySchema = zod_1.z.object({
    platform: zod_1.z.string().optional(),
    status: zod_1.z.enum(['unresolved', 'resolved']).optional(),
    limit: zod_1.z.string().optional().transform((val) => {
        if (!val)
            return 50;
        const parsed = parseInt(val, 10);
        return isNaN(parsed) || parsed < 1 ? 50 : Math.min(parsed, 200);
    }),
    offset: zod_1.z.string().optional().transform((val) => {
        if (!val)
            return 0;
        const parsed = parseInt(val, 10);
        return isNaN(parsed) || parsed < 0 ? 0 : parsed;
    })
});

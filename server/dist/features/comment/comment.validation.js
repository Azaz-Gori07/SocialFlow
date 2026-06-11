"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestReplySchema = exports.assignCommentSchema = exports.resolveCommentSchema = exports.replyCommentSchema = exports.listCommentsQuerySchema = void 0;
const zod_1 = require("zod");
exports.listCommentsQuerySchema = zod_1.z.object({
    workspaceId: zod_1.z.string().min(1, 'Workspace ID is required'),
    platform: zod_1.z.enum(['twitter', 'instagram', 'facebook', 'linkedin', 'youtube', 'tiktok']).optional(),
    status: zod_1.z.enum(['unresolved', 'resolved']).optional(),
    assignedTo: zod_1.z.string().optional()
});
exports.replyCommentSchema = zod_1.z.object({
    workspaceId: zod_1.z.string().min(1, 'Workspace ID is required'),
    commentId: zod_1.z.string().min(1, 'Comment ID is required'),
    message: zod_1.z.string().min(1, 'Message cannot be empty')
});
exports.resolveCommentSchema = zod_1.z.object({
    workspaceId: zod_1.z.string().min(1, 'Workspace ID is required'),
    status: zod_1.z.enum(['unresolved', 'resolved'])
});
exports.assignCommentSchema = zod_1.z.object({
    workspaceId: zod_1.z.string().min(1, 'Workspace ID is required'),
    assignedTo: zod_1.z.string().min(1, 'Assigned user ID is required')
});
exports.suggestReplySchema = zod_1.z.object({
    workspaceId: zod_1.z.string().min(1, 'Workspace ID is required'),
    commentId: zod_1.z.string().min(1, 'Comment ID is required')
});

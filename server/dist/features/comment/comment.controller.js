"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentController = void 0;
const response_util_1 = require("../../shared/utils/response.util");
const appError_1 = require("../../shared/errors/appError");
class CommentController {
    commentService;
    constructor(commentService) {
        this.commentService = commentService;
    }
    list = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const { workspaceId, platform, status, assignedTo } = req.query;
            const comments = await this.commentService.listComments(workspaceId, req.user.id, {
                workspaceId,
                platform,
                status,
                assignedTo
            });
            return response_util_1.ApiResponse.success(res, comments, 'Comments retrieved successfully', 200);
        }
        catch (error) {
            next(error);
        }
    };
    reply = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const { commentId, message, workspaceId } = req.body;
            const updatedComment = await this.commentService.replyToComment(commentId, message, workspaceId, req.user.id);
            return response_util_1.ApiResponse.success(res, updatedComment, 'Reply submitted successfully', 200);
        }
        catch (error) {
            next(error);
        }
    };
    resolve = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const { id } = req.params;
            const { status, workspaceId } = req.body;
            const updatedComment = await this.commentService.resolveComment(id, status, workspaceId, req.user.id);
            return response_util_1.ApiResponse.success(res, updatedComment, `Comment status updated to ${status}`, 200);
        }
        catch (error) {
            next(error);
        }
    };
    assign = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const { id } = req.params;
            const { assignedTo, workspaceId } = req.body;
            const updatedComment = await this.commentService.assignComment(id, assignedTo, workspaceId, req.user.id);
            return response_util_1.ApiResponse.success(res, updatedComment, 'Comment assigned successfully', 200);
        }
        catch (error) {
            next(error);
        }
    };
    suggestReply = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const { commentId, workspaceId } = req.body;
            const suggestions = await this.commentService.suggestReply(commentId, workspaceId, req.user.id);
            return response_util_1.ApiResponse.success(res, suggestions, 'AI reply suggestions generated', 200);
        }
        catch (error) {
            next(error);
        }
    };
}
exports.CommentController = CommentController;
exports.default = CommentController;

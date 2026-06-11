import { Response, NextFunction } from 'express';
import { CommentService } from './comment.service';
import { ApiResponse } from '../../shared/utils/response.util';
import { AuthenticatedRequest } from '../../shared/middleware/rbac.middleware';
import { AppError } from '../../shared/errors/appError';

export class CommentController {
  constructor(private commentService: CommentService) {}

  list = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const { workspaceId, platform, status, assignedTo } = req.query as any;
      const comments = await this.commentService.listComments(workspaceId, req.user.id, {
        workspaceId,
        platform,
        status,
        assignedTo
      });

      return ApiResponse.success(res, comments, 'Comments retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  };

  reply = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const { commentId, message, workspaceId } = req.body;
      const updatedComment = await this.commentService.replyToComment(
        commentId,
        message,
        workspaceId,
        req.user.id
      );

      return ApiResponse.success(res, updatedComment, 'Reply submitted successfully', 200);
    } catch (error) {
      next(error);
    }
  };

  resolve = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const { id } = req.params;
      const { status, workspaceId } = req.body;

      const updatedComment = await this.commentService.resolveComment(
        id,
        status,
        workspaceId,
        req.user.id
      );

      return ApiResponse.success(res, updatedComment, `Comment status updated to ${status}`, 200);
    } catch (error) {
      next(error);
    }
  };

  assign = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const { id } = req.params;
      const { assignedTo, workspaceId } = req.body;

      const updatedComment = await this.commentService.assignComment(
        id,
        assignedTo,
        workspaceId,
        req.user.id
      );

      return ApiResponse.success(res, updatedComment, 'Comment assigned successfully', 200);
    } catch (error) {
      next(error);
    }
  };

  suggestReply = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const { commentId, workspaceId } = req.body;
      const suggestions = await this.commentService.suggestReply(
        commentId,
        workspaceId,
        req.user.id
      );

      return ApiResponse.success(res, suggestions, 'AI reply suggestions generated', 200);
    } catch (error) {
      next(error);
    }
  };
}
export default CommentController;

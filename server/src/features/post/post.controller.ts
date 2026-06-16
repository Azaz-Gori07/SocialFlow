import { Response, NextFunction } from 'express';
import { PostService } from './post.service';
import { ApiResponse } from '../../shared/utils/response.util';
import { AuthenticatedRequest as AuthenticatedUserRequest } from '../../shared/middleware/rbac.middleware';
import { AppError } from '../../shared/errors/appError';

export class PostController {
  constructor(private postService: PostService) {}

  create = async (req: AuthenticatedUserRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const post = await this.postService.createPost(req.body, req.user.id);
      return ApiResponse.success(res, post, 'Post created successfully', 201);
    } catch (error) {
      next(error);
    }
  };

  list = async (req: AuthenticatedUserRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      // P1.7: Pagination support
      const limit = Math.max(1, Math.min(parseInt(req.query.limit as string, 10) || 50, 200));
      const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);
      const status = req.query.status as string | undefined;

      const result = await this.postService.listPostsPaginated(req.user.id, { limit, offset, status });
      return ApiResponse.success(res, result, 'User posts retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  get = async (req: AuthenticatedUserRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const { id } = req.params;
      const post = await this.postService.getPost(id, req.user.id);
      return ApiResponse.success(res, post, 'Post retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  update = async (req: AuthenticatedUserRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const { id } = req.params;
      const post = await this.postService.updatePost(id, req.body, req.user.id);
      return ApiResponse.success(res, post, 'Post updated successfully');
    } catch (error) {
      next(error);
    }
  };

  bulkSchedule = async (req: AuthenticatedUserRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { posts } = req.body;
      if (!Array.isArray(posts) || posts.length === 0) {
        return next(AppError.badRequest('Request body must contain a non-empty "posts" array'));
      }
      const results = await this.postService.bulkCreatePosts(posts, req.user.id);
      return ApiResponse.success(res, results, 'Posts scheduled successfully', 201);
    } catch (error) { next(error); }
  };

  delete = async (req: AuthenticatedUserRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const { id } = req.params;
      await this.postService.deletePost(id, req.user.id);
      return ApiResponse.success(res, null, 'Post deleted successfully');
    } catch (error) {
      next(error);
    }
  };
}
export default PostController;

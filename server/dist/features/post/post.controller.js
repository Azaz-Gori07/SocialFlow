"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostController = void 0;
const response_util_1 = require("../../shared/utils/response.util");
const appError_1 = require("../../shared/errors/appError");
class PostController {
    postService;
    constructor(postService) {
        this.postService = postService;
    }
    create = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const post = await this.postService.createPost(req.body, req.user.id);
            return response_util_1.ApiResponse.success(res, post, 'Post created successfully', 201);
        }
        catch (error) {
            next(error);
        }
    };
    list = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            // P1.7: Pagination support
            const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 50, 200));
            const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
            const status = req.query.status;
            const result = await this.postService.listPostsPaginated(req.user.id, { limit, offset, status });
            return response_util_1.ApiResponse.success(res, result, 'User posts retrieved successfully');
        }
        catch (error) {
            next(error);
        }
    };
    get = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const { id } = req.params;
            const post = await this.postService.getPost(id, req.user.id);
            return response_util_1.ApiResponse.success(res, post, 'Post retrieved successfully');
        }
        catch (error) {
            next(error);
        }
    };
    update = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const { id } = req.params;
            const post = await this.postService.updatePost(id, req.body, req.user.id);
            return response_util_1.ApiResponse.success(res, post, 'Post updated successfully');
        }
        catch (error) {
            next(error);
        }
    };
    delete = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const { id } = req.params;
            await this.postService.deletePost(id, req.user.id);
            return response_util_1.ApiResponse.success(res, null, 'Post deleted successfully');
        }
        catch (error) {
            next(error);
        }
    };
}
exports.PostController = PostController;
exports.default = PostController;

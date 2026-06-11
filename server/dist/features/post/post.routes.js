"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postRepository = exports.postService = exports.postController = void 0;
const express_1 = require("express");
const post_controller_1 = require("./post.controller");
const post_service_1 = require("./post.service");
const post_repository_1 = require("./post.repository");
const validate_middleware_1 = require("../../shared/middleware/validate.middleware");
const rbac_middleware_1 = require("../../shared/middleware/rbac.middleware");
const post_validation_1 = require("./post.validation");
const router = (0, express_1.Router)();
// Instantiate dependency graph
const postRepository = new post_repository_1.PostRepository();
exports.postRepository = postRepository;
const postService = new post_service_1.PostService(postRepository);
exports.postService = postService;
const postController = new post_controller_1.PostController(postService);
exports.postController = postController;
// POST /api/posts - Create draft or schedule post
router.post('/', rbac_middleware_1.authenticate, (0, validate_middleware_1.validate)({ body: post_validation_1.createPostSchema }), postController.create);
// GET /api/posts/list - Retrieve all user posts
router.get('/list', rbac_middleware_1.authenticate, postController.list);
// GET /api/posts/:id - Retrieve single post details
router.get('/:id', rbac_middleware_1.authenticate, (0, validate_middleware_1.validate)({ params: post_validation_1.postIdSchema }), postController.get);
// PUT /api/posts/:id - Update post content or schedule
router.put('/:id', rbac_middleware_1.authenticate, (0, validate_middleware_1.validate)({
    params: post_validation_1.postIdSchema,
    body: post_validation_1.updatePostSchema
}), postController.update);
// DELETE /api/posts/:id - Cancel schedule and delete post
router.delete('/:id', rbac_middleware_1.authenticate, (0, validate_middleware_1.validate)({ params: post_validation_1.postIdSchema }), postController.delete);
exports.default = router;

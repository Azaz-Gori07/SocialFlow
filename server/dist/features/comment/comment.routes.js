"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commentRepository = exports.commentService = exports.commentController = void 0;
const express_1 = require("express");
const comment_controller_1 = require("./comment.controller");
const comment_service_1 = require("./comment.service");
const comment_repository_1 = require("./comment.repository");
const workspace_repository_1 = require("../workspace/workspace.repository");
const social_repository_1 = require("../social/social.repository");
const user_repository_1 = require("../user/user.repository");
const validate_middleware_1 = require("../../shared/middleware/validate.middleware");
const rbac_middleware_1 = require("../../shared/middleware/rbac.middleware");
const comment_validation_1 = require("./comment.validation");
const router = (0, express_1.Router)();
// Instantiate dependency graph
const commentRepository = new comment_repository_1.CommentRepository();
exports.commentRepository = commentRepository;
const workspaceRepository = new workspace_repository_1.WorkspaceRepository();
const socialRepository = new social_repository_1.SocialRepository();
const userRepository = new user_repository_1.UserRepository();
const commentService = new comment_service_1.CommentService(commentRepository, workspaceRepository, socialRepository, userRepository);
exports.commentService = commentService;
const commentController = new comment_controller_1.CommentController(commentService);
exports.commentController = commentController;
// 1. Fetch inbox comments (filters supported: platform, status, assignedTo)
router.get('/', rbac_middleware_1.authenticate, (0, validate_middleware_1.validate)({ query: comment_validation_1.listCommentsQuerySchema }), (0, rbac_middleware_1.requireRole)(['owner', 'admin', 'editor', 'viewer']), commentController.list);
// 2. Submit a reply to a comment
router.post('/reply', rbac_middleware_1.authenticate, (0, validate_middleware_1.validate)({ body: comment_validation_1.replyCommentSchema }), (0, rbac_middleware_1.requireRole)(['owner', 'admin', 'editor']), commentController.reply);
// 3. Mark resolved / unresolved
router.put('/resolve/:id', rbac_middleware_1.authenticate, (0, validate_middleware_1.validate)({ body: comment_validation_1.resolveCommentSchema }), (0, rbac_middleware_1.requireRole)(['owner', 'admin', 'editor']), commentController.resolve);
// 4. Assign to teammate
router.put('/assign/:id', rbac_middleware_1.authenticate, (0, validate_middleware_1.validate)({ body: comment_validation_1.assignCommentSchema }), (0, rbac_middleware_1.requireRole)(['owner', 'admin', 'editor']), commentController.assign);
// 5. Request AI suggestions
router.post('/ai-suggestions', rbac_middleware_1.authenticate, (0, validate_middleware_1.validate)({ body: comment_validation_1.suggestReplySchema }), (0, rbac_middleware_1.requireRole)(['owner', 'admin', 'editor', 'viewer']), commentController.suggestReply);
exports.default = router;

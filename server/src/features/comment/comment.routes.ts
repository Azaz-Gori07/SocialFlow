import { Router } from 'express';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { CommentRepository } from './comment.repository';
import { WorkspaceRepository } from '../workspace/workspace.repository';
import { SocialRepository } from '../social/social.repository';
import { UserRepository } from '../user/user.repository';
import { validate } from '../../shared/middleware/validate.middleware';
import { authenticate, requireRole } from '../../shared/middleware/rbac.middleware';
import {
  listCommentsQuerySchema,
  replyCommentSchema,
  resolveCommentSchema,
  assignCommentSchema,
  suggestReplySchema
} from './comment.validation';

const router = Router();

// Instantiate dependency graph
const commentRepository = new CommentRepository();
const workspaceRepository = new WorkspaceRepository();
const socialRepository = new SocialRepository();
const userRepository = new UserRepository();

const commentService = new CommentService(
  commentRepository,
  workspaceRepository,
  socialRepository,
  userRepository
);
const commentController = new CommentController(commentService);

// 1. Fetch inbox comments (filters supported: platform, status, assignedTo)
router.get(
  '/',
  authenticate as any,
  validate({ query: listCommentsQuerySchema }),
  requireRole(['owner', 'admin', 'editor', 'viewer']) as any,
  commentController.list as any
);

// 2. Submit a reply to a comment
router.post(
  '/reply',
  authenticate as any,
  validate({ body: replyCommentSchema }),
  requireRole(['owner', 'admin', 'editor']) as any,
  commentController.reply as any
);

// 3. Mark resolved / unresolved
router.put(
  '/resolve/:id',
  authenticate as any,
  validate({ body: resolveCommentSchema }),
  requireRole(['owner', 'admin', 'editor']) as any,
  commentController.resolve as any
);

// 4. Assign to teammate
router.put(
  '/assign/:id',
  authenticate as any,
  validate({ body: assignCommentSchema }),
  requireRole(['owner', 'admin', 'editor']) as any,
  commentController.assign as any
);

// 5. Request AI suggestions
router.post(
  '/ai-suggestions',
  authenticate as any,
  validate({ body: suggestReplySchema }),
  requireRole(['owner', 'admin', 'editor', 'viewer']) as any,
  commentController.suggestReply as any
);

export default router;
export { commentController, commentService, commentRepository };

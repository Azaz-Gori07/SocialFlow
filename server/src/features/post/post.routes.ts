import { Router } from 'express';
import { PostController } from './post.controller';
import { PostService } from './post.service';
import { PostRepository } from './post.repository';
import { validate } from '../../shared/middleware/validate.middleware';
import { authenticate } from '../../shared/middleware/rbac.middleware';
import { createPostSchema, updatePostSchema, postIdSchema } from './post.validation';

const router = Router();

// Instantiate dependency graph
const postRepository = new PostRepository();
const postService = new PostService(postRepository);
const postController = new PostController(postService);

// POST /api/posts - Create draft or schedule post
router.post(
  '/',
  authenticate as any,
  validate({ body: createPostSchema }),
  postController.create as any
);

// GET /api/posts/list - Retrieve all user posts
router.get(
  '/list',
  authenticate as any,
  postController.list as any
);

// GET /api/posts/:id - Retrieve single post details
router.get(
  '/:id',
  authenticate as any,
  validate({ params: postIdSchema }),
  postController.get as any
);

// PUT /api/posts/:id - Update post content or schedule
router.put(
  '/:id',
  authenticate as any,
  validate({ 
    params: postIdSchema,
    body: updatePostSchema 
  }),
  postController.update as any
);

// DELETE /api/posts/:id - Cancel schedule and delete post
router.delete(
  '/:id',
  authenticate as any,
  validate({ params: postIdSchema }),
  postController.delete as any
);

export default router;
export { postController, postService, postRepository };

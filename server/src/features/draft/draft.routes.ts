import { Router } from 'express';
import { DraftController } from './draft.controller';
import { DraftService } from './draft.service';
import { DraftRepository } from './draft.repository';
import { validate } from '../../shared/middleware/validate.middleware';
import { authenticate } from '../../shared/middleware/rbac.middleware';
import {
  createDraftSchema,
  updateDraftSchema,
  uploadMediaSchema,
  publishDraftSchema,
  draftIdSchema
} from './draft.validation';

const router = Router();

// Instantiate dependency graph
const draftRepository = new DraftRepository();
const draftService = new DraftService(draftRepository);
const draftController = new DraftController(draftService);

// POST /api/drafts - Create a new draft
router.post(
  '/',
  authenticate as any,
  validate({ body: createDraftSchema }),
  draftController.create as any
);

// GET /api/drafts - List drafts with filtering and pagination
router.get(
  '/',
  authenticate as any,
  draftController.list as any
);

// GET /api/drafts/:id - Get a specific draft
router.get(
  '/:id',
  authenticate as any,
  validate({ params: draftIdSchema }),
  draftController.get as any
);

// PUT /api/drafts/:id - Update draft
router.put(
  '/:id',
  authenticate as any,
  validate({
    params: draftIdSchema,
    body: updateDraftSchema
  }),
  draftController.update as any
);

// DELETE /api/drafts/:id - Delete draft
router.delete(
  '/:id',
  authenticate as any,
  validate({ params: draftIdSchema }),
  draftController.delete as any
);

// POST /api/drafts/:id/media - Upload media to draft
router.post(
  '/:id/media',
  authenticate as any,
  validate({
    params: draftIdSchema,
    body: uploadMediaSchema
  }),
  draftController.uploadMedia as any
);

// POST /api/drafts/:id/archive - Archive draft
router.post(
  '/:id/archive',
  authenticate as any,
  validate({ params: draftIdSchema }),
  draftController.archive as any
);

// POST /api/drafts/:id/queue - Queue draft for publishing
router.post(
  '/:id/queue',
  authenticate as any,
  validate({
    params: draftIdSchema,
    body: publishDraftSchema
  }),
  draftController.queue as any
);

// POST /api/drafts/:id/publish - Publish draft immediately
router.post(
  '/:id/publish',
  authenticate as any,
  validate({ params: draftIdSchema }),
  draftController.publish as any
);

// POST /api/drafts/:id/retry - Retry failed draft
router.post(
  '/:id/retry',
  authenticate as any,
  validate({ params: draftIdSchema }),
  draftController.retry as any
);

// GET /api/drafts/:id/history - Get publish history
router.get(
  '/:id/history',
  authenticate as any,
  validate({ params: draftIdSchema }),
  draftController.history as any
);

export default router;
export { draftController, draftService, draftRepository };
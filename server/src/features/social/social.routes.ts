import { Router } from 'express';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { SocialRepository } from './social.repository';
import { validate } from '../../shared/middleware/validate.middleware';
import { authenticate } from '../../shared/middleware/rbac.middleware';
import { connectPlatformSchema, callbackSchema, accountIdSchema } from './social.validation';

const router = Router();

// Instantiate dependency graph
const socialRepository = new SocialRepository();
const socialService = new SocialService(socialRepository);
const socialController = new SocialController(socialService);

// GET /api/social/connect/:platform - Initiate OAuth connection
router.get(
  '/connect/:platform',
  authenticate as any,
  validate({ params: connectPlatformSchema }),
  socialController.connect as any
);

// GET /api/social/callback/:platform - Receive OAuth redirection
router.get(
  '/callback/:platform',
  validate({ 
    params: connectPlatformSchema 
  }),
  socialController.callback as any
);

// GET /api/social/accounts - Retrieve connected accounts list
router.get(
  '/accounts',
  authenticate as any,
  socialController.listAccounts as any
);

// DELETE /api/social/accounts/:id - Disconnect account
router.delete(
  '/accounts/:id',
  authenticate as any,
  validate({ params: accountIdSchema }),
  socialController.disconnect as any
);

export default router;
export { socialController, socialService, socialRepository };

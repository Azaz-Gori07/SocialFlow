import { Router } from 'express';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { SocialRepository } from './social.repository';
import { OAuthConnectionRepository } from './oauthConnection.repository';
import { OAuthTransactionRepository } from './oauthTransaction.repository';
import { validate } from '../../shared/middleware/validate.middleware';
import { authenticate } from '../../shared/middleware/rbac.middleware';
import {
  connectPlatformSchema,
  callbackSchema,
  accountIdSchema,
  connectionIdSchema,
  selectAccountSchema,
  updateAccountSchema,
} from './social.validation';

const router = Router();

const socialRepository = new SocialRepository();
const connectionRepository = new OAuthConnectionRepository();
const transactionRepository = new OAuthTransactionRepository();
const socialService = new SocialService(socialRepository, connectionRepository, transactionRepository);
const socialController = new SocialController(socialService);

// POST /api/social/connect/:platform — start a real OAuth flow
router.post(
  '/connect/:platform',
  authenticate as any,
  validate({ params: connectPlatformSchema }),
  socialController.connect as any
);

// GET /api/social/callback/:platform — provider redirect (public)
router.get(
  '/callback/:platform',
  validate({ params: connectPlatformSchema }),
  socialController.callback as any
);

// GET /api/social/accounts — connected accounts
router.get('/accounts', authenticate as any, socialController.listAccounts as any);

// GET /api/social/connections/:platform/discover — accounts the provider exposes
router.get(
  '/connections/:platform/discover',
  authenticate as any,
  validate({ params: connectPlatformSchema }),
  socialController.discover as any
);

// POST /api/social/accounts/select — persist a discovered provider account
router.post(
  '/accounts/select',
  authenticate as any,
  validate({ body: selectAccountSchema }),
  socialController.selectAccount as any
);

// POST /api/social/connections/:id/refresh — refresh provider tokens
router.post(
  '/connections/:id/refresh',
  authenticate as any,
  validate({ params: connectionIdSchema }),
  socialController.refresh as any
);

// PATCH /api/social/accounts/:id — account preferences (publishDefault)
router.patch(
  '/accounts/:id',
  authenticate as any,
  validate({ params: accountIdSchema, body: updateAccountSchema }),
  socialController.updateAccount as any
);

// DELETE /api/social/accounts/:id — disconnect
router.delete(
  '/accounts/:id',
  authenticate as any,
  validate({ params: accountIdSchema }),
  socialController.disconnect as any
);

export default router;
export { socialController, socialService, socialRepository, connectionRepository, transactionRepository };

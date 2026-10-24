import { Router, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { OtpRepository } from './otp.repository';
import { ZenuxsOAuthService } from './zenuxs-oauth.service';
import { UserRepository } from '../user/user.repository';
import { WorkspaceService } from '../workspace/workspace.service';
import { WorkspaceRepository } from '../workspace/workspace.repository';
import { validate } from '../../shared/middleware/validate.middleware';
import { authenticate } from '../../shared/middleware/rbac.middleware';
import { registerSchema, verifyOtpSchema, loginSchema, refreshSchema, exchangeCodeSchema, forgotPasswordSchema, resetPasswordSchema, updateProfileSchema, changePasswordSchema } from './auth.validation';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? 100 : 30,
  message: { message: 'Too many auth requests, please try again later.' }
});
const authLimiterHandler = authLimiter as unknown as RequestHandler;

// Separate bucket for refresh: multi-tab users/sessions refreshing tokens
// should not be starved by login rate-limits (S9).
const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? 100 : 60,
  message: { message: 'Too many session refreshes, please try again later.' }
});
const refreshLimiterHandler = refreshLimiter as unknown as RequestHandler;

const userRepository = new UserRepository();
const workspaceRepository = new WorkspaceRepository();
const workspaceService = new WorkspaceService(workspaceRepository, userRepository);

const otpRepository = new OtpRepository();
const otpService = new OtpService(otpRepository);
const zenuxsOAuthService = new ZenuxsOAuthService(userRepository);
const authService = new AuthService(userRepository, otpService, async (userId, name) => {
  return workspaceService.createWorkspace(name, userId);
});

const authController = new AuthController(authService, zenuxsOAuthService);

router.post('/register', authLimiterHandler, validate({ body: registerSchema }), authController.register as any);
router.post('/verify-otp', authLimiterHandler, validate({ body: verifyOtpSchema }), authController.verifyOtp as any);
router.post('/login', authLimiterHandler, validate({ body: loginSchema }), authController.login as any);
router.post('/forgot-password', authLimiterHandler, validate({ body: forgotPasswordSchema }), authController.forgotPassword as any);
router.post('/reset-password', authLimiterHandler, validate({ body: resetPasswordSchema }), authController.resetPassword as any);
router.post('/refresh', refreshLimiterHandler, validate({ body: refreshSchema }), authController.refresh as any);

// One-time code exchange (issued by the OAuth callback redirect)
router.post('/exchange', authLimiterHandler, validate({ body: exchangeCodeSchema }), authController.exchange as any);

router.post('/logout', authController.logout as any);
router.post('/logout-all', authenticate as any, authController.logoutAll as any);

router.get('/oauth/zenuxs/:provider', authController.oauthRedirect as any);
router.get('/oauth/zenuxs/:provider/callback', authController.oauthCallback as any);
// Landed here from the registered `callback.html` redirect, which forwards the
// code. Same controller: the provider is passed as a query param.
router.get('/oauth/zenuxs/browser/callback', authController.oauthCallback as any);

router.get('/me', authenticate as any, authController.me as any);
router.patch('/me', authenticate as any, validate({ body: updateProfileSchema }), authController.updateMe as any);
router.post(
  '/change-password',
  authLimiterHandler,
  authenticate as any,
  validate({ body: changePasswordSchema }),
  authController.changePassword as any
);

export default router;
export { authController, authService, userRepository };

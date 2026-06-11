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
import { registerSchema, verifyOtpSchema, loginSchema, refreshSchema } from './auth.validation';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 100 : 5,
  message: { message: 'Too many auth requests, please try again later.' }
});
const authLimiterHandler = authLimiter as unknown as RequestHandler;

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
router.post('/refresh', authLimiterHandler, validate({ body: refreshSchema }), authController.refresh as any);

router.post('/logout', authController.logout as any);

router.get('/oauth/zenuxs/:provider', authController.oauthRedirect as any);
router.get('/oauth/zenuxs/:provider/callback', authController.oauthCallback as any);

router.get('/me', authenticate as any, authController.me as any);

export default router;
export { authController, authService, userRepository };

import { Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { ZenuxsOAuthService } from './zenuxs-oauth.service';
import { ApiResponse } from '../../shared/utils/response.util';
import { AuthenticatedRequest } from '../../shared/middleware/rbac.middleware';
import { env } from '../../shared/config/env.config';

export class AuthController {
  constructor(
    private authService: AuthService,
    private zenuxsOAuthService: ZenuxsOAuthService
  ) {}

  register = async (req: any, res: Response, next: NextFunction) => {
    try {
      const result = await this.authService.register(req.body);
      return ApiResponse.success(res, result, 'OTP sent to email address', 201);
    } catch (error) {
      next(error);
    }
  };

  verifyOtp = async (req: any, res: Response, next: NextFunction) => {
    try {
      const { userId, code, purpose } = req.body;

      if (purpose === 'account_activation') {
        const result = await this.authService.verifyAccount(userId, code);
        return ApiResponse.success(res, result, 'Account activated successfully');
      }

      return ApiResponse.error(res, 'Invalid OTP purpose', null, 400);
    } catch (error) {
      next(error);
    }
  };

  login = async (req: any, res: Response, next: NextFunction) => {
    try {
      const result = await this.authService.login(req.body);
      return ApiResponse.success(res, result, 'Login successful');
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req: any, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;
      const tokens = await this.authService.refreshTokens(refreshToken);
      return ApiResponse.success(res, tokens, 'Token refreshed successfully');
    } catch (error) {
      next(error);
    }
  };

  me = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return ApiResponse.error(res, 'Authentication required', null, 401);
      }
      const profile = await this.authService.getProfile(req.user.id);
      return ApiResponse.success(res, profile, 'Profile retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  logout = async (req: any, res: Response, next: NextFunction) => {
    try {
      return ApiResponse.success(res, null, 'Logged out successfully');
    } catch (error) {
      next(error);
    }
  };

  oauthRedirect = async (req: any, res: Response, next: NextFunction) => {
    try {
      const { provider } = req.params;
      const url = await this.zenuxsOAuthService.getAuthorizationUrl(provider);
      return res.redirect(url);
    } catch (error) {
      next(error);
    }
  };

  oauthCallback = async (req: any, res: Response, next: NextFunction) => {
    try {
      const { provider } = req.params;
      const { code, state } = req.query;

      if (!code || typeof code !== 'string') {
        const frontendUrl = env.FRONTEND_URL;
        return res.redirect(`${frontendUrl}/auth/callback?error=${encodeURIComponent('Authorization code is required')}`);
      }

      const stateStr = typeof state === 'string' ? state : undefined;
      const result = await this.authService.handleOAuthCallback(provider, code, stateStr, this.zenuxsOAuthService);

      const frontendUrl = env.FRONTEND_URL;
      const params = new URLSearchParams({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        userId: result.user.id,
        provider: result.user.provider,
        isNew: String(result.isNew)
      });
      return res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
    } catch (error: any) {
      const frontendUrl = env.FRONTEND_URL;
      return res.redirect(`${frontendUrl}/auth/callback?error=${encodeURIComponent(error.message || 'OAuth login failed')}`);
    }
  };
}

export default AuthController;


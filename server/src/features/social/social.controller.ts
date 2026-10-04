import { Response, NextFunction } from 'express';
import { SocialService } from './social.service';
import { ApiResponse } from '../../shared/utils/response.util';
import { AuthenticatedRequest } from '../../shared/middleware/rbac.middleware';
import { AppError } from '../../shared/errors/appError';
import { env } from '../../shared/config/env.config';

export class SocialController {
  constructor(private socialService: SocialService) {}

  /**
   * POST /api/social/connect/:platform
   * Returns a real provider authorization URL (server-side OAuth transaction).
   */
  connect = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { platform } = req.params;
      const redirectHost = `${req.protocol}://${req.get('host')}`;
      const result = await this.socialService.getConnectUrl(platform, req.user.id, redirectHost);
      return ApiResponse.success(res, result, 'Authorization URL generated');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/social/callback/:platform
   * Provider redirect target. Exchanges the code server-side and redirects the
   * browser back to the SPA — no tokens ever appear in the URL fragment.
   */
  callback = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { platform } = req.params;
      const { code, state } = req.query as { code?: string; state?: string };
      if (!code || !state) {
        throw AppError.badRequest('Authorization code and state are required parameters');
      }

      const redirectHost = `${req.protocol}://${req.get('host')}`;
      await this.socialService.handleCallback(platform, code, state, redirectHost);

      return res.redirect(`${env.FRONTEND_URL}/connected-accounts?connection=success&platform=${platform}`);
    } catch (error: any) {
      const message = encodeURIComponent(error?.message || 'OAuth Connection Failed');
      return res.redirect(`${env.FRONTEND_URL}/connected-accounts?connection=error&message=${message}`);
    }
  };

  /** GET /api/social/accounts */
  listAccounts = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const accounts = await this.socialService.listAccounts(req.user.id);
      return ApiResponse.success(res, accounts, 'Connected social accounts retrieved');
    } catch (error) {
      next(error);
    }
  };

  /** GET /api/social/connections/:platform/discover — accounts the provider exposes. */
  discover = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { platform } = req.params;
      const accounts = await this.socialService.listDiscoverableAccounts(req.user.id, platform);
      return ApiResponse.success(res, accounts, 'Discoverable accounts retrieved');
    } catch (error) {
      next(error);
    }
  };

  /** POST /api/social/accounts/select — persist one discovered provider account. */
  selectAccount = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { platform, providerAccountId } = req.body;
      const account = await this.socialService.selectAccount(req.user.id, platform, providerAccountId);
      return ApiResponse.success(res, account, 'Social account connected');
    } catch (error) {
      next(error);
    }
  };

  /** POST /api/social/connections/:id/refresh — refresh provider tokens. */
  refresh = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { id } = req.params;
      const connection = await this.socialService.refreshConnection(id, req.user.id);
      return ApiResponse.success(res, connection, 'Connection refreshed');
    } catch (error) {
      next(error);
    }
  };

  /** DELETE /api/social/accounts/:id */
  disconnect = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { id } = req.params;
      await this.socialService.disconnectAccount(id, req.user.id);
      return ApiResponse.success(res, null, 'Social account disconnected successfully');
    } catch (error) {
      next(error);
    }
  };
}
export default SocialController;

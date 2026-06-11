import { Response, NextFunction } from 'express';
import { SocialService } from './social.service';
import { ApiResponse } from '../../shared/utils/response.util';
import { AuthenticatedRequest as AuthenticatedUserRequest } from '../../shared/middleware/rbac.middleware';
import { AppError } from '../../shared/errors/appError';

export class SocialAccountDto {
  static toResponse(account: any) {
    return {
      id: account._id.toString(),
      userId: account.userId,
      platform: account.platform,
      accountId: account.accountId,
      username: account.username,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      metadata: account.metadata,
      createdAt: account.createdAt
    };
  }
}

export class SocialController {
  constructor(private socialService: SocialService) {}

  /**
   * Generates authorization URL for a social platform connection
   */
  connect = async (req: AuthenticatedUserRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const { platform } = req.params;
      
      // Determine base URL dynamically (e.g. http://localhost:5000)
      const redirectHost = `${req.protocol}://${req.get('host')}`;
      
      const authUrl = await this.socialService.getConnectUrl(platform, req.user.id, redirectHost);
      
      return ApiResponse.success(res, { url: authUrl }, 'Authorization URL generated successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * Receives redirect from the social provider callback
   */
  callback = async (req: AuthenticatedUserRequest, res: Response, next: NextFunction) => {
    try {
      const { platform } = req.params;
      const { code, state } = req.query as { code: string; state: string };

      if (!code || !state) {
        throw AppError.badRequest('Authorization code and state are required parameters');
      }

      const redirectHost = `${req.protocol}://${req.get('host')}`;
      
      await this.socialService.handleCallback(platform, code, state, redirectHost);

      // Redirect browser back to React SPA dashboard upon successful connection
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/settings?connection=success&platform=${platform}`);
    } catch (error: any) {
      // In case of callback errors (e.g. user cancelled), redirect back with details
      console.error('[SocialController] Callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const encodedMsg = encodeURIComponent(error.message || 'OAuth Connection Failed');
      return res.redirect(`${frontendUrl}/settings?connection=error&message=${encodedMsg}`);
    }
  };

  /**
   * Lists all connected accounts for the authenticated user
   */
  listAccounts = async (req: AuthenticatedUserRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const accounts = await this.socialService.getAccounts(req.user.id);
      const output = accounts.map(SocialAccountDto.toResponse);
      
      return ApiResponse.success(res, output, 'Connected social accounts retrieved');
    } catch (error) {
      next(error);
    }
  };

  /**
   * Disconnects a social account
   */
  disconnect = async (req: AuthenticatedUserRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const { id } = req.params;
      await this.socialService.disconnectAccount(id, req.user.id);
      
      return ApiResponse.success(res, null, 'Social account disconnected successfully');
    } catch (error) {
      next(error);
    }
  };
}
export default SocialController;

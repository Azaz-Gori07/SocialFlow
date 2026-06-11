"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialController = exports.SocialAccountDto = void 0;
const response_util_1 = require("../../shared/utils/response.util");
const appError_1 = require("../../shared/errors/appError");
class SocialAccountDto {
    static toResponse(account) {
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
exports.SocialAccountDto = SocialAccountDto;
class SocialController {
    socialService;
    constructor(socialService) {
        this.socialService = socialService;
    }
    /**
     * Generates authorization URL for a social platform connection
     */
    connect = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const { platform } = req.params;
            // Determine base URL dynamically (e.g. http://localhost:5000)
            const redirectHost = `${req.protocol}://${req.get('host')}`;
            const authUrl = await this.socialService.getConnectUrl(platform, req.user.id, redirectHost);
            return response_util_1.ApiResponse.success(res, { url: authUrl }, 'Authorization URL generated successfully');
        }
        catch (error) {
            next(error);
        }
    };
    /**
     * Receives redirect from the social provider callback
     */
    callback = async (req, res, next) => {
        try {
            const { platform } = req.params;
            const { code, state } = req.query;
            if (!code || !state) {
                throw appError_1.AppError.badRequest('Authorization code and state are required parameters');
            }
            const redirectHost = `${req.protocol}://${req.get('host')}`;
            await this.socialService.handleCallback(platform, code, state, redirectHost);
            // Redirect browser back to React SPA dashboard upon successful connection
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            return res.redirect(`${frontendUrl}/settings?connection=success&platform=${platform}`);
        }
        catch (error) {
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
    listAccounts = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const accounts = await this.socialService.getAccounts(req.user.id);
            const output = accounts.map(SocialAccountDto.toResponse);
            return response_util_1.ApiResponse.success(res, output, 'Connected social accounts retrieved');
        }
        catch (error) {
            next(error);
        }
    };
    /**
     * Disconnects a social account
     */
    disconnect = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const { id } = req.params;
            await this.socialService.disconnectAccount(id, req.user.id);
            return response_util_1.ApiResponse.success(res, null, 'Social account disconnected successfully');
        }
        catch (error) {
            next(error);
        }
    };
}
exports.SocialController = SocialController;
exports.default = SocialController;

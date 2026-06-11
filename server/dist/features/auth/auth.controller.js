"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const response_util_1 = require("../../shared/utils/response.util");
const env_config_1 = require("../../shared/config/env.config");
class AuthController {
    authService;
    zenuxsOAuthService;
    constructor(authService, zenuxsOAuthService) {
        this.authService = authService;
        this.zenuxsOAuthService = zenuxsOAuthService;
    }
    register = async (req, res, next) => {
        try {
            const result = await this.authService.register(req.body);
            return response_util_1.ApiResponse.success(res, result, 'OTP sent to email address', 201);
        }
        catch (error) {
            next(error);
        }
    };
    verifyOtp = async (req, res, next) => {
        try {
            const { userId, code, purpose } = req.body;
            if (purpose === 'account_activation') {
                const result = await this.authService.verifyAccount(userId, code);
                return response_util_1.ApiResponse.success(res, result, 'Account activated successfully');
            }
            return response_util_1.ApiResponse.error(res, 'Invalid OTP purpose', null, 400);
        }
        catch (error) {
            next(error);
        }
    };
    login = async (req, res, next) => {
        try {
            const result = await this.authService.login(req.body);
            return response_util_1.ApiResponse.success(res, result, 'Login successful');
        }
        catch (error) {
            next(error);
        }
    };
    refresh = async (req, res, next) => {
        try {
            const { refreshToken } = req.body;
            const tokens = await this.authService.refreshTokens(refreshToken);
            return response_util_1.ApiResponse.success(res, tokens, 'Token refreshed successfully');
        }
        catch (error) {
            next(error);
        }
    };
    me = async (req, res, next) => {
        try {
            if (!req.user) {
                return response_util_1.ApiResponse.error(res, 'Authentication required', null, 401);
            }
            const profile = await this.authService.getProfile(req.user.id);
            return response_util_1.ApiResponse.success(res, profile, 'Profile retrieved successfully');
        }
        catch (error) {
            next(error);
        }
    };
    logout = async (req, res, next) => {
        try {
            return response_util_1.ApiResponse.success(res, null, 'Logged out successfully');
        }
        catch (error) {
            next(error);
        }
    };
    oauthRedirect = async (req, res, next) => {
        try {
            const { provider } = req.params;
            const url = await this.zenuxsOAuthService.getAuthorizationUrl(provider);
            return res.redirect(url);
        }
        catch (error) {
            next(error);
        }
    };
    oauthCallback = async (req, res, next) => {
        try {
            const { provider } = req.params;
            const { code, state } = req.query;
            if (!code || typeof code !== 'string') {
                const frontendUrl = env_config_1.env.FRONTEND_URL;
                return res.redirect(`${frontendUrl}/auth/callback?error=${encodeURIComponent('Authorization code is required')}`);
            }
            const stateStr = typeof state === 'string' ? state : undefined;
            const result = await this.authService.handleOAuthCallback(provider, code, stateStr, this.zenuxsOAuthService);
            const frontendUrl = env_config_1.env.FRONTEND_URL;
            const params = new URLSearchParams({
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                userId: result.user.id,
                provider: result.user.provider,
                isNew: String(result.isNew)
            });
            return res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
        }
        catch (error) {
            const frontendUrl = env_config_1.env.FRONTEND_URL;
            return res.redirect(`${frontendUrl}/auth/callback?error=${encodeURIComponent(error.message || 'OAuth login failed')}`);
        }
    };
}
exports.AuthController = AuthController;
exports.default = AuthController;

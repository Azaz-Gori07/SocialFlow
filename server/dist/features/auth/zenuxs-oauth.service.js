"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZenuxsOAuthService = void 0;
const env_config_1 = require("../../shared/config/env.config");
const appError_1 = require("../../shared/errors/appError");
const zenuxs_oauth_1 = __importDefault(require("zenuxs-oauth"));
class ZenuxsOAuthService {
    userRepository;
    static sharedStorage = new Map();
    constructor(userRepository) {
        this.userRepository = userRepository;
    }
    getBackendUrl() {
        return process.env.BACKEND_URL ||
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${env_config_1.env.PORT}`);
    }
    createOAuthInstance(provider) {
        const clientId = env_config_1.env.ZENUXS_CLIENT_ID || env_config_1.env.ZENUXS_GOOGLE_CLIENT_ID || env_config_1.env.ZENUXS_GITHUB_CLIENT_ID;
        const authServer = (env_config_1.env.ZENUXS_AUTH_SERVER || 'https://api.auth.zenuxs.in').replace(/\/$/, '');
        const backendUrl = this.getBackendUrl();
        const redirectUri = provider
            ? `${backendUrl}/api/auth/oauth/zenuxs/${provider}/callback`
            : `${backendUrl}/api/auth/oauth/zenuxs/{provider}/callback`;
        const clientSecret = env_config_1.env.ZENUXS_CLIENT_SECRET || env_config_1.env.ZENUXS_GOOGLE_CLIENT_SECRET || env_config_1.env.ZENUXS_GITHUB_CLIENT_SECRET;
        if (!clientId) {
            throw appError_1.AppError.badRequest('Zenuxs OAuth is not configured');
        }
        return new zenuxs_oauth_1.default({
            clientId,
            authServer,
            redirectUri,
            scopes: 'openid profile email',
            storage: ZenuxsOAuthService.sharedStorage,
            validateState: true,
            usePKCE: true,
            debug: process.env.NODE_ENV === 'development',
            // For server-side (confidential client), send client_secret with token requests
            ...(clientSecret ? { extraTokenParams: { client_secret: clientSecret } } : {})
        });
    }
    async getAuthorizationUrl(provider) {
        const oauth = this.createOAuthInstance(provider);
        const backendUrl = this.getBackendUrl();
        const redirectUri = `${backendUrl}/api/auth/oauth/zenuxs/${provider}/callback`;
        const authData = await oauth.getAuthorizationUrl({
            redirectUri,
            extraAuthParams: {
                provider,
                connection: provider
            }
        });
        return authData.url;
    }
    async handleCallback(provider, code, state) {
        const oauth = this.createOAuthInstance(provider);
        const backendUrl = this.getBackendUrl();
        const redirectUri = `${backendUrl}/api/auth/oauth/zenuxs/${provider}/callback`;
        // Build the full callback URL from the redirect URI and the code/state params
        const callbackUrl = new URL(redirectUri);
        callbackUrl.searchParams.set('code', code);
        if (state) {
            callbackUrl.searchParams.set('state', state);
        }
        let tokens = null;
        try {
            tokens = await oauth.handleCallback(callbackUrl.toString(), { redirectUri });
        }
        catch (error) {
            throw appError_1.AppError.unauthorized(`Zenuxs OAuth callback failed: ${error.message}`);
        }
        if (!tokens || !tokens.access_token) {
            throw appError_1.AppError.unauthorized('Zenuxs OAuth did not return tokens');
        }
        // Fetch user info using the SDK's built-in method
        let userInfo;
        try {
            userInfo = await oauth.getUserInfo();
        }
        catch (error) {
            throw appError_1.AppError.unauthorized(`Zenuxs userinfo failed: ${error.message}`);
        }
        const profile = {
            providerId: String(userInfo.sub || userInfo.id || userInfo.email || `${provider}-${Date.now()}`),
            email: userInfo.email || '',
            fullName: userInfo.name || userInfo.full_name || userInfo.username || userInfo.preferred_username || 'Zenuxs User',
            avatarUrl: userInfo.picture || userInfo.avatar_url
        };
        const authProvider = provider === 'google' ? 'zenuxs-google' : 'zenuxs-github';
        let user = await this.userRepository.findByOAuthProvider(authProvider, profile.providerId);
        if (!user && profile.email) {
            user = await this.userRepository.findByEmail(profile.email);
        }
        if (user) {
            if (provider === 'google' && !user.oauthProviderId) {
                user.oauthProviderId = profile.providerId;
                user.provider = 'zenuxs-google';
            }
            else if (provider === 'github' && !user.oauthProviderId) {
                user.oauthProviderId = profile.providerId;
                user.provider = 'zenuxs-github';
            }
            user.lastLogin = new Date();
            await user.save();
            return { user, isNew: false };
        }
        const newUser = await this.userRepository.create({
            email: profile.email,
            fullName: profile.fullName,
            avatarUrl: profile.avatarUrl,
            provider: authProvider,
            emailVerified: true,
            oauthProviderId: profile.providerId,
            lastLogin: new Date()
        });
        return { user: newUser, isNew: true };
    }
}
exports.ZenuxsOAuthService = ZenuxsOAuthService;
exports.default = ZenuxsOAuthService;

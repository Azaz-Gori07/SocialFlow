"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZenuxsOAuthService = void 0;
const env_config_1 = require("../../shared/config/env.config");
const appError_1 = require("../../shared/errors/appError");
class ZenuxsOAuthService {
    userRepository;
    constructor(userRepository) {
        this.userRepository = userRepository;
    }
    getAuthorizationUrl(provider) {
        const clientId = env_config_1.env.ZENUXS_CLIENT_ID || env_config_1.env.ZENUXS_GOOGLE_CLIENT_ID || env_config_1.env.ZENUXS_GITHUB_CLIENT_ID;
        if (!clientId) {
            throw appError_1.AppError.badRequest('Zenuxs OAuth is not configured');
        }
        const authServer = (env_config_1.env.ZENUXS_AUTH_SERVER || 'https://api.auth.zenuxs.in').replace(/\/$/, '');
        const redirectUri = `${env_config_1.env.FRONTEND_URL}/api/auth/oauth/zenuxs/${provider}/callback`;
        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: 'openid profile email',
            state: `${provider}:${Date.now()}`
        });
        return `${authServer}/oauth/authorize?${params.toString()}`;
    }
    async handleCallback(provider, code) {
        const profile = await this.exchangeCode(code, provider);
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
    async exchangeCode(code, provider) {
        const clientId = env_config_1.env.ZENUXS_CLIENT_ID || env_config_1.env.ZENUXS_GOOGLE_CLIENT_ID || env_config_1.env.ZENUXS_GITHUB_CLIENT_ID;
        const clientSecret = env_config_1.env.ZENUXS_CLIENT_SECRET || env_config_1.env.ZENUXS_GOOGLE_CLIENT_SECRET || env_config_1.env.ZENUXS_GITHUB_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            throw appError_1.AppError.badRequest('Zenuxs OAuth is not configured');
        }
        const authServer = (env_config_1.env.ZENUXS_AUTH_SERVER || 'https://api.auth.zenuxs.in').replace(/\/$/, '');
        const redirectUri = `${env_config_1.env.FRONTEND_URL}/api/auth/oauth/zenuxs/${provider}/callback`;
        const tokenResp = await fetch(`${authServer}/oauth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri
            }).toString()
        });
        if (!tokenResp.ok) {
            const err = await tokenResp.text();
            throw appError_1.AppError.unauthorized(`Zenuxs token exchange failed: ${err}`);
        }
        const tokenData = await tokenResp.json();
        const accessToken = tokenData.access_token || tokenData.token || tokenData.id_token;
        if (!accessToken) {
            throw appError_1.AppError.unauthorized('Zenuxs token exchange did not return an access token');
        }
        const userResp = await fetch(`${authServer}/oauth/userinfo`, {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
        });
        if (!userResp.ok) {
            const err = await userResp.text();
            throw appError_1.AppError.unauthorized(`Zenuxs userinfo failed: ${err}`);
        }
        const profile = await userResp.json();
        return {
            providerId: String(profile.id || profile.sub || profile.email || `${provider}-${Date.now()}`),
            email: profile.email || profile.user?.email || '',
            fullName: profile.name || profile.full_name || profile.username || profile.preferred_username || 'Zenuxs User',
            avatarUrl: profile.picture || profile.avatar_url || profile.avatarUrl
        };
    }
}
exports.ZenuxsOAuthService = ZenuxsOAuthService;
exports.default = ZenuxsOAuthService;

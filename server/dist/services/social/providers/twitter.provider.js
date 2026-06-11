"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitterProvider = void 0;
const crypto_1 = __importDefault(require("crypto"));
const oauth2_strategy_1 = require("../strategies/oauth2.strategy");
const env_config_1 = require("../../../shared/config/env.config");
class TwitterProvider extends oauth2_strategy_1.OAuth2Strategy {
    static verifierStore = new Map();
    constructor() {
        super(env_config_1.env.X_CLIENT_ID || 'mock_x_id', env_config_1.env.X_CLIENT_SECRET || 'mock_x_secret', 'https://twitter.com/i/oauth2/authorize', 'https://api.twitter.com/2/oauth2/token');
    }
    getAuthorizationUrl(state, redirectUri) {
        const verifier = crypto_1.default.randomBytes(32).toString('hex');
        const timer = setTimeout(() => TwitterProvider.verifierStore.delete(state), 15 * 60 * 1000);
        TwitterProvider.verifierStore.set(state, { verifier, timer });
        return this.getBaseAuthorizationUrl(state, redirectUri, [
            'tweet.read',
            'users.read',
            'offline.access'
        ], {
            code_challenge: verifier,
            code_challenge_method: 'plain'
        });
    }
    async exchangeCode(code, redirectUri, state) {
        const entry = state ? TwitterProvider.verifierStore.get(state) : undefined;
        const codeVerifier = entry?.verifier;
        if (state && !codeVerifier) {
            throw new Error('PKCE verifier not found for the given state — session may have expired');
        }
        if (entry) {
            clearTimeout(entry.timer);
            TwitterProvider.verifierStore.delete(state);
        }
        // Twitter/X requires Basic Auth headers for client credentials in OAuth 2.0
        const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier || ''
        });
        const response = await fetch(this.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${authHeader}`
            },
            body: params.toString()
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Twitter token exchange failed: ${response.status} - ${errorText}`);
        }
        const data = (await response.json());
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : undefined
        };
    }
    async getUserProfile(accessToken) {
        const response = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Twitter user info request failed: ${response.status} - ${errorText}`);
        }
        const data = (await response.json());
        if (!data.data) {
            throw new Error('Invalid response from Twitter User Info API');
        }
        return {
            accountId: data.data.id,
            username: data.data.username,
            displayName: data.data.name,
            avatarUrl: data.data.profile_image_url
        };
    }
    async refreshToken(refreshToken) {
        const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        });
        const response = await fetch(this.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${authHeader}`
            },
            body: params.toString()
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Twitter token refresh failed: ${response.status} - ${errorText}`);
        }
        const data = (await response.json());
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || refreshToken,
            expiresIn: data.expires_in,
            expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : undefined
        };
    }
    async publishPost(accessToken, content, media, accountId) {
        const response = await fetch('https://api.twitter.com/2/tweets', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: content })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Twitter tweet posting failed: ${response.status} - ${errorText}`);
        }
        const data = (await response.json());
        return data.data.id;
    }
}
exports.TwitterProvider = TwitterProvider;
exports.default = TwitterProvider;

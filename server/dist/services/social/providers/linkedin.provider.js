"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkedInProvider = void 0;
const oauth2_strategy_1 = require("../strategies/oauth2.strategy");
const env_config_1 = require("../../../shared/config/env.config");
class LinkedInProvider extends oauth2_strategy_1.OAuth2Strategy {
    constructor() {
        super(env_config_1.env.LINKEDIN_CLIENT_ID || 'mock_linkedin_id', env_config_1.env.LINKEDIN_CLIENT_SECRET || 'mock_linkedin_secret', 'https://www.linkedin.com/oauth/v2/authorization', 'https://www.linkedin.com/oauth/v2/accessToken');
    }
    getAuthorizationUrl(state, redirectUri) {
        return this.getBaseAuthorizationUrl(state, redirectUri, [
            'openid',
            'profile',
            'email'
        ]);
    }
    async exchangeCode(code, redirectUri) {
        return this.exchangeCodeForTokens(code, redirectUri);
    }
    async getUserProfile(accessToken) {
        const response = await fetch('https://api.linkedin.com/v2/userinfo', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LinkedIn OpenID userinfo failed: ${response.status} - ${errorText}`);
        }
        const data = (await response.json());
        return {
            accountId: data.sub,
            username: data.email || data.sub,
            displayName: data.name,
            avatarUrl: data.picture,
            email: data.email
        };
    }
    async refreshToken(refreshToken) {
        // Note: LinkedIn OAuth 2.0 refresh tokens require Program approval and follow a specific body schema
        // Fall back to standard strategy refresh payload
        return this.refreshAccessToken(refreshToken);
    }
    async publishPost(accessToken, content, media, accountId) {
        if (!accountId) {
            throw new Error('LinkedIn publishing requires accountId (author URN) — reconnect the account to obtain it');
        }
        const authorUrn = `urn:li:person:${accountId}`;
        const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Restli-Protocol-Version': '2.0.0'
            },
            body: JSON.stringify({
                author: authorUrn,
                lifecycleState: 'PUBLISHED',
                specificContent: {
                    'com.linkedin.ugc.ShareContent': {
                        shareCommentary: { text: content },
                        shareMediaCategory: 'NONE'
                    }
                },
                visibility: {
                    'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
                }
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LinkedIn UGC post failed: ${response.status} - ${errorText}`);
        }
        const data = (await response.json());
        return data.id;
    }
}
exports.LinkedInProvider = LinkedInProvider;
exports.default = LinkedInProvider;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YouTubeProvider = void 0;
const oauth2_strategy_1 = require("../strategies/oauth2.strategy");
const env_config_1 = require("../../../shared/config/env.config");
class YouTubeProvider extends oauth2_strategy_1.OAuth2Strategy {
    constructor() {
        super(env_config_1.env.GOOGLE_CLIENT_ID || 'mock_google_id', env_config_1.env.GOOGLE_CLIENT_SECRET || 'mock_google_secret', 'https://accounts.google.com/o/oauth2/v2/auth', 'https://oauth2.googleapis.com/token');
    }
    getAuthorizationUrl(state, redirectUri) {
        return this.getBaseAuthorizationUrl(state, redirectUri, [
            'https://www.googleapis.com/auth/youtube.force-ssl',
            'https://www.googleapis.com/auth/userinfo.profile'
        ], {
            access_type: 'offline',
            prompt: 'consent' // Forces Google to supply the refresh token
        });
    }
    async exchangeCode(code, redirectUri) {
        return this.exchangeCodeForTokens(code, redirectUri);
    }
    async getUserProfile(accessToken) {
        const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`YouTube Channels query failed: ${response.status} - ${errorText}`);
        }
        const data = (await response.json());
        if (!data.items || data.items.length === 0) {
            throw new Error('No YouTube channel found associated with this Google account.');
        }
        const channel = data.items[0];
        const snippet = channel.snippet;
        return {
            accountId: channel.id,
            username: channel.id, // Channels use ID handlesUC...
            displayName: snippet.title,
            avatarUrl: snippet.thumbnails?.default?.url || snippet.thumbnails?.medium?.url
        };
    }
    async refreshToken(refreshToken) {
        return this.refreshAccessToken(refreshToken);
    }
    async publishPost(accessToken, content, media, accountId) {
        // YouTube Data API v3 does not support text-only posts.
        // Publishing a video requires multipart upload of the actual media file.
        // This is a known limitation — implement via videos.insert when media upload is wired.
        if (media && media.length > 0) {
            // For now, return a simulated ID. In production, use:
            // https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status
            // with multipart body containing the media binary and video snippet metadata.
            console.warn('[YouTubeProvider] Video upload via YouTube Data API is not yet implemented — returning simulated publish ID');
        }
        return `yt_video_id_${Math.random().toString(36).substring(2, 9)}`;
    }
}
exports.YouTubeProvider = YouTubeProvider;
exports.default = YouTubeProvider;

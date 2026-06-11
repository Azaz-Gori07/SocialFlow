"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuth2Strategy = void 0;
class OAuth2Strategy {
    clientId;
    clientSecret;
    authUrl;
    tokenUrl;
    constructor(clientId, clientSecret, authUrl, tokenUrl) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.authUrl = authUrl;
        this.tokenUrl = tokenUrl;
    }
    /**
     * Constructs authorization URL
     */
    getBaseAuthorizationUrl(state, redirectUri, scopes, extraParams = {}) {
        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            state,
            scope: scopes.join(' '),
            ...extraParams
        });
        return `${this.authUrl}?${params.toString()}`;
    }
    /**
     * Exchanges code for access and refresh tokens using native fetch
     */
    async exchangeCodeForTokens(code, redirectUri, extraParams = {}) {
        const params = new URLSearchParams({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
            code,
            ...extraParams
        });
        const response = await fetch(this.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OAuth token exchange failed with status ${response.status}: ${errorText}`);
        }
        const data = (await response.json());
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : undefined
        };
    }
    /**
     * Refreshes access token using refresh token
     */
    async refreshAccessToken(refreshToken, extraParams = {}) {
        const params = new URLSearchParams({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            ...extraParams
        });
        const response = await fetch(this.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OAuth token refresh failed with status ${response.status}: ${errorText}`);
        }
        const data = (await response.json());
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || refreshToken,
            expiresIn: data.expires_in,
            expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : undefined
        };
    }
}
exports.OAuth2Strategy = OAuth2Strategy;
exports.default = OAuth2Strategy;

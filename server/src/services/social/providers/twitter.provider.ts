import crypto from 'crypto';
import { OAuth2Strategy } from '../strategies/oauth2.strategy';
import { SocialProvider, TokenPayload, UserProfile } from '../interfaces/socialProvider.interface';
import { env } from '../../../shared/config/env.config';

export class TwitterProvider extends OAuth2Strategy implements SocialProvider {
  private static verifierStore = new Map<string, { verifier: string; timer: ReturnType<typeof setTimeout> }>();

  constructor() {
    super(
      env.X_CLIENT_ID || 'mock_x_id',
      env.X_CLIENT_SECRET || 'mock_x_secret',
      'https://twitter.com/i/oauth2/authorize',
      'https://api.twitter.com/2/oauth2/token'
    );
  }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const verifier = crypto.randomBytes(32)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const timer = setTimeout(() => TwitterProvider.verifierStore.delete(state), 15 * 60 * 1000);
    TwitterProvider.verifierStore.set(state, { verifier, timer });

    return this.getBaseAuthorizationUrl(state, redirectUri, [
      'tweet.read',
      'tweet.write',
      'users.read',
      'offline.access'
    ], {
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });
  }

  async exchangeCode(code: string, redirectUri: string, state?: string): Promise<TokenPayload> {
    const entry = state ? TwitterProvider.verifierStore.get(state) : undefined;
    const codeVerifier = entry?.verifier;
    if (state && !codeVerifier) {
      throw new Error('PKCE verifier not found for the given state — session may have expired');
    }
    if (entry) {
      clearTimeout(entry.timer);
      TwitterProvider.verifierStore.delete(state!);
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

    const data = (await response.json()) as any;
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : undefined
    };
  }

  async getUserProfile(accessToken: string): Promise<UserProfile> {
    const response = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Twitter user info request failed: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as any;
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

  async refreshToken(refreshToken: string): Promise<TokenPayload> {
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

    const data = (await response.json()) as any;
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : undefined
    };
  }

  async publishPost(accessToken: string, content: string, media?: string[], accountId?: string): Promise<string> {
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

    const data = (await response.json()) as any;
    return data.data.id;
  }
}
export default TwitterProvider;

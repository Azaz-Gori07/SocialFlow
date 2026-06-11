import { OAuth2Strategy } from '../strategies/oauth2.strategy';
import { SocialProvider, TokenPayload, UserProfile } from '../interfaces/socialProvider.interface';
import { env } from '../../../shared/config/env.config';

export class LinkedInProvider extends OAuth2Strategy implements SocialProvider {
  constructor() {
    super(
      env.LINKEDIN_CLIENT_ID || 'mock_linkedin_id',
      env.LINKEDIN_CLIENT_SECRET || 'mock_linkedin_secret',
      'https://www.linkedin.com/oauth/v2/authorization',
      'https://www.linkedin.com/oauth/v2/accessToken'
    );
  }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    return this.getBaseAuthorizationUrl(state, redirectUri, [
      'openid',
      'profile',
      'email'
    ]);
  }

  async exchangeCode(code: string, redirectUri: string): Promise<TokenPayload> {
    return this.exchangeCodeForTokens(code, redirectUri);
  }

  async getUserProfile(accessToken: string): Promise<UserProfile> {
    const response = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LinkedIn OpenID userinfo failed: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as any;
    
    return {
      accountId: data.sub,
      username: data.email || data.sub,
      displayName: data.name,
      avatarUrl: data.picture,
      email: data.email
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenPayload> {
    // Note: LinkedIn OAuth 2.0 refresh tokens require Program approval and follow a specific body schema
    // Fall back to standard strategy refresh payload
    return this.refreshAccessToken(refreshToken);
  }

  async publishPost(accessToken: string, content: string, media?: string[], accountId?: string): Promise<string> {
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

    const data = (await response.json()) as any;
    return data.id;
  }
}
export default LinkedInProvider;

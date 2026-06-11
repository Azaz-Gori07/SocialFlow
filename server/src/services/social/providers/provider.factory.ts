import { SocialProvider, TokenPayload, UserProfile } from '../interfaces/socialProvider.interface';
import { TwitterProvider } from './twitter.provider';
import { LinkedInProvider } from './linkedin.provider';
import { YouTubeProvider } from './youtube.provider';
import { env } from '../../../shared/config/env.config';

class MockSocialProvider implements SocialProvider {
  constructor(private platform: string) {}

  getAuthorizationUrl(state: string, redirectUri: string): string {
    // Generate a direct callback URL containing mock code and state
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', `mock_code_${this.platform}_${Math.random().toString(36).substring(2, 9)}`);
    callbackUrl.searchParams.set('state', state);
    return callbackUrl.toString();
  }

  async exchangeCode(code: string, redirectUri: string, state?: string): Promise<TokenPayload> {
    return {
      accessToken: `mock_access_token_${this.platform}_${Math.random().toString(36).substring(2, 10)}`,
      refreshToken: `mock_refresh_token_${this.platform}_${Math.random().toString(36).substring(2, 10)}`,
      expiresIn: 3600,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString()
    };
  }

  async getUserProfile(accessToken: string): Promise<UserProfile> {
    const randomId = Math.floor(Math.random() * 9000) + 1000;
    const names: Record<string, string> = {
      twitter: 'Alex Creator (Mock)',
      linkedin: 'Alex Business (Mock)',
      youtube: 'Alex Vlogs (Mock)'
    };
    
    const usernames: Record<string, string> = {
      twitter: `alex_creator_${randomId}`,
      linkedin: `alex-business-${randomId}`,
      youtube: `UCmockChannelIdAlexVlogs${randomId}`
    };

    const platform = this.platform;
    return {
      accountId: `act_mock_${platform}_${randomId}`,
      username: usernames[platform] || `mock_user_${randomId}`,
      displayName: names[platform] || `Mock ${platform} Profile`,
      avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=mock_${platform}_${randomId}`
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenPayload> {
    return {
      accessToken: `mock_access_token_refreshed_${this.platform}_${Math.random().toString(36).substring(2, 10)}`,
      refreshToken,
      expiresIn: 3600,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString()
    };
  }

  async publishPost(accessToken: string, content: string, media?: string[], accountId?: string): Promise<string> {
    return `mock_published_id_${this.platform}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

export class ProviderFactory {
  /**
   * Retrieves provider instance based on platform name
   * Automatically falls back to Mock provider if live keys are not configured in environment
   */
  /**
   * Checks if mock providers are allowed. In production, mock providers must never be used
   * because they would create fake social accounts with no real OAuth handshake.
   */
  private static allowMock(): boolean {
    return process.env.NODE_ENV !== 'production';
  }

  static getProvider(platform: string): SocialProvider {
    const cleanPlatform = platform.toLowerCase().trim();

    const isMockCredentials = (clientId: string | undefined): boolean => {
      return (
        !clientId ||
        clientId.startsWith('mock_') ||
        clientId.startsWith('your_') ||
        clientId === ''
      );
    };

    const checkRealCredentials = (platformName: string, clientId: string | undefined): void => {
      if (isMockCredentials(clientId)) {
        if (!this.allowMock()) {
          throw new Error(
            `[ProviderFactory] ${platformName} Client ID is not configured. ` +
            `Cannot use Mock Provider in production. Set ${platformName.toUpperCase()}_CLIENT_ID in environment variables.`
          );
        }
      }
    };

    switch (cleanPlatform) {
      case 'twitter':
      case 'x':
        checkRealCredentials('Twitter', env.X_CLIENT_ID);
        if (isMockCredentials(env.X_CLIENT_ID)) {
          console.log(`ℹ️ [ProviderFactory] Twitter Client ID is missing or placeholder. Initializing Mock Provider.`);
          return new MockSocialProvider('twitter');
        }
        return new TwitterProvider();

      case 'linkedin':
        checkRealCredentials('LinkedIn', env.LINKEDIN_CLIENT_ID);
        if (isMockCredentials(env.LINKEDIN_CLIENT_ID)) {
          console.log(`ℹ️ [ProviderFactory] LinkedIn Client ID is missing or placeholder. Initializing Mock Provider.`);
          return new MockSocialProvider('linkedin');
        }
        return new LinkedInProvider();

      case 'youtube':
      case 'google':
        checkRealCredentials('Google/YouTube', env.GOOGLE_CLIENT_ID);
        if (isMockCredentials(env.GOOGLE_CLIENT_ID)) {
          console.log(`ℹ️ [ProviderFactory] Google/YouTube Client ID is missing or placeholder. Initializing Mock Provider.`);
          return new MockSocialProvider('youtube');
        }
        return new YouTubeProvider();

      default:
        throw new Error(`Platform provider '${platform}' is not supported.`);
    }
  }
}
export default ProviderFactory;

import { UserRepository } from '../user/user.repository';
import { AuthProvider } from '../user/user.model';
import { env } from '../../shared/config/env.config';
import { AppError } from '../../shared/errors/appError';
import ZenuxOAuth, { TokenResponse, UserInfo, ZenuxOAuthAuthorizationRequest } from 'zenuxs-oauth';

interface OAuthProfile {
  providerId: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
}

export class ZenuxsOAuthService {
  private static sharedStorage = new Map<string, any>();

  constructor(private userRepository: UserRepository) {}

  private getBackendUrl(): string {
    return process.env.BACKEND_URL || 
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${env.PORT}`);
  }

  private createOAuthInstance(provider?: string): ZenuxOAuth {
    const clientId = env.ZENUXS_CLIENT_ID || env.ZENUXS_GOOGLE_CLIENT_ID || env.ZENUXS_GITHUB_CLIENT_ID;
    const authServer = (env.ZENUXS_AUTH_SERVER || 'https://api.auth.zenuxs.in').replace(/\/$/, '');
    const backendUrl = this.getBackendUrl();
    const redirectUri = provider 
      ? `${backendUrl}/api/auth/oauth/zenuxs/${provider}/callback`
      : `${backendUrl}/api/auth/oauth/zenuxs/{provider}/callback`;

    const clientSecret = env.ZENUXS_CLIENT_SECRET || env.ZENUXS_GOOGLE_CLIENT_SECRET || env.ZENUXS_GITHUB_CLIENT_SECRET;

    if (!clientId) {
      throw AppError.badRequest('Zenuxs OAuth is not configured');
    }

    return new ZenuxOAuth({
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

  async getAuthorizationUrl(provider: string): Promise<string> {
    const oauth = this.createOAuthInstance(provider);
    const backendUrl = this.getBackendUrl();
    const redirectUri = `${backendUrl}/api/auth/oauth/zenuxs/${provider}/callback`;

    const authData: ZenuxOAuthAuthorizationRequest = await oauth.getAuthorizationUrl({
      redirectUri,
      extraAuthParams: {
        provider,
        connection: provider
      }
    });

    return authData.url;
  }

  async handleCallback(provider: string, code: string, state?: string): Promise<{ user: any; isNew: boolean }> {
    const oauth = this.createOAuthInstance(provider);
    const backendUrl = this.getBackendUrl();
    const redirectUri = `${backendUrl}/api/auth/oauth/zenuxs/${provider}/callback`;

    // Build the full callback URL from the redirect URI and the code/state params
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', code);
    if (state) {
      callbackUrl.searchParams.set('state', state);
    }

    let tokens: TokenResponse | null = null;

    try {
      tokens = await oauth.handleCallback(callbackUrl.toString(), { redirectUri });
    } catch (error: any) {
      throw AppError.unauthorized(`Zenuxs OAuth callback failed: ${error.message}`);
    }

    if (!tokens || !tokens.access_token) {
      throw AppError.unauthorized('Zenuxs OAuth did not return tokens');
    }

    // Fetch user info using the SDK's built-in method
    let userInfo: UserInfo;
    try {
      userInfo = await oauth.getUserInfo();
    } catch (error: any) {
      throw AppError.unauthorized(`Zenuxs userinfo failed: ${error.message}`);
    }

    const profile: OAuthProfile = {
      providerId: String(userInfo.sub || (userInfo as any).id || userInfo.email || `${provider}-${Date.now()}`),
      email: userInfo.email || '',
      fullName: userInfo.name || (userInfo as any).full_name || (userInfo as any).username || (userInfo as any).preferred_username || 'Zenuxs User',
      avatarUrl: userInfo.picture || (userInfo as any).avatar_url
    };

    const authProvider: AuthProvider = provider === 'google' ? 'zenuxs-google' : 'zenuxs-github';

    let user = await this.userRepository.findByOAuthProvider(authProvider, profile.providerId);
    if (!user && profile.email) {
      user = await this.userRepository.findByEmail(profile.email);
    }

    if (user) {
      if (provider === 'google' && !user.oauthProviderId) {
        user.oauthProviderId = profile.providerId;
        user.provider = 'zenuxs-google';
      } else if (provider === 'github' && !user.oauthProviderId) {
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

export default ZenuxsOAuthService;
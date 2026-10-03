import { UserRepository } from '../user/user.repository';
import { AuthProvider } from '../user/user.model';
import { env } from '../../shared/config/env.config';
import { AppError } from '../../shared/errors/appError';
import ZenuxOAuth, { TokenResponse, UserInfo, ZenuxOAuthAuthorizationRequest } from 'zenuxs-oauth';

/** Probe budget: short enough to keep the redirect feeling instant. */
const PROBE_TIMEOUT_MS = 4000;

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

  /**
   * The redirect URI registered with the Zenuxs OAuth client.
   *
   * These are the SDK's own callback endpoints (`callback.html`) — one per origin,
   * as registered on the Zenuxs dashboard. The auth server validates this string
   * exactly, so it must match the registered value byte-for-byte. It is derived
   * from BACKEND_URL / FRONTEND_URL rather than hardcoded so deployment only ever
   * changes configuration, never code.
   *
   * The backend callback route (`/api/auth/oauth/zenuxs/:provider/callback`) stays
   * available for a non-browser flow, but the browser flow lands on callback.html,
   * which hands the authorization code back to the app.
   */
  private getCallbackUrl(provider?: string): string {
    if (provider === 'google') {
      return `${this.getBackendUrl()}/callback.html`;
    }
    return `${this.getBackendUrl()}/callback.html`;
  }

  private createOAuthInstance(provider?: string): ZenuxOAuth {
    const clientId = env.ZENUXS_CLIENT_ID || env.ZENUXS_GOOGLE_CLIENT_ID || env.ZENUXS_GITHUB_CLIENT_ID;
    const authServer = (env.ZENUXS_AUTH_SERVER || 'https://api.auth.zenuxs.in').replace(/\/$/, '');
    const redirectUri = this.getCallbackUrl(provider);

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

/**
   * Probes the Zenuxs authorization endpoint to catch configuration rejections
   * before the user is sent there.
   *
   * The auth server answers an unregistered `redirect_uri` with HTTP 400 and a
   * JSON error. Without this check the user lands on an unstyled JSON page and
   * has no idea what went wrong. Anything other than a 4xx configuration error is
   * reported as ok so a healthy flow is never blocked or slowed by a real error.
   *
   * Short timeout: this sits in front of the redirect the user is waiting on.
   */
  async checkAuthorizationEndpoint(authorizationUrl: string): Promise<{ ok: boolean; reason: string }> {
    try {
      const response = await fetch(authorizationUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        headers: { Accept: 'application/json, text/html' }
      });

      if (response.status < 400) return { ok: true, reason: '' };

      const raw = await response.text().catch(() => '');
      let description = '';
      try {
        const parsed = JSON.parse(raw);
        description = parsed.error_description || parsed.error || '';
      } catch {
        description = '';
      }

      // Only the client-configuration failures are intercepted; anything else
      // (rate limiting, transient upstream trouble) is allowed through.
      const configurationFailure =
        description.toLowerCase().includes('redirect_uri') ||
        description.toLowerCase().includes('invalid client') ||
        description.toLowerCase().includes('unauthorized_client');
      if (!configurationFailure) return { ok: true, reason: '' };

      return {
        ok: false,
        reason: description || 'The Zenuxs auth server rejected this client configuration.'
      };
    } catch {
      // A probe failure must never block sign-in.
      return { ok: true, reason: '' };
    }
  }

  async getAuthorizationUrl(provider: string): Promise<string> {
    const oauth = this.createOAuthInstance(provider);
    const redirectUri = this.getCallbackUrl(provider);

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
    // Must be byte-identical to the URI sent on the authorize request, otherwise
    // the token exchange is rejected.
    const redirectUri = this.getCallbackUrl(provider);

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
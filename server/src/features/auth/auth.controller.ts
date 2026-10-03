import { Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { ZenuxsOAuthService } from './zenuxs-oauth.service';
import { ApiResponse } from '../../shared/utils/response.util';
import { AuthenticatedRequest } from '../../shared/middleware/rbac.middleware';
import { env } from '../../shared/config/env.config';

export class AuthController {
  constructor(
    private authService: AuthService,
    private zenuxsOAuthService: ZenuxsOAuthService
  ) {}

  register = async (req: any, res: Response, next: NextFunction) => {
    try {
      const result = await this.authService.register(req.body);
      return ApiResponse.success(res, result, 'OTP sent to email address', 201);
    } catch (error) {
      next(error);
    }
  };

  verifyOtp = async (req: any, res: Response, next: NextFunction) => {
    try {
      const { userId, code, purpose } = req.body;

      if (purpose === 'account_activation') {
        const result = await this.authService.verifyAccount(userId, code);
        return ApiResponse.success(res, result, 'Account activated successfully');
      }

      return ApiResponse.error(res, 'Invalid OTP purpose', null, 400);
    } catch (error) {
      next(error);
    }
  };

  login = async (req: any, res: Response, next: NextFunction) => {
    try {
      const result = await this.authService.login(req.body);
      return ApiResponse.success(res, result, 'Login successful');
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req: any, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;
      const tokens = await this.authService.refreshTokens(refreshToken);
      return ApiResponse.success(res, tokens, 'Token refreshed successfully');
    } catch (error) {
      next(error);
    }
  };

  /** One-time code exchange: OAuth callback hands the client a short-lived
   *  single-use code; tokens are issued here, never in the redirect URL. */
  exchange = async (req: any, res: Response, next: NextFunction) => {
    try {
      const { code } = req.body;
      if (!code || typeof code !== 'string') {
        return ApiResponse.error(res, 'Code is required', null, 400);
      }
      const result = await this.authService.exchangeAuthCode(code);
      return ApiResponse.success(res, result, 'Authenticated successfully');
    } catch (error) {
      next(error);
    }
  };

  me = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return ApiResponse.error(res, 'Authentication required', null, 401);
      }
      const profile = await this.authService.getProfile(req.user.id);
      return ApiResponse.success(res, profile, 'Profile retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  logout = async (req: any, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body || {};
      await this.authService.logout(refreshToken);
      return ApiResponse.success(res, null, 'Logged out successfully');
    } catch (error) {
      next(error);
    }
  };

  oauthRedirect = async (req: any, res: Response, next: NextFunction) => {
    const { provider } = req.params;
    try {
      const url = await this.zenuxsOAuthService.getAuthorizationUrl(provider);

      // The Zenuxs auth server rejects an unregistered redirect URI with a 400 and
      // a raw JSON body. Probing it here turns that into an actionable message on
      // SocialFlow instead of an unstyled JSON page. Only a configuration
      // rejection is intercepted; every other response passes straight through.
      const probe = await this.zenuxsOAuthService.checkAuthorizationEndpoint(url).catch(() => null);
      if (probe && !probe.ok) {
        return res.status(502).send(renderOAuthFailurePage(provider, probe.reason));
      }

      return res.redirect(url);
    } catch (error) {
      next(error);
    }
  };

  oauthCallback = async (req: any, res: Response, next: NextFunction) => {
    try {
      // The provider is a path segment on the API route, and a query param when
      // the request arrives from the registered callback.html page.
      const provider: string = req.params?.provider || String(req.query.provider || 'google');
      const { code, state } = req.query;

      if (!code || typeof code !== 'string') {
        const frontendUrl = env.FRONTEND_URL;
        return res.redirect(`${frontendUrl}/auth/callback?error=${encodeURIComponent('Authorization code is required')}`);
      }

      const stateStr = typeof state === 'string' ? state : undefined;
      const result = await this.authService.handleOAuthCallback(provider, code, stateStr, this.zenuxsOAuthService);

      const frontendUrl = env.FRONTEND_URL;
      const params = new URLSearchParams({
        provider: result.user.provider,
        isNew: String(result.isNew)
      });
      // Tokens are never placed in the URL. The client exchanges the
      // one-time code for tokens via POST /api/auth/exchange.
      return res.redirect(`${frontendUrl}/auth/callback#code=${encodeURIComponent(result.code)}&${params.toString()}`);
    } catch (error: any) {
      const frontendUrl = env.FRONTEND_URL;
      return res.redirect(`${frontendUrl}/auth/callback?error=${encodeURIComponent(error.message || 'OAuth login failed')}`);
    }
  };
}

/**
 * Readable failure page for an OAuth start-up failure. Escapes provider text and
 * states the actual cause; never dumps a raw provider payload at the user.
 */
export function renderOAuthFailurePage(provider: string, reason: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const label = provider === 'github' ? 'GitHub' : provider === 'google' ? 'Google' : provider;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign-in unavailable &middot; SocialFlow</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0b;color:#f4f4f5;
       font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px}
  .card{max-width:34rem;width:100%;border:1px solid #27272a;border-radius:14px;padding:32px;background:#111113}
  h1{margin:0 0 10px;font-size:1.15rem;letter-spacing:-0.01em}
  p{margin:0 0 12px;line-height:1.6;color:#a1a1aa;font-size:0.92rem}
  code{background:#1c1c1f;border:1px solid #27272a;border-radius:6px;padding:2px 6px;font-size:0.85em;color:#e4e4e7}
  a{display:inline-block;margin-top:12px;padding:10px 18px;border-radius:8px;background:#f4f4f5;
    color:#09090b;text-decoration:none;font-weight:600;font-size:0.9rem}
</style>
</head>
<body>
  <div class="card">
    <h1>Could not start ${esc(label)} sign-in</h1>
    <p>${esc(reason)}</p>
    <p>This is a configuration issue on the Zenuxs OAuth client, not something you did wrong.
       The callback URL registered with the Zenuxs dashboard does not match what this server sends.</p>
    <p>Expected callback shape: <code>/api/auth/oauth/zenuxs/${esc(provider)}/callback</code></p>
    <a href="/">Back to sign in</a>
  </div>
</body>
</html>`;
}

export default AuthController;


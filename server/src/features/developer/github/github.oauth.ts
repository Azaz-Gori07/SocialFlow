import jwt from 'jsonwebtoken';
import { env } from '../../../shared/config/env.config';
import { AppError } from '../../../shared/errors/appError';
import { GitHubUser, getUser } from './github.client';

/**
 * GitHub OAuth (read:user repo). The `state` parameter is a short-lived signed
 * JWT bound to the user, so a stolen callback link cannot be replayed to bind
 * someone else's GitHub account.
 */
const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const STATE_TTL_SECONDS = 600;
/** Same ceiling as the API client: a hung token exchange must not hang the callback. */
const FETCH_TIMEOUT_MS = 15_000;

function requireCredentials(): { clientId: string; clientSecret: string } {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    throw AppError.providerNotConfigured('GitHub');
  }
  return { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
}

export function getAuthUrl(userId: string): string {
  const { clientId } = requireCredentials();
  const state = jwt.sign({ userId, provider: 'github' }, env.JWT_SECRET, {
    expiresIn: STATE_TTL_SECONDS
  });
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'read:user repo',
    state
  });
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

/** Verify the state JWT and return the user it was issued for. */
export function verifyState(state: string): string {
  try {
    const claims = jwt.verify(state, env.JWT_SECRET) as { userId?: string; provider?: string };
    if (claims.provider !== 'github' || !claims.userId) {
      throw AppError.badRequest('Invalid OAuth state');
    }
    return claims.userId;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if ((error as { name?: string })?.name === 'TokenExpiredError') {
      throw AppError.badRequest('OAuth state expired — start over');
    }
    throw AppError.badRequest('Invalid OAuth state');
  }
}

export async function exchangeCode(code: string): Promise<string> {
  const { clientId, clientSecret } = requireCredentials();
  const resp = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  const data = (await resp.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
  };
  if (!resp.ok || !data.access_token) {
    throw AppError.unauthorized(data.error_description || 'GitHub authorization failed');
  }
  return data.access_token;
}

export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const { data } = await getUser({ token: accessToken });
  if (!data) throw AppError.providerError('Failed to fetch GitHub profile');
  return data;
}

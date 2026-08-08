import { AuthTokens } from '../interfaces/socialProvider.interface';
import { classifyProviderError, ProviderError } from '../errors/providerError';
import { logger } from '../../../shared/utils/logger';

export type ClientAuthMethod = 'client_secret_basic' | 'client_secret_post';

export interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  /** X requires Basic auth; Meta/LinkedIn/Google accept the client_secret in the body. */
  clientAuthMethod?: ClientAuthMethod;
  platform: string;
  /** Extra static query params for the authorization URL (e.g. PKCE is added per-call). */
  extraAuthParams?: Record<string, string>;
}

export interface ExchangeParams {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
  /** Provider-specific params (e.g. Meta's code_verifier, LinkedIn scope). */
  extraParams?: Record<string, string>;
}

export abstract class OAuth2Strategy {
  protected clientId: string;
  protected clientSecret: string;

  constructor(protected config: OAuth2Config) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
  }

  protected buildAuthorizationUrl(
    state: string,
    redirectUri: string,
    scopes: string[],
    extraParams: Record<string, string> = {}
  ): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
      scope: scopes.join(' '),
      ...this.config.extraAuthParams,
      ...extraParams,
    });
    return `${this.config.authUrl}?${params.toString()}`;
  }

  /**
   * POSTs to the token endpoint using the configured client auth method.
   * Provider error responses are classified (retryable vs permanent).
   */
  protected async tokenRequest(body: URLSearchParams): Promise<any> {
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (this.config.clientAuthMethod === 'client_secret_basic') {
      headers['Authorization'] = `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`;
    } else {
      body.set('client_id', this.clientId);
      body.set('client_secret', this.clientSecret);
    }

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    if (!response.ok) {
      const raw = await response.text();
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = undefined;
      }
      throw classifyProviderError(
        this.config.platform,
        `Token request failed: ${response.status} ${raw.slice(0, 300)}`,
        response.status,
        parsed
      );
    }

    return response.json();
  }

  protected parseTokens(data: any, fallbackRefreshToken?: string): AuthTokens {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || fallbackRefreshToken,
      expiresIn: data.expires_in !== undefined ? Number(data.expires_in) : undefined,
      expiresAt:
        data.expires_in !== undefined
          ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
          : undefined,
    };
  }

  protected async doCodeExchange(params: ExchangeParams): Promise<AuthTokens> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
    });
    if (params.codeVerifier) body.set('code_verifier', params.codeVerifier);
    for (const [k, v] of Object.entries(params.extraParams ?? {})) body.set(k, v);

    const data = await this.tokenRequest(body);
    logger.debug(`[oauth2] code exchanged for ${this.config.platform}`);
    return this.parseTokens(data);
  }

  protected async doRefresh(refreshToken: string, extraParams: Record<string, string> = {}): Promise<AuthTokens> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    for (const [k, v] of Object.entries(extraParams)) body.set(k, v);

    const data = await this.tokenRequest(body);
    return this.parseTokens(data, refreshToken);
  }

  /** Uniform authenticated GET against a provider endpoint with error classification. */
  protected async apiGet<T>(url: string, accessToken: string, extraHeaders: Record<string, string> = {}): Promise<T> {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, ...extraHeaders },
    });

    if (!response.ok) {
      const raw = await response.text();
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = undefined;
      }
      throw classifyProviderError(this.config.platform, `GET ${url} failed: ${response.status} ${raw.slice(0, 300)}`, response.status, parsed);
    }

    return response.json() as Promise<T>;
  }

  /** Uniform authenticated POST with JSON body and error classification. */
  protected async apiPost<T>(url: string, accessToken: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const raw = await response.text();
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = undefined;
      }
      throw classifyProviderError(this.config.platform, `POST ${url} failed: ${response.status} ${raw.slice(0, 300)}`, response.status, parsed);
    }

    return response.json() as Promise<T>;
  }

  protected notImplemented(method: string): never {
    throw new ProviderError(`${this.config.platform} does not implement ${method}`, this.config.platform, undefined, undefined, false);
  }
}
export default OAuth2Strategy;

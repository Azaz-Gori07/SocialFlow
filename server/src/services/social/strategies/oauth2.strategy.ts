import { TokenPayload } from '../interfaces/socialProvider.interface';

export abstract class OAuth2Strategy {
  constructor(
    protected clientId: string,
    protected clientSecret: string,
    protected authUrl: string,
    protected tokenUrl: string
  ) {}

  /**
   * Constructs authorization URL
   */
  protected getBaseAuthorizationUrl(
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
      ...extraParams
    });
    return `${this.authUrl}?${params.toString()}`;
  }

  /**
   * Exchanges code for access and refresh tokens using native fetch
   */
  protected async exchangeCodeForTokens(
    code: string,
    redirectUri: string,
    extraParams: Record<string, string> = {}
  ): Promise<TokenPayload> {
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

    const data = (await response.json()) as any;
    
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
  protected async refreshAccessToken(
    refreshToken: string,
    extraParams: Record<string, string> = {}
  ): Promise<TokenPayload> {
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

    const data = (await response.json()) as any;
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : undefined
    };
  }
}
export default OAuth2Strategy;

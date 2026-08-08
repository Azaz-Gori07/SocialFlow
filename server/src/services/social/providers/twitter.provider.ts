import { OAuth2Strategy } from '../strategies/oauth2.strategy';
import {
  SocialProvider,
  AuthTokens,
  AuthenticatedIdentity,
  ProviderAccount,
  ProviderCapabilities,
  PublishContext,
  MediaItem,
  PublishResult,
  ProviderComment,
  Paginated,
  InsightsData,
  ProviderValidationResult,
} from '../interfaces/socialProvider.interface';
import { capabilities } from '../interfaces/providerCapabilities';
import { env } from '../../../shared/config/env.config';
import { ProviderError } from '../errors/providerError';

const X_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

export class TwitterProvider extends OAuth2Strategy implements SocialProvider {
  readonly platform = 'twitter' as const;
  readonly provider = 'twitter' as const;

  constructor() {
    super({
      clientId: env.X_CLIENT_ID || '',
      clientSecret: env.X_CLIENT_SECRET || '',
      authUrl: 'https://twitter.com/i/oauth2/authorize',
      tokenUrl: 'https://api.twitter.com/2/oauth2/token',
      clientAuthMethod: 'client_secret_basic',
      platform: 'twitter',
    });
  }

  isConfigured(): boolean {
    return Boolean(env.X_CLIENT_ID && env.X_CLIENT_SECRET);
  }

  getAuthorizationUrl(params: { state: string; redirectUri: string; scopes?: string[]; codeChallenge?: string }): string {
    return this.buildAuthorizationUrl(params.state, params.redirectUri, params.scopes ?? X_SCOPES, {
      ...(params.codeChallenge
        ? { code_challenge: params.codeChallenge, code_challenge_method: 'S256' }
        : {}),
    });
  }

  async exchangeCode(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<AuthTokens> {
    if (!params.codeVerifier) {
      throw new ProviderError('X requires a PKCE code verifier', 'twitter', undefined, undefined, false);
    }
    return this.doCodeExchange({ code: params.code, redirectUri: params.redirectUri, codeVerifier: params.codeVerifier });
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    return this.doRefresh(refreshToken);
  }

  async getAuthenticatedIdentity(tokens: AuthTokens): Promise<AuthenticatedIdentity> {
    const data = await this.apiGet<{
      data?: { id?: string; username?: string; name?: string; profile_image_url?: string };
    }>('https://api.twitter.com/2/users/me?user.fields=profile_image_url,username,name', tokens.accessToken);

    if (!data.data?.id) throw new ProviderError('X returned no user identity', 'twitter', undefined, undefined, false);

    return {
      externalAccountId: data.data.id,
      username: data.data.username,
      displayName: data.data.name,
      avatarUrl: data.data.profile_image_url,
      scopes: X_SCOPES,
    };
  }

  async discoverAccounts(tokens: AuthTokens): Promise<ProviderAccount[]> {
    const identity = await this.getAuthenticatedIdentity(tokens);
    const account: ProviderAccount = {
      providerAccountId: identity.externalAccountId,
      accountType: 'profile',
      username: identity.username || identity.externalAccountId,
      displayName: identity.displayName || identity.username || identity.externalAccountId,
      avatarUrl: identity.avatarUrl,
      capabilities: this.getCapabilities({
        providerAccountId: identity.externalAccountId,
        accountType: 'profile',
        username: identity.username || '',
        displayName: identity.displayName || '',
      }),
    };
    return [account];
  }

  getCapabilities(_account: ProviderAccount): ProviderCapabilities {
    // X OAuth 2.0 (Authorization Code + PKCE) supports text posts only:
    // media upload requires OAuth 1.0a signed requests.
    return capabilities({
      readProfile: true,
      readPosts: true,
      createPost: true,
      deletePost: true,
      commentsWrite: true,
      webhooks: false,
    });
  }

  async validateConnection(tokens: AuthTokens, _account: ProviderAccount): Promise<ProviderValidationResult> {
    try {
      const data = await this.apiGet<{ data?: { id?: string } }>('https://api.twitter.com/2/users/me?user.fields=id', tokens.accessToken);
      return { healthy: Boolean(data.data?.id) };
    } catch (err) {
      if (err instanceof ProviderError && (err.status === 401 || err.status === 403)) {
        return { healthy: false, errorCode: 'auth_expired', errorMessage: err.message };
      }
      throw err;
    }
  }

  async createPost(ctx: PublishContext, input: { content: string; media?: MediaItem[] }): Promise<PublishResult> {
    const body: Record<string, unknown> = { text: input.content };
    if (input.media && input.media.length > 0) {
      throw new ProviderError(
        'X OAuth 2.0 apps cannot attach media (media upload requires OAuth 1.0a). Post text only.',
        'twitter',
        undefined,
        undefined,
        false
      );
    }

    const data = await this.apiPost<{ data?: { id?: string; edit_history_tweet_ids?: string[] } }>(
      'https://api.twitter.com/2/tweets',
      ctx.tokens.accessToken,
      body
    );
    if (!data.data?.id) throw new ProviderError('X returned no tweet id', 'twitter', undefined, undefined, false);

    return {
      externalPostId: data.data.id,
      externalPostUrl: `https://x.com/${ctx.account.username}/status/${data.data.id}`,
    };
  }

  async getPost(ctx: PublishContext, externalPostId: string): Promise<{ externalPostId: string; message?: string; url?: string; raw?: Record<string, any> }> {
    const data = await this.apiGet<{ data?: { id?: string; text?: string } }>(
      `https://api.twitter.com/2/tweets/${externalPostId}?tweet.fields=text`,
      ctx.tokens.accessToken
    );
    if (!data.data) throw new ProviderError('X returned no tweet', 'twitter', undefined, undefined, false);
    return {
      externalPostId: data.data.id!,
      message: data.data.text,
      url: `https://x.com/${ctx.account.username}/status/${data.data.id}`,
      raw: data,
    };
  }

  async deletePost(ctx: PublishContext, externalPostId: string): Promise<void> {
    await fetch(`https://api.twitter.com/2/tweets/${externalPostId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ctx.tokens.accessToken}` },
    }).then(async (r) => {
      if (!r.ok) {
        const raw = await r.text();
        throw new ProviderError(`X delete failed: ${r.status} ${raw.slice(0, 200)}`, 'twitter', r.status);
      }
    });
  }

  async replyToComment(ctx: PublishContext, externalCommentId: string, message: string): Promise<{ externalReplyId: string }> {
    const data = await this.apiPost<{ data?: { id?: string } }>('https://api.twitter.com/2/tweets', ctx.tokens.accessToken, {
      text: message,
      reply: { in_reply_to_tweet_id: externalCommentId },
    });
    if (!data.data?.id) throw new ProviderError('X returned no reply id', 'twitter', undefined, undefined, false);
    return { externalReplyId: data.data.id };
  }

  resolvePostUrl(externalPostId: string, account: ProviderAccount): string | undefined {
    return `https://x.com/${account.username}/status/${externalPostId}`;
  }

  // Not supported for OAuth 2.0 apps:
  async listComments(): Promise<Paginated<ProviderComment>> {
    throw new ProviderError('X does not expose a public comment listing endpoint for OAuth 2.0 apps', 'twitter', undefined, undefined, false);
  }
  async getInsights(): Promise<InsightsData[]> {
    throw new ProviderError('X insights require enterprise API access', 'twitter', undefined, undefined, false);
  }
}
export default TwitterProvider;

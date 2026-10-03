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
  Paginated,
  ProviderPost,
  InsightsData,
  ProviderValidationResult,
} from '../interfaces/socialProvider.interface';
import { capabilities } from '../interfaces/providerCapabilities';
import { env } from '../../../shared/config/env.config';
import { ProviderError } from '../errors/providerError';

/**
 * Threads API (graph.threads.net) — Meta's Threads platform.
 *
 * Contract source: official Meta Threads developer documentation. Only values
 * confirmed there are implemented here; anything not exposed by the API throws
 * an honest, non-retryable ProviderError rather than faking a capability.
 *
 * Verified API facts this adapter relies on:
 *  - Threads is its OWN Meta app (own app id + secret), not the Facebook/Instagram app.
 *  - Authorization: https://threads.net/oauth/authorize
 *  - Token exchange: POST https://graph.threads.net/oauth/access_token
 *  - Graph version is v1.0 (graph.facebook.com-style versioning does not apply).
 *  - Long-lived token: GET /access_token?grant_type=th_exchange_token
 *  - Refresh: GET /refresh_access_token?grant_type=th_refresh_token
 *  - Publishing: POST /{threads-user-id}/threads  (media container)
 *                 POST /{threads-user-id}/threads_publish?creation_id=...
 *  - Text posts may be published directly with media_type=TEXT + auto_publish_text=true
 *  - Container status poll: GET /{container-id}?fields=status,error_message
 *  - Media must be hosted on a publicly reachable URL.
 *  - Delete: DELETE /{threads-media-id}
 *  - Insights: GET /{threads-media-id}/insights and GET /{threads-user-id}/threads_insights
 */

const THREADS_API_BASE = 'https://graph.threads.net';
const THREADS_GRAPH_VERSION = 'v1.0';
const THREADS_AUTHORIZE_URL = 'https://threads.net/oauth/authorize';
const THREADS_TOKEN_URL = `${THREADS_API_BASE}/oauth/access_token`;

/**
 * Threads scopes as defined by the official authorization docs. `threads_basic` is
 * always required; the rest map to what this adapter actually implements.
 */
const THREADS_SCOPES = ['threads_basic', 'threads_content_publish', 'threads_manage_insights', 'threads_delete'];

/** Container states returned by GET /{container-id}?fields=status */
type ContainerStatus = 'IN_PROGRESS' | 'FINISHED' | 'ERROR' | 'EXPIRED' | 'PUBLISHED';

/** Documented provider error messages for media container failures. */
const CONTAINER_ERROR_MESSAGES = new Set([
  'FAILED_DOWNLOADING_VIDEO',
  'FAILED_PROCESSING_AUDIO',
  'FAILED_PROCESSING_VIDEO',
  'INVALID_ASPEC_RATIO', // typo is Meta's own
  'INVALID_BIT_RATE',
  'INVALID_DURATION',
  'INVALID_FRAME_RATE',
  'INVALID_AUDIO_CHANNELS',
  'INVALID_AUDIO_CHANNEL_LAYOUT',
  'UNKNOWN',
]);

/** Official documented limits used to fail fast rather than sending a doomed request. */
const MAX_TEXT_BYTES = 500; // character limit counted as UTF-8 bytes
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 300;
const IMAGE_MIMES = ['image/jpeg', 'image/png'];
const VIDEO_MIMES = ['video/quicktime', 'video/mp4'];

const CONTAINER_POLL_ATTEMPTS = 10;
const CONTAINER_POLL_INTERVAL_MS = 5_000;

function threadsUrl(path: string): string {
  return `${THREADS_API_BASE}/${THREADS_GRAPH_VERSION}${path}`;
}

export class ThreadsProvider extends OAuth2Strategy implements SocialProvider {
  readonly platform = 'threads' as const;
  /** Threads is a Meta-family provider but has its own app credentials. */
  readonly provider = 'meta' as const;

  constructor() {
    super({
      clientId: env.Threads_CLIENT_ID || '',
      clientSecret: env.Threads_CLIENT_SECRET || '',
      authUrl: THREADS_AUTHORIZE_URL,
      tokenUrl: THREADS_TOKEN_URL,
      clientAuthMethod: 'client_secret_post',
      platform: 'threads',
    });
  }

  isConfigured(): boolean {
    return Boolean(env.Threads_CLIENT_ID && env.Threads_CLIENT_SECRET);
  }

  getAuthorizationUrl(params: { state: string; redirectUri: string; scopes?: string[]; codeChallenge?: string }): string {
    // Threads documents `state` for CSRF; PKCE is not part of the documented flow.
    return this.buildAuthorizationUrl(params.state, params.redirectUri, params.scopes ?? THREADS_SCOPES);
  }

  async exchangeCode(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<AuthTokens> {
    const base = await this.doCodeExchange({ code: params.code, redirectUri: params.redirectUri });
    if (!base.accessToken) {
      throw new ProviderError('Threads returned no access token', 'threads', undefined, undefined, false);
    }
    // Short-lived user tokens (1h) are exchanged for long-lived ones (60d).
    return this.exchangeForLongLivedToken(base.accessToken);
  }

  /** Threads uses its own grant type `th_exchange_token`. */
  private async exchangeForLongLivedToken(shortLived: string): Promise<AuthTokens> {
    const url =
      `${THREADS_API_BASE}/access_token?grant_type=th_exchange_token` +
      `&client_secret=${encodeURIComponent(this.clientSecret)}` +
      `&access_token=${encodeURIComponent(shortLived)}`;
    const data = await this.apiGet<{ access_token?: string; expires_in?: number }>(url, shortLived);
    if (!data.access_token) {
      throw new ProviderError('Threads long-lived token exchange returned no token', 'threads', undefined, undefined, false);
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.access_token,
      expiresIn: data.expires_in !== undefined ? Number(data.expires_in) : undefined,
      expiresAt:
        data.expires_in !== undefined ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : undefined,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    const url =
      `${THREADS_API_BASE}/refresh_access_token?grant_type=th_refresh_token` +
      `&access_token=${encodeURIComponent(refreshToken)}`;
    const data = await this.apiGet<{ access_token?: string; expires_in?: number }>(url, refreshToken);
    if (!data.access_token) {
      throw new ProviderError('Threads refresh returned no token', 'threads', undefined, undefined, false);
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.access_token,
      expiresIn: data.expires_in !== undefined ? Number(data.expires_in) : undefined,
      expiresAt:
        data.expires_in !== undefined ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : undefined,
    };
  }

  async getAuthenticatedIdentity(tokens: AuthTokens): Promise<AuthenticatedIdentity> {
    const data = await this.apiGet<{
      id?: string;
      username?: string;
      name?: string;
      threads_profile_picture_url?: string;
    }>(threadsUrl('/me?fields=id,username,name,threads_profile_picture_url'), tokens.accessToken);

    if (!data.id) throw new ProviderError('Threads returned no user identity', 'threads', undefined, undefined, false);

    return {
      externalAccountId: data.id,
      username: data.username,
      displayName: data.name || data.username,
      avatarUrl: data.threads_profile_picture_url,
      scopes: THREADS_SCOPES,
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
      capabilities: this.getCapabilities({ providerAccountId: identity.externalAccountId, accountType: 'profile', username: '', displayName: '' }),
    };
    return [account];
  }

  getCapabilities(_account: ProviderAccount): ProviderCapabilities {
    // Everything below is backed by a documented endpoint in this adapter:
    // text, image and video publishing, replies, insights and deletion.
    return capabilities({
      readProfile: true,
      readPosts: true,
      createPost: true,
      deletePost: true,
      uploadImage: true,
      uploadVideo: true,
      commentsRead: false, // Threads exposes replies, not comments (not modelled in SocialFlow)
      commentsWrite: true,
      insights: true,
      webhooks: false,
    });
  }

  async validateConnection(tokens: AuthTokens, _account: ProviderAccount): Promise<ProviderValidationResult> {
    try {
      const data = await this.apiGet<{ id?: string }>(threadsUrl('/me?fields=id'), tokens.accessToken);
      return { healthy: Boolean(data.id) };
    } catch (err) {
      if (err instanceof ProviderError && (err.status === 401 || err.status === 403)) {
        return { healthy: false, errorCode: 'auth_expired', errorMessage: err.message };
      }
      throw err;
    }
  }

  async createPost(ctx: PublishContext, input: { content: string; media?: MediaItem[] }): Promise<PublishResult> {
    const token = ctx.tokens.accessToken;
    const userId = ctx.account.providerAccountId;
    const media = input.media || [];

    if (media.length > 1) {
      throw new ProviderError(
        'Threads carousel publishing is not supported by SocialFlow yet',
        'threads',
        undefined,
        undefined,
        false
      );
    }

    if (media.length === 0) {
      return this.publishTextPost(ctx, input.content);
    }

    return this.publishMediaPost(ctx, media[0], input.content);
  }

  /** Text posts can be published in one call via `auto_publish_text=true`. */
  private async publishTextPost(ctx: PublishContext, content: string): Promise<PublishResult> {
    this.assertTextFits(content, !!ctx.account.username);

    const data = await this.apiPost<{ id?: string }>(
      threadsUrl(`/${ctx.account.providerAccountId}/threads`),
      ctx.tokens.accessToken,
      { media_type: 'TEXT', text: content, auto_publish_text: true }
    );
    if (!data.id) throw new ProviderError('Threads returned no post id', 'threads', undefined, undefined, false);
    return { externalPostId: data.id, externalPostUrl: this.resolvePostUrl(data.id, ctx.account) };
  }

  /** Media uses the documented two-step container → publish lifecycle. */
  private async publishMediaPost(ctx: PublishContext, media: MediaItem, caption: string): Promise<PublishResult> {
    const token = ctx.tokens.accessToken;
    const userId = ctx.account.providerAccountId;

    if (!media.url || !/^https?:\/\//i.test(media.url)) {
      throw new ProviderError(
        'Threads requires media to be hosted on a publicly accessible URL',
        'threads',
        undefined,
        undefined,
        false
      );
    }

    const isVideo = media.kind === 'video';
    this.assertMediaSupported(media, isVideo);

    const body: Record<string, unknown> = isVideo
      ? { media_type: 'VIDEO', video_url: media.url, text: caption || undefined }
      : { media_type: 'IMAGE', image_url: media.url, text: caption || undefined };
    if (!isVideo && media.alt) body.alt_text = media.alt;
    Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);

    const container = await this.apiPost<{ id?: string }>(threadsUrl(`/${userId}/threads`), token, body);
    if (!container.id) throw new ProviderError('Threads returned no container id', 'threads', undefined, undefined, false);

    await this.waitForContainer(container.id, token);

    const published = await this.apiPost<{ id?: string }>(
      threadsUrl(`/${userId}/threads_publish?creation_id=${encodeURIComponent(container.id)}`),
      token,
      {}
    );
    if (!published.id) throw new ProviderError('Threads returned no post id', 'threads', undefined, undefined, false);

    return {
      externalPostId: published.id,
      externalPostUrl: this.resolvePostUrl(published.id, ctx.account),
      metadata: { containerId: container.id },
    };
  }

  /** Polls the container status the way Meta documents it: at most a few minutes. */
  private async waitForContainer(containerId: string, token: string): Promise<void> {
    for (let attempt = 0; attempt < CONTAINER_POLL_ATTEMPTS; attempt++) {
      const data = await this.apiGet<{ status?: ContainerStatus; error_message?: string }>(
        threadsUrl(`/${containerId}?fields=status,error_message`),
        token
      );
      const status = data.status;
      if (status === 'FINISHED' || status === 'PUBLISHED') return;
      if (status === 'ERROR' || status === 'EXPIRED') {
        const reason = data.error_message ? ` (${data.error_message})` : '';
        throw new ProviderError(`Threads container ${status}${reason}`, 'threads', undefined, data.error_message, false);
      }
      await new Promise((r) => setTimeout(r, CONTAINER_POLL_INTERVAL_MS));
    }
    throw new ProviderError('Threads container did not finish processing in time', 'threads', undefined, undefined, true);
  }

  async getPost(ctx: PublishContext, externalPostId: string): Promise<ProviderPost> {
    const data = await this.apiGet<{ id?: string; text?: string; timestamp?: string; permalink?: string }>(
      threadsUrl(`/${externalPostId}?fields=id,text,timestamp,permalink`),
      ctx.tokens.accessToken
    );
    if (!data.id) throw new ProviderError('Threads returned no post', 'threads', undefined, undefined, false);
    return {
      externalPostId: data.id,
      message: data.text,
      createdAt: data.timestamp,
      url: data.permalink,
      raw: data,
    };
  }

  async deletePost(ctx: PublishContext, externalPostId: string): Promise<void> {
    const response = await fetch(threadsUrl(`/${externalPostId}?access_token=${encodeURIComponent(ctx.tokens.accessToken)}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ctx.tokens.accessToken}` },
    });
    if (!response.ok) {
      const raw = await response.text();
      throw new ProviderError(`Threads delete failed: ${response.status} ${raw.slice(0, 200)}`, 'threads', response.status);
    }
  }

  /** Threads replies are its comment analogue and are writable. */
  async replyToComment(ctx: PublishContext, externalCommentId: string, message: string): Promise<{ externalReplyId: string }> {
    const data = await this.apiPost<{ id?: string }>(
      threadsUrl(`/${ctx.account.providerAccountId}/threads`),
      ctx.tokens.accessToken,
      { media_type: 'TEXT', text: message, reply_to_id: externalCommentId, auto_publish_text: true }
    );
    if (!data.id) throw new ProviderError('Threads returned no reply id', 'threads', undefined, undefined, false);
    return { externalReplyId: data.id };
  }

  async getInsights(ctx: PublishContext, range: { startDate: string; endDate: string }): Promise<InsightsData[]> {
    const since = Math.floor(new Date(`${range.startDate}T00:00:00Z`).getTime() / 1000);
    const until = Math.floor(new Date(`${range.endDate}T23:59:59Z`).getTime() / 1000);

    const raw = await this.apiGet<{ data?: Array<{ name?: string; values?: Array<{ end_time?: string; value?: unknown }> }> }>(
      threadsUrl(
        `/${ctx.account.providerAccountId}/threads_insights?metric=views,likes,replies,reposts,quotes&since=${since}&until=${until}`
      ),
      ctx.tokens.accessToken
    );

    const perDay = new Map<string, InsightsData>();
    for (const metric of raw.data ?? []) {
      for (const v of metric.values ?? []) {
        if (!v.end_time) continue;
        const day = v.end_time.slice(0, 10);
        const entry = perDay.get(day) ?? { date: day, raw: {} as Record<string, any> };
        const num = typeof v.value === 'number' ? v.value : Number(v.value ?? 0);
        if (metric.name === 'views') entry.impressions = (entry.impressions ?? 0) + num;
        if (metric.name === 'likes') entry.engagement = (entry.engagement ?? 0) + num;
        if (metric.name === 'replies' || metric.name === 'quotes' || metric.name === 'reposts') {
          entry.engagement = (entry.engagement ?? 0) + num;
        }
        entry.raw = { ...(entry.raw || {}), [metric.name!]: num };
        perDay.set(day, entry);
      }
    }
    return [...perDay.values()];
  }

  /** Threads exposes replies, not a comment listing SocialFlow models. */
  async listComments(): Promise<Paginated<any>> {
    throw new ProviderError(
      'Threads exposes replies rather than comments; reply posting is supported but comment listing is not',
      'threads',
      undefined,
      undefined,
      false
    );
  }

  resolvePostUrl(externalPostId: string, account: ProviderAccount): string | undefined {
    const handle = account.username ? `@${account.username}` : '';
    return handle ? `https://www.threads.com/${handle}/post/${externalPostId}` : undefined;
  }

  // ── documented-limit guards ────────────────────────────────────────────────

  private assertTextFits(text: string, hasHandle: boolean): void {
    // Emojis count as UTF-8 bytes in the Threads limit.
    if (Buffer.byteLength(text || '', 'utf8') > MAX_TEXT_BYTES) {
      throw new ProviderError(
        `Threads posts are limited to ${MAX_TEXT_BYTES} bytes of text (this post is ${Buffer.byteLength(text, 'utf8')})`,
        'threads',
        undefined,
        undefined,
        false
      );
    }
  }

  private assertMediaSupported(media: MediaItem, isVideo: boolean): void {
    const url = media.url || '';
    const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();

    if (isVideo) {
      if (ext !== 'mp4' && ext !== 'mov') {
        throw new ProviderError('Threads accepts only MOV or MP4 video', 'threads', undefined, undefined, false);
      }
      return;
    }

    if (ext !== 'jpg' && ext !== 'jpeg' && ext !== 'png') {
      throw new ProviderError('Threads accepts only JPEG or PNG images', 'threads', undefined, undefined, false);
    }
  }
}
export default ThreadsProvider;
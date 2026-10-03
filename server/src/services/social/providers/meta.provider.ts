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
import { AppError } from '../../../shared/errors/appError';
import { env } from '../../../shared/config/env.config';
import { logger } from '../../../shared/utils/logger';
import { ProviderError } from '../errors/providerError';

const GRAPH_VERSION = 'v23.0';
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

const META_SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_read_user_content',
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_comments',
  'instagram_business_manage_insights',
];

interface GraphError {
  error?: { code?: number; message?: string; subcode?: number; type?: string };
}

export class MetaProvider extends OAuth2Strategy implements SocialProvider {
  readonly platform = 'facebook' as const;
  readonly provider = 'meta' as const;

  constructor() {
    super({
      clientId: env.meta.clientId,
      clientSecret: env.meta.clientSecret,
      authUrl: 'https://www.facebook.com/v23.0/dialog/oauth',
      tokenUrl: `${GRAPH_URL}/oauth/access_token`,
      clientAuthMethod: 'client_secret_post',
      platform: 'facebook',
      // Facebook Login for Business: when a configuration ID is set, Meta binds
      // the login to that configuration. Omitted entirely when unset, so the
      // standard Facebook Login flow continues unchanged.
      ...(env.meta.loginConfigId ? { extraAuthParams: { config_id: env.meta.loginConfigId } } : {}),
    });
  }

  isConfigured(): boolean {
    return Boolean(env.meta.clientId && env.meta.clientSecret);
  }

  getAuthorizationUrl(params: { state: string; redirectUri: string; scopes?: string[]; codeChallenge?: string }): string {
    return this.buildAuthorizationUrl(params.state, params.redirectUri, params.scopes ?? META_SCOPES, {
      ...(params.codeChallenge
        ? { code_challenge: params.codeChallenge, code_challenge_method: 'S256' }
        : {}),
    });
  }

  async exchangeCode(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<AuthTokens> {
    const base = await this.doCodeExchange({
      code: params.code,
      redirectUri: params.redirectUri,
      codeVerifier: params.codeVerifier,
    });

    // Meta short-lived user tokens (2h) must be exchanged for long-lived (60d) tokens.
    if (!base.accessToken) throw new ProviderError('Meta returned no access token', 'facebook', undefined, undefined, false);
    const longLived = await this.exchangeForLongLivedToken(base.accessToken);
    return { ...longLived, refreshToken: longLived.accessToken };
  }

  private async exchangeForLongLivedToken(shortLived: string): Promise<AuthTokens> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      fb_exchange_token: shortLived,
    });
    const data = await this.tokenRequest(params);
    return this.parseTokens(data);
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    // Meta has no refresh tokens: refreshing means re-extending the long-lived token while valid.
    const data = await this.tokenRequest(
      new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        fb_exchange_token: refreshToken,
      })
    );
    return this.parseTokens(data, refreshToken);
  }

  async getAuthenticatedIdentity(tokens: AuthTokens): Promise<AuthenticatedIdentity> {
    const data = await this.apiGet<{ id: string; name?: string; email?: string; picture?: { data?: { url?: string } } }>(
      `${GRAPH_URL}/me?fields=id,name,email,picture{url}`,
      tokens.accessToken
    );
    return {
      externalAccountId: data.id,
      displayName: data.name,
      email: data.email,
      avatarUrl: data.picture?.data?.url,
      scopes: META_SCOPES,
    };
  }

  async discoverAccounts(tokens: AuthTokens): Promise<ProviderAccount[]> {
    const pages = await this.apiGet<{
      data?: Array<{ id: string; name?: string; username?: string; access_token?: string; picture?: { data?: { url?: string } } }>;
      paging?: { cursors?: { after?: string } };
    }>(`${GRAPH_URL}/me/accounts?fields=id,name,username,access_token,picture{url}&limit=100`, tokens.accessToken);

    const accounts: ProviderAccount[] = [];
    for (const page of pages.data ?? []) {
      if (!page.access_token) continue;
      const pageAccount: ProviderAccount = {
        providerAccountId: page.id,
        accountType: 'page',
        username: page.username || page.name || page.id,
        displayName: page.name || page.id,
        avatarUrl: page.picture?.data?.url,
        accountToken: page.access_token,
        capabilities: this.getCapabilities({
          providerAccountId: page.id,
          accountType: 'page',
          username: page.username || page.name || '',
          displayName: page.name || '',
          accountToken: page.access_token,
        } as ProviderAccount),
      };
      accounts.push(pageAccount);

      // Instagram business account linked to this page (if any).
      try {
        const ig = await this.apiGet<{
          instagram_business_account?: { id?: string; username?: string; profile_picture_url?: string };
        }>(`${GRAPH_URL}/${page.id}?fields=instagram_business_account{id,username,profile_picture_url}`, page.access_token);

        if (ig.instagram_business_account?.id) {
          const igAccount: ProviderAccount = {
            providerAccountId: ig.instagram_business_account.id,
            providerParentAccountId: page.id,
            accountType: 'business',
            username: ig.instagram_business_account.username || ig.instagram_business_account.id,
            displayName: ig.instagram_business_account.username || ig.instagram_business_account.id,
            avatarUrl: ig.instagram_business_account.profile_picture_url,
            accountToken: page.access_token,
            capabilities: this.getCapabilities({
              providerAccountId: ig.instagram_business_account.id,
              accountType: 'business',
              username: ig.instagram_business_account.username || '',
              displayName: ig.instagram_business_account.username || '',
              accountToken: page.access_token,
            } as ProviderAccount),
          };
          accounts.push(igAccount);
        }
      } catch (err) {
        logger.warn(`[meta] instagram lookup failed for page ${page.id}`, { error: String(err) });
      }
    }

    return accounts;
  }

  getCapabilities(account: ProviderAccount): ProviderCapabilities {
    if (account.accountType === 'page') {
      return capabilities({
        readProfile: true,
        readPosts: true,
        createPost: true,
        deletePost: true,
        uploadImage: true,
        uploadVideo: true,
        carousel: true,
        reels: true,
        commentsRead: true,
        commentsWrite: true,
        insights: true,
        webhooks: true,
      });
    }
    // Instagram business account
    return capabilities({
      readProfile: true,
      readPosts: true,
      createPost: true,
      deletePost: true,
      uploadImage: true,
      uploadVideo: true,
      stories: true,
      reels: true,
      commentsRead: true,
      commentsWrite: true,
      insights: true,
      webhooks: true,
    });
  }

  async validateConnection(tokens: AuthTokens, account: ProviderAccount): Promise<ProviderValidationResult> {
    try {
      const data = await this.apiGet<{ id?: string }>(`${GRAPH_URL}/me?fields=id`, account.accountToken || tokens.accessToken);
      return { healthy: Boolean(data.id) };
    } catch (err) {
      if (err instanceof ProviderError && (err.status === 401 || err.providerCode === '190' || err.providerCode === '200')) {
        return { healthy: false, errorCode: 'auth_expired', errorMessage: err.message };
      }
      throw err;
    }
  }

  /**
   * Media upload for Meta is part of the publishing lifecycle:
   * - Facebook Page: upload photo/video directly.
   * - Instagram: media is referenced by URL inside the container — nothing to upload.
   */
  async uploadMedia(ctx: PublishContext, media: MediaItem): Promise<{ externalMediaId?: string; metadata?: Record<string, any> }> {
    if (ctx.account.accountType === 'page') {
      const token = ctx.account.accountToken || ctx.tokens.accessToken;
      if (media.kind === 'image') {
        const res = await this.apiPost<{ id?: string }>(
          `${GRAPH_URL}/${ctx.account.providerAccountId}/photos`,
          token,
          { url: media.url, caption: media.alt }
        );
        return { externalMediaId: res.id };
      }
      const res = await this.apiPost<{ id?: string }>(
        `${GRAPH_URL}/${ctx.account.providerAccountId}/videos`,
        token,
        { file_url: media.url, description: media.alt }
      );
      return { externalMediaId: res.id };
    }
    // Instagram: container creation happens in createPost with the URL.
    return {};
  }

  async createPost(ctx: PublishContext, input: { content: string; media?: MediaItem[] }): Promise<PublishResult> {
    if (ctx.account.accountType === 'business') {
      return this.createInstagramPost(ctx, input);
    }
    return this.createFacebookPagePost(ctx, input);
  }

  private async createFacebookPagePost(ctx: PublishContext, input: { content: string; media?: MediaItem[] }): Promise<PublishResult> {
    const token = ctx.account.accountToken || ctx.tokens.accessToken;
    const pageId = ctx.account.providerAccountId;

    if (!input.media || input.media.length === 0) {
      const res = await this.apiPost<{ id?: string }>(`${GRAPH_URL}/${pageId}/feed`, token, { message: input.content });
      if (!res.id) throw new ProviderError('Facebook returned no post id', 'facebook', undefined, undefined, false);
      const [pagePart, postPart] = res.id.split('_');
      return {
        externalPostId: res.id,
        externalPostUrl: `https://www.facebook.com/${pagePart}/posts/${postPart}`,
      };
    }

    // Media posts: upload each asset, then publish as a feed post with attached media.
    const mediaIds: string[] = [];
    for (const m of input.media) {
      const uploaded = await this.uploadMedia(ctx, m);
      if (!uploaded.externalMediaId) throw new ProviderError('Facebook media upload failed', 'facebook', undefined, undefined, false);
      mediaIds.push(uploaded.externalMediaId);
    }

    const body: Record<string, unknown> = { message: input.content };
    if (mediaIds.length === 1) {
      const mediaId = mediaIds[0];
      if (input.media[0].kind === 'video') {
        body.video_id = mediaId;
        body.published = true;
      } else {
        body.object_attachment = mediaId;
      }
      const res = await this.apiPost<{ id?: string }>(`${GRAPH_URL}/${pageId}/feed`, token, body);
      if (!res.id) throw new ProviderError('Facebook returned no post id', 'facebook', undefined, undefined, false);
      return {
        externalPostId: res.id,
        externalPostUrl:
          input.media[0].kind === 'image'
            ? `https://www.facebook.com/photo.php?fbid=${mediaId}`
            : `https://www.facebook.com/${pageId}/videos/${mediaId}`,
      };
    }

    // Multiple images: link each as children of the first.
    const first = mediaIds[0];
    for (const child of mediaIds.slice(1)) {
      await this.apiPost<{ id?: string }>(`${GRAPH_URL}/${child}`, token, { attached_media: [first] });
    }
    body.attached_media = mediaIds.map((id) => ({ media_fbid: id }));
    const res = await this.apiPost<{ id?: string }>(`${GRAPH_URL}/${pageId}/feed`, token, body);
    if (!res.id) throw new ProviderError('Facebook returned no post id', 'facebook', undefined, undefined, false);
    const [, postPart] = res.id.split('_');
    return { externalPostId: res.id, externalPostUrl: `https://www.facebook.com/${pageId}/posts/${postPart}` };
  }

  private async createInstagramPost(ctx: PublishContext, input: { content: string; media?: MediaItem[] }): Promise<PublishResult> {
    const token = ctx.account.accountToken || ctx.tokens.accessToken;
    const igUserId = ctx.account.providerAccountId;
    const media = input.media?.[0];

    if (!media) {
      throw new ProviderError('Instagram publishing requires a media asset (image or video)', 'instagram', undefined, undefined, false);
    }

    const mediaType = media.kind === 'video' ? 'REELS' : 'IMAGE';
    const containerBody: Record<string, unknown> = {
      image_url: media.kind === 'image' ? media.url : undefined,
      video_url: media.kind === 'video' ? media.url : undefined,
      caption: input.content,
      media_type: mediaType,
    };
    Object.keys(containerBody).forEach((k) => containerBody[k] === undefined && delete containerBody[k]);

    const container = await this.apiPost<{ id?: string }>(`${GRAPH_URL}/${igUserId}/media`, token, containerBody);
    if (!container.id) throw new ProviderError('Instagram returned no container id', 'instagram', undefined, undefined, false);

    // Wait for container processing (real Instagram lifecycle).
    let containerStatus = 'IN_PROGRESS';
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      const status = await this.apiGet<{ status_code?: string }>(
        `${GRAPH_URL}/${container.id}?fields=status_code`,
        token
      );
      containerStatus = status.status_code || 'IN_PROGRESS';
      if (containerStatus === 'FINISHED') break;
      if (containerStatus === 'ERROR' || containerStatus === 'EXPIRED') {
        throw new ProviderError(`Instagram container failed with status ${containerStatus}`, 'instagram', undefined, undefined, false);
      }
    }
    if (containerStatus !== 'FINISHED') {
      throw new ProviderError('Instagram container did not finish processing in time', 'instagram', undefined, undefined, true);
    }

    const published = await this.apiPost<{ id?: string }>(
      `${GRAPH_URL}/${igUserId}/media_publish`,
      token,
      { creation_id: container.id }
    );
    if (!published.id) throw new ProviderError('Instagram returned no media id', 'instagram', undefined, undefined, false);

    return {
      externalPostId: published.id,
      externalPostUrl: `https://www.instagram.com/p/${published.id}/`,
      metadata: { containerId: container.id },
    };
  }

  async getPost(ctx: PublishContext, externalPostId: string): Promise<{ externalPostId: string; message?: string; url?: string; raw?: Record<string, any> }> {
    const token = ctx.account.accountToken || ctx.tokens.accessToken;
    const fields =
      ctx.account.accountType === 'business'
        ? `${GRAPH_URL}/${externalPostId}?fields=id,caption,permalink,media_type`
        : `${GRAPH_URL}/${externalPostId}?fields=id,message,created_time`;
    const data = await this.apiGet<any>(fields, token);
    if (!data.id) throw new ProviderError('Provider returned no post', this.platform, undefined, undefined, false);
    return {
      externalPostId: data.id as string,
      message: data.caption || data.message,
      url: data.permalink,
      raw: data,
    };
  }

  async deletePost(ctx: PublishContext, externalPostId: string): Promise<void> {
    const token = ctx.account.accountToken || ctx.tokens.accessToken;
    await this.apiPost<{ success?: boolean }>(`${GRAPH_URL}/${externalPostId}`, token, {});
  }

  async getInsights(ctx: PublishContext, range: { startDate: string; endDate: string }): Promise<InsightsData[]> {
    const token = ctx.account.accountToken || ctx.tokens.accessToken;
    const id = ctx.account.providerAccountId;
    const since = Math.floor(new Date(`${range.startDate}T00:00:00Z`).getTime() / 1000);
    const until = Math.floor(new Date(`${range.endDate}T23:59:59Z`).getTime() / 1000);

    if (ctx.account.accountType === 'business') {
      const data = await this.apiGet<{ data?: Array<{ name?: string; values?: Array<{ end_time?: string; value?: unknown }> }> }>(
        `${GRAPH_URL}/${id}/insights?metric=reach,impressions,profile_views&period=day&since=${since}&until=${until}`,
        token
      );
      const perDay = new Map<string, InsightsData>();
      for (const metric of data.data ?? []) {
        for (const v of metric.values ?? []) {
          if (!v.end_time) continue;
          const day = v.end_time.slice(0, 10);
          const entry = perDay.get(day) ?? { date: day, raw: {} as Record<string, any> };
          const num = typeof v.value === 'number' ? v.value : Number(v.value ?? 0);
          if (metric.name === 'reach') entry.reach = (entry.reach ?? 0) + num;
          if (metric.name === 'impressions') entry.impressions = (entry.impressions ?? 0) + num;
          if (metric.name === 'profile_views') entry.engagement = (entry.engagement ?? 0) + num;
          (entry.raw as Record<string, any>)[metric.name!] = num;
          perDay.set(day, entry);
        }
      }
      return [...perDay.values()];
    }

    const data = await this.apiGet<{
      data?: Array<{ name?: string; values?: Array<{ end_time?: string; value?: unknown }> }>;
    }>(
      `${GRAPH_URL}/${id}/insights?metric=page_impressions,page_engaged_users&period=day&since=${since}&until=${until}`,
      token
    );
    const fan = await this.apiGet<{ fan_count?: number }>(`${GRAPH_URL}/${id}?fields=fan_count`, token);

    const perDay = new Map<string, InsightsData>();
    for (const metric of data.data ?? []) {
      for (const v of metric.values ?? []) {
        if (!v.end_time) continue;
        const day = v.end_time.slice(0, 10);
        const entry = perDay.get(day) ?? { date: day, followers: fan.fan_count, raw: {} as Record<string, any> };
        const num = typeof v.value === 'number' ? v.value : Number(v.value ?? 0);
        if (metric.name === 'page_impressions') entry.impressions = (entry.impressions ?? 0) + num;
        if (metric.name === 'page_engaged_users') entry.engagement = (entry.engagement ?? 0) + num;
        (entry.raw as Record<string, any>)[metric.name!] = num;
        perDay.set(day, entry);
      }
    }
    return [...perDay.values()];
  }

  async listComments(
    ctx: PublishContext,
    params: { externalPostId?: string; cursor?: string; limit?: number }
  ): Promise<Paginated<ProviderComment>> {
    const token = ctx.account.accountToken || ctx.tokens.accessToken;
    const parentId = params.externalPostId;
    const limit = params.limit ?? 25;
    const fields =
      ctx.account.accountType === 'business'
        ? 'id,from{id,username},message,created_time,parent_id'
        : 'id,from{id,name},message,created_time,parent_id';
    const cursor = params.cursor ? `&after=${encodeURIComponent(params.cursor)}` : '';
    const url = `${GRAPH_URL}/${parentId}/comments?fields=${fields}&limit=${limit}${cursor}`;

    const data = await this.apiGet<{
      data?: Array<{
        id?: string;
        message?: string;
        created_time?: string;
        parent_id?: { id?: string };
        from?: { username?: string; name?: string; id?: string };
      }>;
      paging?: { cursors?: { after?: string } };
    }>(url, token);

    const items: ProviderComment[] = (data.data ?? []).map((c) => ({
      externalCommentId: c.id!,
      author: {
        username: c.from?.username || c.from?.name || c.from?.id || 'unknown',
        displayName: c.from?.name,
      },
      message: c.message ?? '',
      createdAt: c.created_time ? new Date(c.created_time).toISOString() : undefined,
      parentExternalCommentId: (c.parent_id as any)?.id,
    }));

    return { items, nextCursor: data.paging?.cursors?.after, hasMore: Boolean(data.paging?.cursors?.after) };
  }

  async replyToComment(ctx: PublishContext, externalCommentId: string, message: string): Promise<{ externalReplyId: string }> {
    const token = ctx.account.accountToken || ctx.tokens.accessToken;
    const res = await this.apiPost<{ id?: string }>(`${GRAPH_URL}/${externalCommentId}/comments`, token, { message });
    if (!res.id) throw new ProviderError('Provider returned no reply id', this.platform, undefined, undefined, false);
    return { externalReplyId: res.id as string };
  }

  resolvePostUrl(externalPostId: string, account: ProviderAccount): string | undefined {
    if (account.accountType === 'business') return `https://www.instagram.com/p/${externalPostId}/`;
    const [pageId, postId] = String(externalPostId).split('_');
    return pageId && postId ? `https://www.facebook.com/${pageId}/posts/${postId}` : undefined;
  }
}
export default MetaProvider;

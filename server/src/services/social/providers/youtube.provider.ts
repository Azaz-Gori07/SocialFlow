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
  ProviderValidationResult,
} from '../interfaces/socialProvider.interface';
import { capabilities } from '../interfaces/providerCapabilities';
import { env } from '../../../shared/config/env.config';
import { ProviderError } from '../errors/providerError';

const YOUTUBE_SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];

export class YouTubeProvider extends OAuth2Strategy implements SocialProvider {
  readonly platform = 'youtube' as const;
  readonly provider = 'google' as const;

  constructor() {
    super({
      clientId: env.YOUTUBE_CLIENT_ID || env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.YOUTUBE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET || '',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientAuthMethod: 'client_secret_post',
      platform: 'youtube',
      extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    });
  }

  isConfigured(): boolean {
    return Boolean((env.YOUTUBE_CLIENT_ID || env.GOOGLE_CLIENT_ID) && (env.YOUTUBE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET));
  }

  getAuthorizationUrl(params: { state: string; redirectUri: string; scopes?: string[] }): string {
    return this.buildAuthorizationUrl(params.state, params.redirectUri, params.scopes ?? YOUTUBE_SCOPES);
  }

  async exchangeCode(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<AuthTokens> {
    return this.doCodeExchange({ code: params.code, redirectUri: params.redirectUri, codeVerifier: params.codeVerifier });
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    return this.doRefresh(refreshToken);
  }

  async getAuthenticatedIdentity(tokens: AuthTokens): Promise<AuthenticatedIdentity> {
    const data = await this.apiGet<{ sub?: string; name?: string; email?: string; picture?: string }>(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      tokens.accessToken
    );
    if (!data.sub) throw new ProviderError('Google returned no identity', 'youtube', undefined, undefined, false);
    return {
      externalAccountId: data.sub,
      displayName: data.name,
      email: data.email,
      avatarUrl: data.picture,
      scopes: YOUTUBE_SCOPES,
    };
  }

  async discoverAccounts(tokens: AuthTokens): Promise<ProviderAccount[]> {
    const identity = await this.getAuthenticatedIdentity(tokens);
    const account: ProviderAccount = {
      providerAccountId: identity.externalAccountId,
      accountType: 'profile',
      username: identity.email || identity.externalAccountId,
      displayName: identity.displayName || 'YouTube channel',
      avatarUrl: identity.avatarUrl,
      capabilities: this.getCapabilities({
        providerAccountId: identity.externalAccountId,
        accountType: 'profile',
        username: identity.email || '',
        displayName: identity.displayName || '',
      }),
    };
    return [account];
  }

  getCapabilities(_account: ProviderAccount): ProviderCapabilities {
    return capabilities({
      readProfile: true,
      readPosts: true,
      createPost: true,
      deletePost: true,
      uploadVideo: true,
      commentsRead: true,
      commentsWrite: true,
      webhooks: false,
    });
  }

  async validateConnection(tokens: AuthTokens, _account: ProviderAccount): Promise<ProviderValidationResult> {
    try {
      const data = await this.apiGet<{ sub?: string }>('https://www.googleapis.com/oauth2/v3/userinfo', tokens.accessToken);
      return { healthy: Boolean(data.sub) };
    } catch (err) {
      if (err instanceof ProviderError && (err.status === 401 || err.status === 403)) {
        return { healthy: false, errorCode: 'auth_expired', errorMessage: err.message };
      }
      throw err;
    }
  }

  async createPost(ctx: PublishContext, input: { content: string; media?: MediaItem[] }): Promise<PublishResult> {
    if (!input.media || input.media.length === 0) {
      throw new ProviderError('YouTube posts require a video media asset', 'youtube', undefined, undefined, false);
    }
    const media = input.media[0];
    if (media.kind !== 'video') {
      throw new ProviderError('YouTube posts require video media', 'youtube', undefined, undefined, false);
    }

    // 1. Start resumable session.
    const title = (input.content || 'SocialFlow post').slice(0, 100);
    const start = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.tokens.accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/*',
        },
        body: JSON.stringify({
          snippet: { title, description: input.content },
          status: { privacyStatus: 'public' },
        }),
      }
    );
    if (!start.ok) {
      const raw = await start.text();
      throw new ProviderError(`YouTube upload session failed: ${start.status} ${raw.slice(0, 300)}`, 'youtube', start.status);
    }
    const uploadUrl = start.headers.get('Location');
    if (!uploadUrl) throw new ProviderError('YouTube returned no upload URL', 'youtube', undefined, undefined, false);

    // 2. Stream the media file to the resumable URL.
    const file = await fetch(media.url);
    if (!file.ok) throw new ProviderError(`Failed to download media ${media.url}: ${file.status}`, 'youtube', file.status, undefined, false);
    const bytes = Buffer.from(await file.arrayBuffer());

    const upload = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/*' },
      body: bytes,
    });
    if (!upload.ok) {
      const raw = await upload.text();
      throw new ProviderError(`YouTube upload failed: ${upload.status} ${raw.slice(0, 300)}`, 'youtube', upload.status, undefined, upload.status >= 500);
    }
    const data = (await upload.json()) as { id?: string };
    if (!data.id) throw new ProviderError('YouTube returned no video id', 'youtube', undefined, undefined, false);

    return {
      externalPostId: data.id,
      externalPostUrl: `https://www.youtube.com/watch?v=${data.id}`,
    };
  }

  async deletePost(ctx: PublishContext, externalPostId: string): Promise<void> {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?id=${externalPostId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ctx.tokens.accessToken}` },
      }
    );
    if (!response.ok) {
      const raw = await response.text();
      throw new ProviderError(`YouTube delete failed: ${response.status} ${raw.slice(0, 200)}`, 'youtube', response.status);
    }
  }

  async listComments(
    ctx: PublishContext,
    params: { externalPostId?: string; cursor?: string; limit?: number }
  ): Promise<Paginated<ProviderComment>> {
    if (!params.externalPostId) return { items: [], hasMore: false };
    const limit = params.limit ?? 25;
    const pageToken = params.cursor ? `&pageToken=${encodeURIComponent(params.cursor)}` : '';
    const data = await this.apiGet<{
      items?: Array<{
        id?: string;
        snippet?: {
          topLevelComment?: {
            snippet?: { authorDisplayName?: string; authorProfileImageUrl?: string; textDisplay?: string; publishedAt?: string };
          };
        };
      }>;
      nextPageToken?: string;
    }>(
      `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${params.externalPostId}&maxResults=${limit}${pageToken}`,
      ctx.tokens.accessToken
    );

    const items: ProviderComment[] = (data.items ?? []).map((c) => ({
      externalCommentId: c.id ?? '',
      author: {
        username: c.snippet?.topLevelComment?.snippet?.authorDisplayName ?? 'unknown',
        displayName: c.snippet?.topLevelComment?.snippet?.authorDisplayName,
        avatarUrl: c.snippet?.topLevelComment?.snippet?.authorProfileImageUrl,
      },
      message: c.snippet?.topLevelComment?.snippet?.textDisplay ?? '',
      createdAt: c.snippet?.topLevelComment?.snippet?.publishedAt,
    }));

    return { items, nextCursor: data.nextPageToken, hasMore: Boolean(data.nextPageToken) };
  }

  async replyToComment(ctx: PublishContext, externalCommentId: string, message: string): Promise<{ externalReplyId: string }> {
    const data = await this.apiPost<{ id?: string }>(
      'https://www.googleapis.com/youtube/v3/comments?part=snippet',
      ctx.tokens.accessToken,
      {
        snippet: {
          parentId: externalCommentId,
          textOriginal: message,
        },
      }
    );
    if (!data.id) throw new ProviderError('YouTube returned no reply id', 'youtube', undefined, undefined, false);
    return { externalReplyId: data.id };
  }

  resolvePostUrl(externalPostId: string): string | undefined {
    return `https://www.youtube.com/watch?v=${externalPostId}`;
  }
}
export default YouTubeProvider;

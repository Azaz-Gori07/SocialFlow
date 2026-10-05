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
import { logger } from '../../../shared/utils/logger';

const LINKEDIN_SCOPES = ['openid', 'profile', 'email', 'w_member_social'];
// w_organization_social is deliberately NOT requested: it requires LinkedIn's
// "Community Management API" product approval, and an unapproved scope makes
// the authorize endpoint hard-fail with LinkedIn's generic "Bummer" error
// before the user even reaches consent. discoverAccounts() below already
// degrades to member-only when org permission is absent — re-add the scope
// (here and in the token exchange echo) once that product is approved.
const RESTLI = { 'X-Restli-Protocol-Version': '2.0.0' };

export class LinkedInProvider extends OAuth2Strategy implements SocialProvider {
  readonly platform = 'linkedin' as const;
  readonly provider = 'linkedin' as const;

  constructor() {
    super({
      clientId: env.LINKEDIN_CLIENT_ID || '',
      clientSecret: env.LINKEDIN_CLIENT_SECRET || '',
      authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      clientAuthMethod: 'client_secret_post',
      platform: 'linkedin',
    });
  }

  isConfigured(): boolean {
    return Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET);
  }

  getAuthorizationUrl(params: { state: string; redirectUri: string; scopes?: string[]; codeChallenge?: string }): string {
    // No PKCE on purpose: the proven-working integration for this exact app
    // (DevFlow, same client_id + secret) authorizes without code_challenge —
    // LinkedIn's token endpoint rejected our PKCE+secret exchange with
    // `invalid_client: Client authentication failed`. state still covers CSRF.
    return this.buildAuthorizationUrl(
      params.state,
      params.redirectUri,
      params.scopes ?? LINKEDIN_SCOPES
    );
  }

  async exchangeCode(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<AuthTokens> {
    // Mirror the working exchange body exactly: no code_verifier, no scope
    // echo — only grant_type, code, redirect_uri, client_id, client_secret.
    return this.doCodeExchange({
      code: params.code,
      redirectUri: params.redirectUri,
      // deliberately no codeVerifier / no scope extraParams — mirror DevFlow
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    return this.doRefresh(refreshToken);
  }

  async getAuthenticatedIdentity(tokens: AuthTokens): Promise<AuthenticatedIdentity> {
    const data = await this.apiGet<{ sub?: string; name?: string; email?: string; picture?: string }>(
      'https://api.linkedin.com/v2/userinfo',
      tokens.accessToken
    );
    if (!data.sub) throw new ProviderError('LinkedIn returned no identity', 'linkedin', undefined, undefined, false);
    return {
      externalAccountId: data.sub,
      displayName: data.name,
      email: data.email,
      avatarUrl: data.picture,
      scopes: LINKEDIN_SCOPES,
    };
  }

  async discoverAccounts(tokens: AuthTokens): Promise<ProviderAccount[]> {
    const identity = await this.getAuthenticatedIdentity(tokens);

    const member: ProviderAccount = {
      providerAccountId: identity.externalAccountId,
      accountType: 'profile',
      username: identity.email || identity.externalAccountId,
      displayName: identity.displayName || 'LinkedIn member',
      avatarUrl: identity.avatarUrl,
      capabilities: this.getCapabilities({
        providerAccountId: identity.externalAccountId,
        accountType: 'profile',
        username: identity.email || '',
        displayName: identity.displayName || '',
      }),
    };

    const accounts: ProviderAccount[] = [member];

    // Organization pages — only when the user's app approval/scope allows it.
    try {
      const acls = await this.apiGet<{
        elements?: Array<{ organization?: string; role?: string }>;
      }>('https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&count=100', tokens.accessToken, RESTLI);

      for (const el of acls.elements ?? []) {
        const urn = el.organization;
        if (!urn) continue;
        const orgId = urn.split(':').pop()!;
        let name = orgId;
        let logo: string | undefined;
        try {
          const org = await this.apiGet<{ localizedName?: string; logoV2?: { original?: { crop?: { square?: { crop_sources?: Array<{ url?: string }> } } } } }>(
            `https://api.linkedin.com/v2/organizations/${orgId}?projection=(localizedName,logoV2(original~))`,
            tokens.accessToken,
            RESTLI
          );
          name = org.localizedName || orgId;
          logo = org.logoV2?.original?.crop?.square?.crop_sources?.[0]?.url;
        } catch (err) {
          logger.warn(`[linkedin] org profile lookup failed for ${urn}`, { error: String(err) });
        }
        accounts.push({
          providerAccountId: orgId,
          accountType: 'organization',
          username: orgId,
          displayName: name,
          avatarUrl: logo,
          capabilities: this.getCapabilities({
            providerAccountId: orgId,
            accountType: 'organization',
            username: orgId,
            displayName: name,
          }),
        });
      }
    } catch (err) {
      // Permission not granted — member account only.
      logger.info('[linkedin] organization discovery skipped (scope/permission not granted)');
    }

    return accounts;
  }

  getCapabilities(account: ProviderAccount): ProviderCapabilities {
    if (account.accountType === 'organization') {
      return capabilities({
        readProfile: true,
        readPosts: true,
        createPost: true,
        deletePost: true,
        uploadImage: true,
        uploadVideo: true,
        commentsRead: true,
        commentsWrite: true,
        insights: false,
        webhooks: false,
      });
    }
    // Member / personal account: text posts only (media upload requires an organization owner).
    return capabilities({
      readProfile: true,
      readPosts: true,
      createPost: true,
      deletePost: true,
      commentsRead: true,
      commentsWrite: true,
    });
  }

  async validateConnection(tokens: AuthTokens, _account: ProviderAccount): Promise<ProviderValidationResult> {
    try {
      const data = await this.apiGet<{ sub?: string }>('https://api.linkedin.com/v2/userinfo', tokens.accessToken);
      return { healthy: Boolean(data.sub) };
    } catch (err) {
      if (err instanceof ProviderError && (err.status === 401 || err.status === 403)) {
        return { healthy: false, errorCode: 'auth_expired', errorMessage: err.message };
      }
      throw err;
    }
  }

  private authorUrn(account: ProviderAccount): string {
    return account.accountType === 'organization'
      ? `urn:li:organization:${account.providerAccountId}`
      : `urn:li:person:${account.providerAccountId}`;
  }

  async uploadMedia(ctx: PublishContext, media: MediaItem): Promise<{ externalMediaId?: string; metadata?: Record<string, any> }> {
    if (ctx.account.accountType !== 'organization') {
      throw new ProviderError('LinkedIn media upload is only supported for organization accounts', 'linkedin', undefined, undefined, false);
    }

    const init = await this.apiPost<{ value?: { uploadUrl?: string; asset?: string } }>(
      'https://api.linkedin.com/v2/assets?action=initializeUpload',
      ctx.tokens.accessToken,
      {
        initializeUploadRequest: {
          owner: this.authorUrn(ctx.account),
          service: 'com.linkedin.voyager.dms.upload.image',
        },
      },
      RESTLI
    );

    if (!init.value?.uploadUrl || !init.value.asset) {
      throw new ProviderError('LinkedIn returned no upload URL', 'linkedin', undefined, undefined, false);
    }

    // Media items are URLs; download and re-upload to LinkedIn.
    const file = await fetch(media.url);
    if (!file.ok) throw new ProviderError(`Failed to download media ${media.url}: ${file.status}`, 'linkedin', file.status, undefined, false);
    const bytes = Buffer.from(await file.arrayBuffer());

    const upload = await fetch(init.value.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.headers.get('content-type') || 'application/octet-stream' },
      body: bytes,
    });
    if (!upload.ok) {
      throw new ProviderError(`LinkedIn media upload failed: ${upload.status}`, 'linkedin', upload.status, undefined, isRetryable(upload.status));
    }

    return { externalMediaId: init.value.asset };
  }

  async createPost(ctx: PublishContext, input: { content: string; media?: MediaItem[] }): Promise<PublishResult> {
    let mediaId: string | undefined;
    if (input.media && input.media.length > 0) {
      const uploaded = await this.uploadMedia(ctx, input.media[0]);
      mediaId = uploaded.externalMediaId;
    }

    const body: Record<string, unknown> = {
      author: this.authorUrn(ctx.account),
      commentary: input.content,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
    };
    if (mediaId) {
      body.content = { media: { id: mediaId } };
    }

    const data = await this.apiPost<{ id?: string }>('https://api.linkedin.com/v2/posts', ctx.tokens.accessToken, body, RESTLI);
    if (!data.id) throw new ProviderError('LinkedIn returned no post id', 'linkedin', undefined, undefined, false);

    return {
      externalPostId: data.id,
      externalPostUrl: `https://www.linkedin.com/feed/update/${data.id}`,
    };
  }

  async getPost(ctx: PublishContext, externalPostId: string): Promise<{ externalPostId: string; message?: string; url?: string; raw?: Record<string, any> }> {
    const urn = externalPostId.startsWith('urn:') ? externalPostId : `urn:li:share:${externalPostId}`;
    const data = await this.apiGet<any>(`https://api.linkedin.com/v2/posts/${urn}?projection=(id,commentary,lifecycleState)`, ctx.tokens.accessToken, RESTLI);
    return {
      externalPostId: data.id || externalPostId,
      message: data.commentary?.text || data.commentary,
      url: `https://www.linkedin.com/feed/update/${data.id || urn}`,
      raw: data,
    };
  }

  async deletePost(ctx: PublishContext, externalPostId: string): Promise<void> {
    const urn = externalPostId.startsWith('urn:') ? externalPostId : `urn:li:share:${externalPostId}`;
    const response = await fetch(`https://api.linkedin.com/v2/posts/${urn}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ctx.tokens.accessToken}`, ...RESTLI },
    });
    if (!response.ok) {
      const raw = await response.text();
      throw new ProviderError(`LinkedIn delete failed: ${response.status} ${raw.slice(0, 200)}`, 'linkedin', response.status);
    }
  }

  async listComments(
    ctx: PublishContext,
    params: { externalPostId?: string; cursor?: string; limit?: number }
  ): Promise<Paginated<ProviderComment>> {
    if (!params.externalPostId) return { items: [], hasMore: false };
    const postUrn = params.externalPostId.startsWith('urn:') ? params.externalPostId : `urn:li:share:${params.externalPostId}`;
    const count = params.limit ?? 25;
    const start = params.cursor ? Number(params.cursor) : 0;

    const data = await this.apiGet<{
      elements?: Array<{
        id?: string;
        actor?: string;
        message?: { text?: string };
        created?: { time?: number };
        object?: string;
        parentComment?: string;
      }>;
      paging?: { start?: number; count?: number; total?: number };
    }>(
      `https://api.linkedin.com/v2/socialActions/${postUrn}/comments?count=${count}&start=${start}&projection=(elements(id,actor,message,created,object,parentComment),paging)`,
      ctx.tokens.accessToken,
      RESTLI
    );

    const items: ProviderComment[] = (data.elements ?? []).map((c) => {
      const actorId = (c.actor ?? '').split(':').pop() ?? 'unknown';
      return {
        externalCommentId: c.id ?? '',
        author: { username: actorId, displayName: actorId },
        message: c.message?.text ?? '',
        createdAt: c.created?.time ? new Date(c.created.time).toISOString() : undefined,
        parentExternalCommentId: c.parentComment,
      };
    });

    const total = data.paging?.total ?? 0;
    const nextStart = start + items.length;
    return {
      items,
      nextCursor: nextStart < total ? String(nextStart) : undefined,
      hasMore: nextStart < total,
    };
  }

  async replyToComment(ctx: PublishContext, externalCommentId: string, message: string): Promise<{ externalReplyId: string }> {
    const commentUrn = externalCommentId.startsWith('urn:') ? externalCommentId : `urn:li:comment:${externalCommentId}`;
    const data = await this.apiPost<{ id?: string }>(
      `https://api.linkedin.com/v2/socialActions/${commentUrn}/comments`,
      ctx.tokens.accessToken,
      {
        actor: this.authorUrn(ctx.account),
        message: { text: message },
        object: commentUrn,
      },
      RESTLI
    );
    if (!data.id) throw new ProviderError('LinkedIn returned no reply id', 'linkedin', undefined, undefined, false);
    return { externalReplyId: data.id };
  }

  resolvePostUrl(externalPostId: string): string | undefined {
    const urn = externalPostId.startsWith('urn:') ? externalPostId : `urn:li:share:${externalPostId}`;
    return `https://www.linkedin.com/feed/update/${urn}`;
  }
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}
export default LinkedInProvider;

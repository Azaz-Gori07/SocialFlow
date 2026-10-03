import { IPost, IDelivery } from '../../features/post/post.model';
import { SocialRepository } from '../../features/social/social.repository';
import { SocialService } from '../../features/social/social.service';
import { ComplianceService } from '../../features/compliance/compliance.service';
import { PostRepository } from '../../features/post/post.repository';
import { OAuthConnectionRepository } from '../../features/social/oauthConnection.repository';
import { OAuthTransactionRepository } from '../../features/social/oauthTransaction.repository';
import { ProviderFactory } from './providers/provider.factory';
import { ProviderError } from './errors/providerError';
import { ProviderCapabilities, MediaItem } from './interfaces/socialProvider.interface';
import { logger } from '../../shared/utils/logger';

export const RETRY_BASE_BACKOFF_MS = 60 * 1000;
export const RETRY_MAX_BACKOFF_MS = 15 * 60 * 1000;
export const DEFAULT_MAX_ATTEMPTS = 5;

export interface DeliveryOutcome {
  ok: boolean;
  delivery: IDelivery;
}

/**
 * Guideline §18/§19/§20 — per-account delivery with idempotency,
 * bounded exponential backoff and dead-lettering.
 *
 * - Never retries permanent failures (400/401/403 / permanent provider codes)
 * - Retries 429/5xx/timeouts/network errors with exponential backoff
 * - Idempotency key = postId + socialAccountId + scheduledAttempt
 * - Dead-letters (maxAttempts reached) and records the last error
 */
export class DeliveryEngine {
  private postRepository = new PostRepository();
  private socialService: SocialService;
  private complianceService = new ComplianceService();

  constructor(private socialRepository: SocialRepository) {
    this.socialService = new SocialService(
      this.socialRepository,
      new OAuthConnectionRepository(),
      new OAuthTransactionRepository()
    );
  }

  private toMediaItems(post: IPost): MediaItem[] {
    return (post.media || []).map(m => ({
      url: m.url,
      kind: m.kind === 'video' ? 'video' : 'image'
    }));
  }

  private backoffMs(attempts: number, retryAfterHintMs?: number): number {
    if (retryAfterHintMs) return Math.min(retryAfterHintMs, RETRY_MAX_BACKOFF_MS);
    return Math.min(RETRY_BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), RETRY_MAX_BACKOFF_MS);
  }

  /** True only for failures that a token refresh could plausibly fix. */
  private isAuthFailure(error: unknown): boolean {
    if (!(error instanceof ProviderError)) return false;
    if (error.status === 401) return true;
    // Provider-specific expired-token codes (Meta 190, X 89).
    return error.providerCode === '190' || error.providerCode === '89';
  }

  /**
   * Refreshes the account's provider token and returns the new access token.
   * Returns null when refresh is impossible or fails, so the caller can surface
   * the original auth error instead of retrying forever.
   */
  private async refreshAccountToken(delivery: IDelivery, post: IPost): Promise<string | null> {
    try {
      const refreshed = await this.socialService.refreshAccountTokenForDelivery(delivery.socialAccountId, post.userId);
      return refreshed || null;
    } catch (error) {
      logger.error('[delivery] token refresh failed', {
        socialAccountId: delivery.socialAccountId,
        platform: delivery.platform,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Publishes a single delivery. Safe to call concurrently from multiple
   * scheduler instances — only the atomic claim owner proceeds.
   */
  async publishDelivery(post: IPost, delivery: IDelivery): Promise<DeliveryOutcome> {
    // Idempotency: already published.
    if (delivery.status === 'published') {
      return { ok: true, delivery };
    }

    // Lost-response recovery: a previous run succeeded but we never recorded it.
    if (delivery.externalPostId) {
      const recovered = await this.markPublished(post._id.toString(), delivery.socialAccountId, delivery.externalPostId, delivery.externalPostUrl);
      return { ok: true, delivery: recovered };
    }

    let complianceRecordId: string | undefined;

    try {
      const bundle = await this.socialService.resolveAccountTokenBundle(delivery.socialAccountId);
      const account = bundle.account;
      if (account.userId !== post.userId) {
        throw new ProviderError(
          'Social account does not belong to the post owner',
          delivery.platform,
          undefined,
          'ACCOUNT_OWNERSHIP',
          false
        );
      }

      const provider = ProviderFactory.getConfiguredProvider(delivery.platform);
      const caps: ProviderCapabilities = provider.getCapabilities(account as any);

      if (!caps.createPost) {
        throw new ProviderError(
          `Publishing is not supported on ${delivery.platform} for this account type (${account.accountType})`,
          delivery.platform,
          undefined,
          'CAPABILITY_NOT_SUPPORTED',
          false
        );
      }

      const mediaItems = this.toMediaItems(post);
      if (mediaItems.length > 0 && !(caps.uploadImage || caps.uploadVideo)) {
        throw new ProviderError(
          `This post contains media, but ${delivery.platform} (${account.accountType}) does not support uploads through this app`,
          delivery.platform,
          undefined,
          'MEDIA_NOT_SUPPORTED',
          false
        );
      }

      const buildCtx = (accessToken: string) => ({
        tokens: { accessToken, refreshToken: bundle.refreshToken },
        account: {
          providerAccountId: account.providerAccountId,
          providerParentAccountId: account.providerParentAccountId,
          accountType: account.accountType,
          username: account.username,
          displayName: account.displayName,
          avatarUrl: account.avatarUrl,
          accountToken: account.encryptedAccessToken ? accessToken : undefined
        }
      });

      // ── Compliance gate (master plan §30/§33) ──────────────────────────────
      // Every publish path passes here. A blocked item never reaches the
      // provider; an uncertain one requires an explicit human approval rather
      // than being silently published or silently destroyed.
      const compliance = await this.complianceService.assertPublishable(
        post.userId,
        {
          content: post.content,
          platform: delivery.platform,
          media: mediaItems
        },
        { workspaceId: post.workspaceId, approved: (post as any).complianceApproved === true }
      );
      complianceRecordId = compliance.recordId;

      let result;
      try {
        result = await provider.createPost(buildCtx(bundle.accessToken), {
          content: post.content,
          media: mediaItems
        });
      } catch (firstError) {
        // Token lifecycle: an expired/revoked access token must not kill the
        // delivery. Refresh once and retry exactly once; a second failure is a
        // genuine auth problem and is reported (never looped).
        if (!this.isAuthFailure(firstError)) throw firstError;

        logger.info(`[delivery] ${delivery.platform} rejected the token, refreshing once before retry`);
        const refreshed = await this.refreshAccountToken(delivery, post);
        if (!refreshed) throw firstError;

        result = await provider.createPost(buildCtx(refreshed), {
          content: post.content,
          media: mediaItems
        });
      }

      const url =
        result.externalPostUrl ||
        (provider.resolvePostUrl
          ? provider.resolvePostUrl(result.externalPostId, {
              providerAccountId: account.providerAccountId,
              accountType: account.accountType,
              username: account.username,
              displayName: account.displayName
            })
          : undefined);

      const updated = await this.markPublished(post._id.toString(), delivery.socialAccountId, result.externalPostId, url);
      if (complianceRecordId) {
        await this.complianceService
          .markPublished(complianceRecordId, result.externalPostId)
          .catch((err) => logger.warn('[compliance] could not record publication', { error: String(err) }));
      }
      logger.info(`Published post ${post._id} -> ${delivery.platform} (${account.username})`);
      return { ok: true, delivery: updated };
    } catch (error: unknown) {
      return this.handleFailure(post, delivery, error);
    }
  }

  private async markPublished(
    postId: string,
    socialAccountId: string,
    externalPostId: string,
    externalPostUrl?: string
  ): Promise<IDelivery> {
    const updated = await this.postUpdated(postId, socialAccountId, {
      status: 'published',
      externalPostId,
      externalPostUrl,
      lastError: undefined,
      lastErrorCode: undefined,
      deadLettered: false,
      nextRetryAt: undefined,
      publishedAt: new Date().toISOString()
    });
    if (!updated) {
      throw new ProviderError('Delivery state update failed', socialAccountId, undefined, 'STATE_UPDATE_FAILED', false);
    }
    return updated;
  }

  private async postUpdated(
    postId: string,
    socialAccountId: string,
    patch: Partial<IDelivery>
  ): Promise<IDelivery | null> {
    const post = await this.postRepository.updateDeliveryResult(postId, socialAccountId, patch);
    if (!post) return null;
    return post.deliveries.find(d => d.socialAccountId === socialAccountId) || null;
  }

  private async handleFailure(post: IPost, delivery: IDelivery, error: unknown): Promise<DeliveryOutcome> {
    const attempts = delivery.attempts + 1;
    const message = error instanceof Error ? error.message : String(error);

    let classified: ProviderError;
    if (error instanceof ProviderError) {
      classified = error;
    } else {
      // Network / timeout / unknown: retryable with backoff.
      classified = new ProviderError(message, delivery.platform, 0, 'NETWORK', true);
    }

    const permanent = !classified.retryable;
    const deadLettered = permanent || attempts >= delivery.maxAttempts;

    const updated = await this.postUpdated(post._id.toString(), delivery.socialAccountId, {
      status: 'failed',
      attempts,
      lastError: message,
      lastErrorCode: classified.providerCode,
      deadLettered,
      nextRetryAt: deadLettered
        ? undefined
        : new Date(Date.now() + this.backoffMs(attempts)).toISOString()
    });

    if (deadLettered) {
      logger.warn(
        `Delivery ${delivery.platform}/${delivery.socialAccountId} failed permanently${permanent ? '' : ' (dead-lettered)'}: ${message}`
      );
    } else {
      const next = updated?.nextRetryAt;
      logger.warn(
        `Delivery ${delivery.platform}/${delivery.socialAccountId} retryable failure (attempt ${attempts}), next at ${next}: ${message}`
      );
    }

    return { ok: false, delivery: updated || delivery };
  }
}

export default DeliveryEngine;

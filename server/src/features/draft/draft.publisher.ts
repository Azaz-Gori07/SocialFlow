import { DraftRepository } from './draft.repository';
import { PublishHistoryRepository } from './publishHistory.repository';
import { IDraft, DraftPlatform } from './draft.model';
import { AppError } from '../../shared/errors/appError';
import { PostRepository } from '../post/post.repository';
import { SocialRepository } from '../social/social.repository';
import { IPost } from '../post/post.model';
import mongoose from 'mongoose';
import { runPostDeliveries } from '../../services/scheduler';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.types';
import { logger } from '../../shared/utils/logger';

/**
 * Publishing flow (guideline §18/§19/§20):
 *   Draft -> Post(+deliveries) -> DeliveryEngine -> Platform -> Draft terminal
 *
 * - Drafts are converted into Post records; every connected account of the
 *   draft's platform becomes one delivery with its own idempotency key
 * - A draft is only marked PUBLISHED after a successful platform response
 * - Retries re-run only the failed deliveries (bounded, with backoff)
 * - Preserves PublishHistory and never deletes the draft record
 */
export class DraftPublisher {
  private publishHistoryRepository: PublishHistoryRepository;
  private postRepository = new PostRepository();
  private socialRepository = new SocialRepository();
  private notificationService = new NotificationService();

  constructor(private draftRepository: DraftRepository) {
    this.publishHistoryRepository = new PublishHistoryRepository();
  }

  async queueForPublishing(draftId: string, userId: string, scheduledAt?: string): Promise<IDraft> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) {
      throw AppError.notFound('Draft not found');
    }
    if (draft.userId !== userId) {
      throw AppError.forbidden('Insufficient permissions to publish this draft');
    }

    if (draft.status !== 'draft' && draft.status !== 'failed') {
      throw AppError.badRequest(
        `Cannot queue draft with status "${draft.status}". Only "draft" or "failed" drafts can be queued for publishing.`
      );
    }

    const updateData: Record<string, unknown> = {
      status: 'ready',
      scheduledAt: scheduledAt || undefined
    };

    if (draft.status === 'failed') {
      updateData.failedReason = undefined;
      updateData.errorMessage = undefined;
    }

    const updated = await this.draftRepository.update(draftId, updateData as any);
    if (!updated) {
      throw AppError.internal('Failed to queue draft for publishing');
    }

    logger.info(`[DraftPublisher] Draft ${draftId} queued for ${draft.platform} publishing.`);
    return updated;
  }

  /**
   * Converts the draft into a Post with one delivery per connected account
   * and publishes through the delivery engine. Idempotent per draft: a
   * terminal Post short-circuits, a running Post is skipped.
   */
  async publishDraft(draft: IDraft): Promise<IDraft> {
    const { _id: draftId, userId, platform, caption, media } = draft;
    const draftIdStr = draftId.toString();

    if (draft.status === 'publishing') {
      logger.warn(`[DraftPublisher] Draft ${draftId} is already publishing. Skipping.`);
      return draft;
    }
    if (draft.status === 'archived' || draft.status === 'published') {
      return draft;
    }

    const existing = await this.postRepository.findByDraftId(draftIdStr);

    // Retry path: re-run the failed deliveries of the existing Post.
    if (existing) {
      const terminal = ['published', 'partial_failure', 'failed'].includes(existing.status);
      if (!terminal) {
        logger.warn(`[DraftPublisher] Draft ${draftId} has an in-flight Post. Skipping.`);
        return draft;
      }
      return this.retryExistingPost(draft, existing);
    }

    // Find all connected accounts for this platform (no accounts[0]).
    const accounts = (await this.socialRepository.findAccountsByUserId(userId)).filter(
      a => a.platform === platform
    );
    if (accounts.length === 0) {
      await this.failDraft(draft, 'No connected ' + platform + ' account found for user ' + userId, 'ACCOUNT_MISSING');
      const refetched = await this.draftRepository.findById(draftIdStr);
      return refetched || draft;
    }

    const postId = new mongoose.Types.ObjectId().toString();
    const scheduledAttempt = 1;
    const idempotencyKey = (accountId: string) => `post:${postId}:${accountId}:${scheduledAttempt}`;

    const postDoc: Partial<IPost> = {
      _id: new mongoose.Types.ObjectId(postId),
      userId,
      workspaceId: accounts[0].workspaceId || undefined,
      platforms: [platform],
      content: caption || '',
      media: (media || []).map(m => ({ url: m.url, kind: m.type as any, name: m.name })),
      platformContent: { [platform]: caption || '' },
      status: 'scheduled',
      scheduledAt: new Date().toISOString(),
      scheduledAttempt,
      draftId: draftIdStr,
      deliveries: accounts.map(acc => ({
        socialAccountId: acc._id.toString(),
        platform,
        status: 'pending',
        idempotencyKey: idempotencyKey(acc._id.toString()),
        attempts: 0,
        maxAttempts: 5,
        deadLettered: false
      } as any))
    };

    await this.postRepository.createPost(postDoc as any);

    const marked = await this.draftRepository.update(draftIdStr, { status: 'publishing' } as any);
    if (!marked) {
      throw AppError.internal('Failed to mark draft as publishing');
    }

    return this.runDraftPost(draft, postDoc as IPost);
  }

  /** Re-attempt failed deliveries of an existing Post for a retried draft. */
  private async retryExistingPost(draft: IDraft, post: IPost): Promise<IDraft> {
    const fresh = await this.postRepository.findPostById(post._id.toString());
    if (!fresh) return draft;

    const failed = fresh.deliveries.filter(d => d.status === 'failed' && !d.deadLettered);
    const pending = fresh.deliveries.filter(d => d.status === 'pending');

    if (failed.length === 0 && pending.length === 0) {
      await this.syncDraftFromPost(draft, fresh);
      const synced = await this.draftRepository.findById(draft._id.toString());
      return synced || draft;
    }

    await this.draftRepository.update(draft._id.toString(), { status: 'publishing' } as any);
    await runPostDeliveries(fresh, ['pending', 'failed']);
    const afterRun = await this.draftRepository.findById(draft._id.toString());
    return afterRun || draft;
  }

  /** Runs the engine for the draft's Post and syncs draft state. */
  private async runDraftPost(draft: IDraft, post: IPost): Promise<IDraft> {
    await runPostDeliveries(post, ['pending']);

    const fresh = await this.postRepository.findPostById(post._id.toString());
    if (!fresh) return draft;

    const synced = await this.syncDraftFromPost(draft, fresh);
    const refetched = await this.draftRepository.findById(draft._id.toString());
    return refetched || synced;
  }

  /** Reflects the Post outcome onto the draft + publish history + notification. */
  private async syncDraftFromPost(draft: IDraft, post: IPost): Promise<IDraft> {
    const draftId = draft._id.toString();
    const deliveries = post.deliveries;
    const anyPublished = deliveries.some(d => d.status === 'published');
    const allFailed = deliveries.length > 0 && deliveries.every(d => d.status === 'failed');
    const stillRunning = deliveries.some(d => d.status === 'pending' || d.status === 'publishing');

    if (stillRunning) return draft;

    const errors = deliveries
      .filter(d => d.status === 'failed')
      .map(d => d.lastError)
      .filter((e): e is string => Boolean(e));
    const first = deliveries.find(d => d.status === 'published');

    if (anyPublished) {
      await this.draftRepository.markPublished(draftId, {
        postId: first?.externalPostId || post._id.toString(),
        url: first?.externalPostUrl,
        platform: draft.platform,
        raw: { postId: post._id.toString() }
      });
      await this.draftRepository.archive(draftId);
      await this.recordHistory(draftId, draft.userId, draft.platform, 'success', errors, first?.externalPostId);
      await this.notify(draft.userId, NotificationType.DRAFT_PUBLISHED, `Published to ${draft.platform}`, `Your draft has been successfully published to ${draft.platform}.`);
      logger.info(`[DraftPublisher] Draft ${draftId} published to ${draft.platform}. Auto-archived.`);
    } else if (allFailed) {
      await this.failDraft(draft, errors.join('; ') || 'Unknown publishing error', 'PUBLISH_FAILED', true);
    } else {
      await this.failDraft(draft, 'No delivery reached the platform', 'NO_DELIVERY', false);
    }

    const refetched = await this.draftRepository.findById(draftId);
    return refetched || draft;
  }

  private async failDraft(
    draft: IDraft,
    message: string,
    code: string,
    recordHistory = true
  ): Promise<void> {
    const failed = await this.draftRepository.markFailed(draft._id.toString(), message);
    if (!failed) throw AppError.internal('Failed to mark draft as failed');
    if (recordHistory) {
      await this.recordHistory(draft._id.toString(), draft.userId, draft.platform, 'failed', [message]);
    }
    await this.notify(draft.userId, NotificationType.DRAFT_FAILED, `Publishing to ${draft.platform} Failed`, `Draft publishing failed: ${message}.`);
  }

  private async recordHistory(
    draftId: string,
    userId: string,
    platform: DraftPlatform,
    outcome: 'success' | 'failed',
    errors: string[],
    publishedPostId?: string
  ): Promise<void> {
    const attemptNumber = await this.publishHistoryRepository.getNextAttemptNumber(draftId);
    await this.publishHistoryRepository.recordAttempt({
      draftId,
      userId,
      platform,
      attemptNumber,
      outcome,
      statusBefore: 'publishing',
      statusAfter: outcome === 'success' ? 'published' : 'failed',
      publishedAt: outcome === 'success' ? new Date().toISOString() : undefined,
      errorMessage: outcome === 'failed' ? errors.join('; ') || undefined : undefined,
      platformResponse: outcome === 'success'
        ? { postId: publishedPostId, platform: platform as any, raw: { deliveredAt: new Date().toISOString() } }
        : undefined
    });
  }

  private async notify(userId: string, type: NotificationType, title: string, message: string): Promise<void> {
    try {
      await this.notificationService.create({ userId, type, title, message });
    } catch (err: any) {
      logger.warn(`[DraftPublisher] Failed to send notification: ${err.message}`);
    }
  }

  async retryDraft(draftId: string, userId: string): Promise<IDraft> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) {
      throw AppError.notFound('Draft not found');
    }
    if (draft.userId !== userId) {
      throw AppError.forbidden('Insufficient permissions to retry this draft');
    }
    if (draft.status !== 'failed') {
      throw AppError.badRequest(`Cannot retry draft with status "${draft.status}". Only "failed" drafts can be retried.`);
    }

    const queued = await this.queueForPublishing(draftId, userId);
    return this.publishDraft(queued);
  }

  /** Get full publish history for a draft. */
  async getPublishHistory(draftId: string, userId: string) {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) {
      throw AppError.notFound('Draft not found');
    }
    if (draft.userId !== userId) {
      throw AppError.forbidden('Insufficient permissions');
    }

    return this.publishHistoryRepository.findByDraftId(draftId);
  }
}

export default DraftPublisher;

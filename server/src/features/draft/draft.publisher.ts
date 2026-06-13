import { DraftRepository } from './draft.repository';
import { PublishHistoryRepository } from './publishHistory.repository';
import { IDraft, DraftPlatform } from './draft.model';
import { AppError } from '../../shared/errors/appError';
import { ProviderFactory } from '../../services/social/providers/provider.factory';
import { EncryptionAdapter } from '../../services/social/adapters/encryption.adapter';
import mongoose from 'mongoose';

/**
 * Phase 3 — Real Publishing Integration
 *
 * Publishing flow:
 *   Draft -> Scheduler -> Provider -> Platform -> Success -> Archive
 *   Draft -> Scheduler -> Provider -> Failed -> Retry Queue
 *
 * Rules:
 * - Draft must only be marked PUBLISHED after successful platform response
 * - Failed posts must remain available for retry
 * - Preserve full publish history (PublishHistory collection)
 * - Preserve draft history (draft record never deleted)
 * - Preserve platform response data
 * - Auto-archive drafts on successful publish
 * - Send notifications and activity logs on success/failure
 */
export class DraftPublisher {
  private publishHistoryRepository: PublishHistoryRepository;

  constructor(
    private draftRepository: DraftRepository
  ) {
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

    console.log(`[DraftPublisher] Draft ${draftId} queued for ${draft.platform} publishing.`);
    return updated;
  }

  /**
   * Phase 3: Enhanced publish with full reliability:
   * 1. Record publish history BEFORE provider call
   * 2. Call provider
   * 3. Only mark PUBLISHED after successful platform response
   * 4. Auto-archive on success
   * 5. Send notification + activity log
   * 6. On failure: record history + store error details
   */
  async publishDraft(draft: IDraft): Promise<IDraft> {
    const { _id: draftId, userId, platform, caption, media } = draft;

    if (draft.status !== 'ready') {
      console.warn(`[DraftPublisher] Draft ${draftId} status is "${draft.status}", not "ready". Skipping.`);
      return draft;
    }

    // Get next attempt number BEFORE any state changes
    const attemptNumber = await this.publishHistoryRepository.getNextAttemptNumber(draftId.toString());

    // Mark as publishing
    const publishing = await this.draftRepository.markPublishing(draftId.toString());
    if (!publishing) {
      throw AppError.internal('Failed to mark draft as publishing');
    }

    const SocialAccountModel = mongoose.models.SocialAccount || mongoose.model('SocialAccount');
    const ActivityLogModel = mongoose.models.ActivityLog || mongoose.model('ActivityLog');
    const NotificationModel = mongoose.models.Notification || mongoose.model('Notification');
    const content = caption || '';

    try {
      // Find connected social account
      const accounts = await SocialAccountModel.find({ userId, platform }).exec();
      if (!accounts || accounts.length === 0) {
        throw new Error(`No connected ${platform} account found for user ${userId}`);
      }

      const account = accounts[0];
      const rawAccessToken = EncryptionAdapter.decrypt(account.accessToken);
      const provider = ProviderFactory.getProvider(platform);

      const mediaUrls = media?.map(m => m.url) || [];

      // Phase 3: Call existing provider infrastructure
      const publishedPostId = await provider.publishPost(
        rawAccessToken,
        content,
        mediaUrls,
        account.accountId
      );

      // Phase 3: Only mark PUBLISHED after successful platform response
      const platformResponse = {
        postId: publishedPostId,
        platform: platform as DraftPlatform,
        raw: { postedAt: new Date().toISOString() }
      };

      const published = await this.draftRepository.markPublished(draftId.toString(), platformResponse);
      if (!published) {
        throw AppError.internal('Failed to mark draft as published');
      }

      // Record publish history (success)
      await this.publishHistoryRepository.recordAttempt({
        draftId: draftId.toString(),
        userId,
        platform,
        attemptNumber,
        outcome: 'success',
        statusBefore: 'ready',
        statusAfter: 'published',
        publishedAt: new Date().toISOString(),
        platformResponse
      });

      // Phase 3: Auto-archive on success
      await this.draftRepository.archive(draftId.toString());

      // Activity log
      try {
        const log = new ActivityLogModel({
          userId,
          action: 'DRAFT_PUBLISHED',
          details: `Draft ${draftId} published successfully to ${platform}. Post ID: ${publishedPostId}`
        });
        await log.save();
      } catch (logErr: any) {
        console.warn(`[DraftPublisher] Failed to log activity: ${logErr.message}`);
      }

      // Success notification
      try {
        const notification = new NotificationModel({
          userId,
          title: `Published to ${platform}`,
          message: `Your draft has been successfully published to ${platform}.`,
          read: false,
          type: 'draft_published'
        });
        await notification.save();
      } catch (notifErr: any) {
        console.warn(`[DraftPublisher] Failed to send notification: ${notifErr.message}`);
      }

      console.log(`[DraftPublisher] Draft ${draftId} successfully published to ${platform}. Post ID: ${publishedPostId}. Auto-archived.`);
      return published;
    } catch (error: any) {
      const errorMsg = error.message || 'Unknown publishing error';
      const errorStack = error.stack?.substring(0, 500) || undefined;

      console.error(`[DraftPublisher] Failed to publish draft ${draftId} to ${platform}: ${errorMsg}`);

      // Mark as failed
      const failed = await this.draftRepository.markFailed(draftId.toString(), errorMsg);
      if (!failed) {
        throw AppError.internal('Failed to mark draft as failed');
      }

      // Record publish history (failure)
      await this.publishHistoryRepository.recordAttempt({
        draftId: draftId.toString(),
        userId,
        platform,
        attemptNumber,
        outcome: 'failed',
        statusBefore: 'publishing',
        statusAfter: 'failed',
        errorMessage: errorMsg,
        errorStack
      });

      // Failure notification
      try {
        const notification = new NotificationModel({
          userId,
          title: `Publishing to ${platform} Failed`,
          message: `Draft publishing failed: ${errorMsg}. Retry #${attemptNumber} available.`,
          read: false,
          type: 'draft_failed'
        });
        await notification.save();
      } catch (notifErr: any) {
        console.warn(`[DraftPublisher] Failed to send failure notification: ${notifErr.message}`);
      }

      return failed;
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

  /**
   * Phase 3: Get full publish history for a draft
   */
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
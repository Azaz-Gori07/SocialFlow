import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../../shared/config/env.config';
import { db } from '../../database/db';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.types';
import { CommentRepository } from '../comment/comment.repository';

const notificationService = new NotificationService();
const commentRepository = new CommentRepository();

/**
 * Meta (Facebook/Instagram) webhook processing.
 * Pipeline per guideline: receive -> verify signature -> parse -> deduplicate
 * -> persist -> update internal state -> notify.
 *
 * Handlers are idempotent: every event is keyed by a unique eventId and
 * stored once (unique index); duplicates are ignored.
 */
export class MetaWebhookService {
  /** Hub challenge verification for subscription setup. */
  static verifyChallenge(query: Record<string, any>): string | null {
    if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === env.meta.webhookVerifyToken) {
      return query['hub.challenge'] || null;
    }
    return null;
  }

  /** HMAC-SHA256 signature check over the raw request body. */
  static verifySignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!env.meta.webhookSecret) return false;
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

    const expected = createHmac('sha256', env.meta.webhookSecret).update(rawBody).digest('hex');
    const provided = signatureHeader.slice('sha256='.length);

    if (expected.length !== provided.length) return false;
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    return timingSafeEqual(a, b);
  }

  /**
   * Process a full webhook payload. Every event is deduplicated by
   * (provider, eventId) before any state is changed.
   */
  static async processPayload(payload: any): Promise<{ received: number; processed: number }> {
    if (!payload?.object || !Array.isArray(payload.entry)) {
      return { received: 0, processed: 0 };
    }

    let processed = 0;
    for (const entry of payload.entry) {
      if (!entry?.changes) continue;

      for (const change of entry.changes) {
        const value = change?.value ?? {};
        const eventId = this.buildEventId(entry, change);
        if (!eventId) continue;

        const isDuplicate = await this.claimEvent(eventId, change, value, entry);
        if (isDuplicate) continue;

        try {
          await this.handleChange(entry, change);
          await db.webhookEvents.updateOne({ eventId }, { $set: { processed: true, processedAt: new Date() } });
          processed++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await db.webhookEvents.updateOne({ eventId }, { $set: { error: message } });
          console.error('Meta webhook change processing error:', error);
        }
      }
    }

    return { received: payload.entry.length, processed };
  }

  /** Creates the dedupe record; returns true when the event was already seen. */
  private static async claimEvent(entry: any, change: any, value: any, sourceEntry: any): Promise<boolean> {
    const now = new Date();
    try {
      await db.webhookEvents.create({
        provider: 'meta',
        eventId: this.buildEventId(entry, change),
        eventType: `${change.item ?? 'unknown'}:${change.field ?? 'unknown'}`,
        payload: value,
        processed: false,
        userId: undefined,
        createdAt: now,
        updatedAt: now,
      });
      return false;
    } catch (error: any) {
      // E11000 duplicate key -> already processed
      if (error?.code === 11000) return true;
      throw error;
    }
  }

  private static buildEventId(entry: any, change: any): string {
    const value = change?.value ?? {};
    const changeKey = value?.id ?? value?.post_id ?? `${change?.field ?? 'unknown'}-${Date.now()}`;
    return `entry:${entry.id}:${change?.item ?? 'unknown'}:${change?.field ?? 'unknown'}:${changeKey}`;
  }

  private static async handleChange(entry: any, change: any): Promise<void> {
    const value = change?.value ?? {};
    const account = await db.socialAccounts.findOne({
      providerAccountId: entry.id,
      status: 'active',
    });

    if (!account) {
      // Not our account (e.g. page not connected in this app) - nothing to update.
      return;
    }

    const platform = account.platform;

    if (change.item === 'comment' || change.item === 'post') {
      await this.handleCommentEvent(account, value, platform);
      return;
    }

    // Unknown event type: persist only, no state change.
  }

  private static async handleCommentEvent(account: any, value: any, platform: string): Promise<void> {
    const externalCommentId = value?.id;
    if (!externalCommentId) return;

    // Comment deleted -> remove from our store.
    if (value?.deleted === true || value?.verb === 'remove') {
      await db.comments.deleteMany({ externalCommentId } as any);
      return;
    }

    const from = value?.from ?? {};
    const comment = await commentRepository.upsertComment({
      workspaceId: account.workspaceId,
      platform,
      accountId: account._id,
      externalAccountId: account.providerAccountId,
      externalPostId: value?.post_id ?? value?.media_id ?? '',
      externalCommentId,
      author: {
        username: from?.id ?? 'unknown',
        displayName: from?.name ?? 'Unknown user',
      },
      message: value?.message ?? '',
      status: 'unresolved',
    });

    if (comment && !value?.deleted) {
      try {
        await notificationService.create({
          userId: account.userId,
          type: NotificationType.NEW_COMMENT,
          title: `New ${platform} comment`,
          message: `${from?.name ?? 'Someone'}: ${(value?.message ?? '').slice(0, 160)}`,
          metadata: { commentId: String(comment._id), platform, externalCommentId },
        });
      } catch (error) {
        console.warn('Webhook notification failed:', error);
      }
    }
  }
}

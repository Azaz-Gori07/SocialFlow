import { db } from '../../database/db';
import { logger } from './logger';

export type ActivityAction = 'TARGET_ASSIGNED' | 'CONTENT_SCHEDULED';

export interface ActivityEvent {
  userId: string;
  workspaceId?: string;
  action: ActivityAction;
  /** Human-readable one-liner. */
  details: string;
  /** Structured payload: postId/draftId, platform(s), targetAccountIds, source, actor, workspaceId. */
  meta?: Record<string, any>;
}

/**
 * Records an audit event. Failures are swallowed: auditing must never break
 * content creation or publishing.
 */
export async function logActivity(event: ActivityEvent): Promise<void> {
  try {
    await db.activityLogs.create({
      userId: event.userId,
      workspaceId: event.workspaceId,
      action: event.action,
      details: event.details,
      meta: event.meta
    } as any);
  } catch (err: any) {
    logger.warn(`[activity] failed to record ${event.action}: ${err.message}`);
  }
}

import crypto from 'crypto';
import { env } from '../../../shared/config/env.config';
import { logger } from '../../../shared/utils/logger';
import { AppError } from '../../../shared/errors/appError';
import DeveloperRepositoryModel from '../repositories/repository.model';
import { syncAndProcess } from '../jobs/syncOrchestrator';

/**
 * Webhook verification and dispatch. The HTTP route itself is mounted in a
 * later phase with a raw-body parser; everything here is transport-agnostic so
 * that route stays a three-line adapter.
 */

/** Only these deliveries trigger a sync; everything else is acknowledged and dropped. */
export const VALID_EVENTS = ['push', 'pull_request', 'issues', 'release'] as const;

export interface GitHubWebhookContext {
  event: string;
  deliveryId?: string;
  action?: string;
  repositoryFullName?: string;
}

/**
 * Constant-time HMAC-SHA256 check. Length is compared first because
 * `timingSafeEqual` throws on a length mismatch, which would turn a malformed
 * header into a 500 instead of a clean "invalid signature".
 */
export function verifyGitHubSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string | undefined
): boolean {
  if (!signature || !secret) return false;
  const expected = signature.replace('sha256=', '');
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (expected.length !== computed.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(computed, 'hex'));
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Extract just what dispatch needs from the delivery, never the whole payload. */
export function parseGitHubEvent(
  headers: Record<string, string | string[] | undefined>,
  rawBody: Buffer
): GitHubWebhookContext {
  let payload: Record<string, any> = {};
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    // A body that is not JSON yields no repository — the caller answers 202.
  }
  const repository = payload?.repository;
  return {
    event: headerValue(headers['x-github-event']) ?? '',
    deliveryId: headerValue(headers['x-github-delivery']),
    action: typeof payload?.action === 'string' ? payload.action : undefined,
    repositoryFullName: typeof repository?.full_name === 'string' ? repository.full_name : undefined
  };
}

export interface GitHubWebhookResult {
  accepted: true;
  message?: string;
  deliveryId?: string;
  /** Number of repositories whose sync was dispatched. */
  dispatched: number;
}

/**
 * Verify + dispatch. Never rejects on sync failure: the delivery is
 * acknowledged and per-repository chains are fire-and-forget, because GitHub
 * disables the webhook if we fail to answer 2xx.
 *
 * Each dispatch runs the full chain (sync → intelligence → memory →
 * opportunities → auto-drafts), not just the sync, so a push produces content
 * exactly as it would in DevFlow's worker.
 */
export async function handleGitHubWebhook(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>
): Promise<GitHubWebhookResult> {
  if (!env.GITHUB_WEBHOOK_SECRET) {
    throw AppError.providerNotConfigured('GitHub webhooks');
  }
  const signature = headerValue(headers['x-hub-signature-256']);
  if (!signature) throw AppError.unauthorized('Missing webhook signature');
  if (!verifyGitHubSignature(rawBody, signature, env.GITHUB_WEBHOOK_SECRET)) {
    throw AppError.unauthorized('Invalid webhook signature');
  }

  const { event, deliveryId, repositoryFullName } = parseGitHubEvent(headers, rawBody);
  if (!event) throw AppError.badRequest('Missing event type');
  if (!repositoryFullName) {
    return { accepted: true, message: 'No repository in payload', dispatched: 0 };
  }
  if (!(VALID_EVENTS as readonly string[]).includes(event)) {
    return { accepted: true, message: `Ignored event: ${event}`, deliveryId, dispatched: 0 };
  }

  // A repository can be monitored by several accounts; each is synced for its
  // own owner rather than only the first match.
  const repos = await DeveloperRepositoryModel.find({ fullName: repositoryFullName }).exec();
  if (repos.length === 0) {
    return { accepted: true, message: 'Repository not connected', deliveryId, dispatched: 0 };
  }

  for (const repo of repos) {
    syncAndProcess(repo.userId, repo._id.toString(), event, 'webhook').catch((error: unknown) => {
      // The sync service already recorded the failure in the sync log; log the
      // dispatch error and let the delivery succeed.
      logger.error('[developer] webhook sync failed', {
        repositoryId: repo._id.toString(),
        event,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }

  return { accepted: true, deliveryId, dispatched: repos.length };
}

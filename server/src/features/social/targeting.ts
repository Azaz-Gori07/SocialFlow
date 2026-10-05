import mongoose from 'mongoose';
import { AppError } from '../../shared/errors/appError';
import { ISocialAccount } from './social.model';
import { SocialRepository } from './social.repository';
import { WorkspaceRepository } from '../workspace/workspace.repository';

/**
 * Account-level publishing targeting.
 *
 * Contract:
 * - `targetAccountIds === undefined` → legacy fan-out: every connected account
 *   of the requested platforms. Legacy records keep this historical behavior.
 * - `targetAccountIds: string[]` → strict: only these accounts, each re-validated
 *   server-side (ownership, active workspace, platform match, connected/usable).
 *   Client-supplied ids are never trusted.
 * - Empty arrays are rejected at scheduling/publish points — they never mean
 *   "publish everywhere".
 */

/** Selections at or above this size require explicit fan-out confirmation. */
export const FANOUT_CONFIRM_THRESHOLD = 20;

export interface TargetingDeps {
  socialRepository: Pick<SocialRepository, 'findAccountsByUserId' | 'findAccountsByIds'>;
  workspaceRepository: Pick<WorkspaceRepository, 'findMember'>;
}

export interface ResolveTargetsInput {
  userId: string;
  /** Platforms the content is destined for; every explicit target must match. */
  platforms: string[];
  /** Explicit target account ids. undefined → legacy fan-out. */
  targetAccountIds?: string[];
  /** Active workspace. Required for explicit targeting unless requireWorkspace=false. */
  workspaceId?: string;
  /** Write points require the active workspace; queue/publish re-validation passes false. */
  requireWorkspace?: boolean;
  /** true once the user confirmed a >= FANOUT_CONFIRM_THRESHOLD selection. */
  fanoutConfirmed?: boolean;
}

export interface ResolvedTargets {
  accounts: ISocialAccount[];
  /** true when the caller supplied an explicit target list. */
  explicit: boolean;
}

function withDefaults(override?: Partial<TargetingDeps>): TargetingDeps {
  return {
    socialRepository: override?.socialRepository ?? new SocialRepository(),
    workspaceRepository: override?.workspaceRepository ?? new WorkspaceRepository()
  };
}

/**
 * Resolves the delivery targets for one piece of content.
 * Throws AppError.badRequest/forbidden on any invalid, foreign,
 * cross-workspace, cross-platform, or unusable target.
 */
export async function resolveTargetAccounts(
  input: ResolveTargetsInput,
  override?: Partial<TargetingDeps>
): Promise<ResolvedTargets> {
  const d = withDefaults(override);
  const { userId, platforms, targetAccountIds } = input;

  // Legacy path — historical fan-out behavior for records without targeting.
  if (targetAccountIds === undefined) {
    const all = (await d.socialRepository.findAccountsByUserId(userId)) ?? [];
    const wanted = new Set(platforms);
    const accounts = all.filter((a) => a.platform && wanted.has(a.platform));
    return { accounts, explicit: false };
  }

  if (targetAccountIds.length === 0) {
    throw AppError.badRequest('Select at least one target account.');
  }

  if (input.requireWorkspace !== false) {
    if (!input.workspaceId) {
      throw AppError.badRequest('workspaceId is required when targetAccountIds are provided.');
    }
    const member = await d.workspaceRepository.findMember(input.workspaceId, userId);
    if (!member) {
      throw AppError.forbidden('You do not have access to this workspace.');
    }
  }

  const unique = [...new Set(targetAccountIds)];
  if (unique.some((id) => !mongoose.isValidObjectId(id))) {
    throw AppError.badRequest('One or more target account ids are invalid.');
  }

  // Ownership is part of the query itself: ids owned by another user simply
  // do not come back, so foreign ids are indistinguishable from unknown ids.
  const found = (await d.socialRepository.findAccountsByIds(userId, unique)) ?? [];
  if (found.length !== unique.length) {
    throw AppError.badRequest('One or more target accounts are invalid or unavailable.');
  }

  const wanted = new Set(platforms);
  for (const acc of found) {
    if (acc.workspaceId && input.workspaceId && acc.workspaceId !== input.workspaceId) {
      throw AppError.badRequest(`Account @${acc.username} does not belong to this workspace.`);
    }
    if (!wanted.has(acc.platform)) {
      throw AppError.badRequest(
        `Account @${acc.username} is a ${acc.platform} account and cannot publish to ${[...wanted].join(', ')}.`
      );
    }
    if (acc.status !== 'active' || acc.connectionStatus !== 'connected') {
      throw AppError.badRequest(
        `Account @${acc.username} is not usable for publishing (status: ${acc.status}, connection: ${acc.connectionStatus}).`
      );
    }
  }

  if (found.length >= FANOUT_CONFIRM_THRESHOLD && input.fanoutConfirmed !== true) {
    throw AppError.badRequest(
      `You're about to publish this post to ${found.length} accounts. Confirm the fan-out to continue.`
    );
  }

  return { accounts: found, explicit: true };
}

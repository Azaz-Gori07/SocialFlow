import { DraftRepository, PaginatedDraftsResult } from './draft.repository';
import { DraftPublisher } from './draft.publisher';
import { SocialRepository } from '../social/social.repository';
import { OAuthConnectionRepository } from '../social/oauthConnection.repository';
import { OAuthTransactionRepository } from '../social/oauthTransaction.repository';
import { SocialService } from '../social/social.service';
import { ProviderFactory } from '../../services/social/providers/provider.factory';
import { ProjectPostHistoryModel } from '../developer/history/projectHistory.model';
import { ComplianceService } from '../compliance/compliance.service';
import { AppError } from '../../shared/errors/appError';
import DraftModel, { IDraft } from './draft.model';
import { CreateDraftInput, UpdateDraftInput, PublishDraftInput } from './draft.validation';
import { resolveTargetAccounts } from '../social/targeting';
import { logActivity } from '../../shared/utils/activityLog';
import { db } from '../../database/db';
import mongoose from 'mongoose';

export interface PaginatedDrafts {
  items: IDraft[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export class DraftService {
  private draftPublisher: DraftPublisher;
  private socialService: SocialService;

  constructor(private draftRepository: DraftRepository) {
    this.draftPublisher = new DraftPublisher(draftRepository);
    // Provider-side post deletion needs decrypted tokens; SocialService owns
    // the account->connection token fallback chain.
    this.socialService = new SocialService(
      new SocialRepository(),
      new OAuthConnectionRepository(),
      new OAuthTransactionRepository()
    );
  }

  async createDraft(input: CreateDraftInput, userId: string): Promise<IDraft> {
    // A draft's workspace scopes webhooks, exports and the audit feed. The id
    // arrives in the body, so verify membership instead of trusting it.
    await this.assertWorkspaceAccess(userId, input.workspaceId);
    // Validate explicit targets at write time (ownership, workspace, platform,
    // connection). `[]` is allowed here as "not yet targeted" — it is rejected
    // at queue/publish time and never means "publish everywhere". Absent
    // targets keep the legacy fan-out for old clients.
    if (input.targetAccountIds !== undefined && input.targetAccountIds.length > 0) {
      await this.validateTargets(userId, input.workspaceId, [input.platform], input.targetAccountIds);
    }

    const draft = await this.draftRepository.create({
      userId,
      workspaceId: input.workspaceId,
      platform: input.platform,
      contentType: input.contentType,
      caption: input.caption,
      media: input.media,
      status: 'draft',
      // Developer Intelligence provenance — written only when supplied, so a
      // plain create persists exactly the fields it always did.
      ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
      ...(input.developerActivityId !== undefined ? { developerActivityId: input.developerActivityId } : {}),
      ...(input.developerRepositoryId !== undefined ? { developerRepositoryId: input.developerRepositoryId } : {}),
      ...(input.developerOpportunityId !== undefined ? { developerOpportunityId: input.developerOpportunityId } : {}),
      ...(input.evidence !== undefined ? { evidence: input.evidence } : {}),
      ...(input.aiMetadata !== undefined ? { aiMetadata: input.aiMetadata } : {}),
      ...(input.targetAccountIds !== undefined ? { targetAccountIds: input.targetAccountIds } : {})
    });

    if (Array.isArray(input.targetAccountIds) && input.targetAccountIds.length > 0) {
      await logActivity({
        userId,
        workspaceId: input.workspaceId,
        action: 'TARGET_ASSIGNED',
        details: `Assigned ${input.targetAccountIds.length} account(s) for ${input.platform}`,
        meta: {
          draftId: draft._id.toString(),
          platforms: [input.platform],
          targetAccountIds: input.targetAccountIds,
          // Draft creation has no AI provenance — never label it 'ai'.
          source: 'manual',
          actor: userId,
          workspaceId: input.workspaceId
        }
      });
    }
    return draft;
  }

  /** Membership check for a client-supplied workspace id. */
  private async assertWorkspaceAccess(userId: string, workspaceId?: string): Promise<void> {
    if (!workspaceId) return;
    if (!mongoose.isValidObjectId(workspaceId)) {
      throw AppError.badRequest('Invalid workspace id');
    }
    const workspace = await db.workspaces.findById(workspaceId).select('ownerId').lean();
    if (!workspace) throw AppError.notFound('Workspace not found');
    if (String(workspace.ownerId) === userId) return;
    const membership = await db.workspaceMembers.findOne({ workspaceId, userId }).lean();
    if (!membership) throw AppError.forbidden('You do not have access to this workspace');
  }

  /** Server-side target validation at write time. Never trusts client ids. */
  private validateTargets(
    userId: string,
    workspaceId: string | undefined,
    platforms: string[],
    targetAccountIds: string[]
  ): Promise<void> {
    return resolveTargetAccounts({
      userId,
      platforms,
      targetAccountIds,
      workspaceId,
      requireWorkspace: true,
      // The fan-out gate fires at queue/publish time (user-action points).
      fanoutConfirmed: true
    }).then(() => undefined);
  }

  async uploadMedia(
    draftId: string,
    input: { fileName: string; fileType: 'image' | 'video' | 'document'; fileSize?: number },
    userId: string
  ): Promise<IDraft> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw AppError.notFound('Draft not found');
    if (draft.userId !== userId) throw AppError.forbidden('Insufficient permissions');
    const mediaUrl = `/media/${userId}/${draft._id}/${Date.now()}_${input.fileName}`;
    const updatedDraft = await this.draftRepository.update(draftId, {
      media: [...draft.media, { url: mediaUrl, type: input.fileType, name: input.fileName, size: input.fileSize }]
    } as any);
    if (!updatedDraft) throw AppError.internal('Failed to attach media');
    return updatedDraft;
  }

  async listDrafts(userId: string, options: { limit: number; offset: number; platform?: string; status?: string }): Promise<PaginatedDrafts> {
    const result = await this.draftRepository.findPaginated(userId, options);
    return { ...result, hasMore: options.offset + result.items.length < result.total };
  }

  async getDraft(id: string, userId: string): Promise<IDraft> {
    const draft = await this.draftRepository.findById(id);
    if (!draft) throw AppError.notFound('Draft not found');
    if (draft.userId !== userId) throw AppError.forbidden('Insufficient permissions');
    return draft;
  }

  async editDraft(id: string, input: UpdateDraftInput, userId: string): Promise<IDraft> {
    const draft = await this.draftRepository.findById(id);
    if (!draft) throw AppError.notFound('Draft not found');
    if (draft.userId !== userId) throw AppError.forbidden('Insufficient permissions');
    if (draft.status === 'published' || draft.status === 'publishing') throw AppError.badRequest('Published or publishing drafts cannot be edited');
    if (input.workspaceId !== undefined) await this.assertWorkspaceAccess(userId, input.workspaceId);
    const updateData: Record<string, unknown> = {};
    if (input.workspaceId !== undefined) updateData.workspaceId = input.workspaceId;
    if (input.contentType !== undefined) updateData.contentType = input.contentType;
    if (input.caption !== undefined) updateData.caption = input.caption;
    if (input.media !== undefined) updateData.media = input.media;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.targetAccountIds !== undefined) {
      if (input.targetAccountIds.length > 0) {
        await this.validateTargets(userId, input.workspaceId, [draft.platform], input.targetAccountIds);
      }
      updateData.targetAccountIds = input.targetAccountIds;
    }
    const updatedDraft = await this.draftRepository.update(id, updateData as any);
    if (!updatedDraft) throw AppError.internal('Failed to update draft');

    if (Array.isArray(updateData.targetAccountIds) && updateData.targetAccountIds.length > 0) {
      const before = [...((draft.targetAccountIds as string[]) || [])].sort().join(',');
      const after = [...(updateData.targetAccountIds as string[])].sort().join(',');
      if (before !== after) {
        await logActivity({
          userId,
          workspaceId: input.workspaceId,
          action: 'TARGET_ASSIGNED',
          details: `Re-targeted draft to ${(updateData.targetAccountIds as string[]).length} account(s)`,
          meta: {
            draftId: draft._id.toString(),
            platforms: [draft.platform],
            targetAccountIds: updateData.targetAccountIds,
            source: 'manual',
            actor: userId,
            workspaceId: input.workspaceId
          }
        });
      }
    }
    return updatedDraft;
  }

  async archiveDraft(id: string, userId: string): Promise<IDraft> {
    const draft = await this.draftRepository.findById(id);
    if (!draft) throw AppError.notFound('Draft not found');
    if (draft.userId !== userId) throw AppError.forbidden('Insufficient permissions');
    const archivedDraft = await this.draftRepository.archive(id);
    if (!archivedDraft) throw AppError.internal('Failed to archive draft');
    return archivedDraft;
  }

  async deleteDraft(id: string, userId: string): Promise<boolean> {
    const draft = await this.draftRepository.findById(id);
    if (!draft) throw AppError.notFound('Draft not found');
    if (draft.userId !== userId) throw AppError.forbidden('Insufficient permissions');
    return this.draftRepository.delete(id);
  }

  async queueForPublishing(id: string, input: PublishDraftInput, userId: string): Promise<IDraft> {
    return this.draftPublisher.queueForPublishing(id, userId, input.scheduledAt, input.confirmFanout === true);
  }

  async publishNow(id: string, userId: string, input: PublishDraftInput = {}): Promise<IDraft> {
    const draft = await this.draftRepository.findById(id);
    if (!draft) throw AppError.notFound('Draft not found');
    if (draft.userId !== userId) throw AppError.forbidden('Insufficient permissions');
    let targetDraft = draft;
    if (targetDraft.status === 'draft' || targetDraft.status === 'failed') {
      targetDraft = await this.draftPublisher.queueForPublishing(id, userId, undefined, input.confirmFanout === true);
    }
    return this.draftPublisher.publishDraft(targetDraft);
  }

  async retryDraft(id: string, userId: string): Promise<IDraft> {
    return this.draftPublisher.retryDraft(id, userId);
  }

  async getPublishHistory(id: string, userId: string) {
    return this.draftPublisher.getPublishHistory(id, userId);
  }

  async approveCompliance(id: string, userId: string): Promise<IDraft> {
    const draft = await this.draftRepository.findById(id);
    if (!draft) throw AppError.notFound('Draft not found');
    if (draft.userId !== userId) throw AppError.forbidden('Insufficient permissions');
    const updatedDraft = await this.draftRepository.update(id, {
      complianceApproved: true,
      complianceStatus: 'clear'
    } as any);
    if (!updatedDraft) throw AppError.internal('Failed to approve compliance');
    return updatedDraft;
  }

  /**
   * Deletes an already-published draft's post from the provider. The
   * adapters implement deletePost but no route exposed it, which left
   * published posts unremovable from SocialFlow.
   */
  async deleteFromProvider(id: string, userId: string): Promise<IDraft> {
    const draft = await this.draftRepository.findById(id);
    if (!draft) throw AppError.notFound('Draft not found');
    if (draft.userId !== userId) throw AppError.forbidden('Insufficient permissions');
    // platformResponse persists the provider urn as `postId` (schema field);
    // accept the externalPostId alias for callers that use the older name.
    const pr = draft.platformResponse as { externalPostId?: string; postId?: string } | undefined;
    const externalPostId = pr?.externalPostId ?? pr?.postId;
    if (!['published', 'archived'].includes(draft.status) || !externalPostId) {
      throw AppError.badRequest('Draft is not a published post with a provider post id');
    }
    const targets = draft.targetAccountIds ?? [];
    if (targets.length !== 1) {
      throw AppError.badRequest('Provider delete expects exactly one target account');
    }
    const bundle = await this.socialService.resolveAccountTokenBundle(targets[0]);
    if (bundle.account.userId && bundle.account.userId.toString() !== userId) {
      throw AppError.forbidden('Insufficient permissions');
    }
    const provider = ProviderFactory.getConfiguredProvider(draft.platform);
    if (!provider.deletePost) {
      throw AppError.badRequest(`Provider ${draft.platform} does not support post deletion`);
    }
    await provider.deletePost(
      {
        tokens: { accessToken: bundle.accessToken, refreshToken: bundle.refreshToken },
        account: bundle.account as any
      } as any,
      externalPostId
    );
    // The compliance record for this post must stop claiming it is live.
    await new ComplianceService().markRemovedByExternalId(externalPostId);
    await ProjectPostHistoryModel.updateOne(
      { draftId: id },
      { status: 'deleted', deletedAt: new Date() }
    );
    const archived = await this.draftRepository.update(id, { status: 'archived' } as any);
    if (!archived) throw AppError.internal('Failed to archive draft after provider delete');
    return archived;
  }

  async updateComplianceState(
    id: string,
    userId: string,
    state: { status: string; reason?: string; claimDetectedAt?: Date }
  ): Promise<IDraft> {
    const draft = await this.draftRepository.findById(id);
    if (!draft) throw AppError.notFound('Draft not found');
    if (draft.userId !== userId) throw AppError.forbidden('Insufficient permissions');
    const updateData: Record<string, unknown> = {
      complianceStatus: state.status,
    };
    if (state.reason) updateData.claimReason = state.reason;
    if (state.claimDetectedAt) updateData.claimDetectedAt = state.claimDetectedAt;
    if (state.status === 'clear' || state.status === 'low_risk') {
      updateData.complianceApproved = true;
    }
    const updatedDraft = await this.draftRepository.update(id, updateData as any);
    if (!updatedDraft) throw AppError.internal('Failed to update compliance state');
    return updatedDraft;
  }

  async recordClaim(id: string, userId: string, claimReason: string): Promise<IDraft> {
    return this.updateComplianceState(id, userId, {
      status: 'claimed',
      reason: claimReason,
      claimDetectedAt: new Date()
    });
  }

  async bulkApproveCompliance(draftIds: string[], userId: string): Promise<{ approvedCount: number; draftIds: string[] }> {
    if (!draftIds || draftIds.length === 0) {
      return { approvedCount: 0, draftIds: [] };
    }
    const result = await DraftModel.updateMany(
      { _id: { $in: draftIds }, userId },
      { $set: { complianceApproved: true, complianceStatus: 'clear' } }
    ).exec();
    return {
      approvedCount: result.modifiedCount || 0,
      draftIds
    };
  }

  async schedulePublish(id: string, scheduledAt: string, userId: string): Promise<IDraft> {
    const draft = await this.draftRepository.findById(id);
    if (!draft) throw AppError.notFound('Draft not found');
    if (draft.userId !== userId) throw AppError.forbidden('Insufficient permissions');
    const updatedDraft = await this.draftRepository.update(id, {
      status: 'ready',
      scheduledAt: new Date(scheduledAt),
    } as any);
    if (!updatedDraft) throw AppError.internal('Failed to schedule draft');
    return updatedDraft;
  }
}

export default DraftService;
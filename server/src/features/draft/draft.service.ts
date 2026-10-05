import { DraftRepository, PaginatedDraftsResult } from './draft.repository';
import { DraftPublisher } from './draft.publisher';
import { AppError } from '../../shared/errors/appError';
import { IDraft } from './draft.model';
import { CreateDraftInput, UpdateDraftInput, PublishDraftInput } from './draft.validation';
import { resolveTargetAccounts } from '../social/targeting';
import { logActivity } from '../../shared/utils/activityLog';

export interface PaginatedDrafts {
  items: IDraft[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export class DraftService {
  private draftPublisher: DraftPublisher;

  constructor(private draftRepository: DraftRepository) {
    this.draftPublisher = new DraftPublisher(draftRepository);
  }

  async createDraft(input: CreateDraftInput, userId: string): Promise<IDraft> {
    // Validate explicit targets at write time (ownership, workspace, platform,
    // connection). `[]` is allowed here as "not yet targeted" — it is rejected
    // at queue/publish time and never means "publish everywhere". Absent
    // targets keep the legacy fan-out for old clients.
    if (input.targetAccountIds !== undefined && input.targetAccountIds.length > 0) {
      await this.validateTargets(userId, input.workspaceId, [input.platform], input.targetAccountIds);
    }

    const draft = await this.draftRepository.create({
      userId,
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
    const updateData: Record<string, unknown> = {};
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
}

export default DraftService;
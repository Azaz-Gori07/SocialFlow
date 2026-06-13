import { DraftRepository, PaginatedDraftsResult } from './draft.repository';
import { DraftPublisher } from './draft.publisher';
import { AppError } from '../../shared/errors/appError';
import { IDraft } from './draft.model';
import { CreateDraftInput, UpdateDraftInput, PublishDraftInput } from './draft.validation';

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
    const draft = await this.draftRepository.create({
      userId,
      platform: input.platform,
      contentType: input.contentType,
      caption: input.caption,
      media: input.media,
      status: 'draft'
    });
    return draft;
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
    const updatedDraft = await this.draftRepository.update(id, updateData as any);
    if (!updatedDraft) throw AppError.internal('Failed to update draft');
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
    return this.draftPublisher.queueForPublishing(id, userId, input.scheduledAt);
  }

  async publishNow(id: string, userId: string): Promise<IDraft> {
    const draft = await this.draftRepository.findById(id);
    if (!draft) throw AppError.notFound('Draft not found');
    if (draft.userId !== userId) throw AppError.forbidden('Insufficient permissions');
    let targetDraft = draft;
    if (targetDraft.status === 'draft' || targetDraft.status === 'failed') {
      targetDraft = await this.draftPublisher.queueForPublishing(id, userId);
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
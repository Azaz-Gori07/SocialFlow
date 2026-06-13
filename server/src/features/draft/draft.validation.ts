import { z } from 'zod';

export const platformEnum = z.enum(['instagram', 'facebook', 'linkedin', 'twitter', 'youtube']);
export const contentTypeEnum = z.enum(['post', 'story', 'reel', 'video', 'carousel', 'thread']);
export const draftStatusEnum = z.enum(['draft', 'ready', 'publishing', 'archived', 'published', 'failed']);

const mediaRefSchema = z.object({
  url: z.string().min(1, 'Media URL is required'),
  type: z.enum(['image', 'video', 'document']),
  name: z.string().min(1, 'Media name is required'),
  size: z.number().optional()
});

export const createDraftSchema = z.object({
  platform: platformEnum,
  contentType: contentTypeEnum.default('post'),
  caption: z.string().optional(),
  media: z.array(mediaRefSchema).optional().default([])
});

export const uploadMediaSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  fileType: z.enum(['image', 'video', 'document']),
  fileSize: z.number().optional()
});

export const updateDraftSchema = z.object({
  contentType: contentTypeEnum.optional(),
  caption: z.string().optional(),
  media: z.array(mediaRefSchema).optional(),
  status: draftStatusEnum.optional()
});

export const publishDraftSchema = z.object({
  scheduledAt: z.string().optional() // optional future timestamp for scheduling
});

export const draftIdSchema = z.object({
  id: z.string().min(1, 'Draft ID is required')
});

export type CreateDraftInput = z.infer<typeof createDraftSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;
export type UploadMediaInput = z.infer<typeof uploadMediaSchema>;
export type PublishDraftInput = z.infer<typeof publishDraftSchema>;
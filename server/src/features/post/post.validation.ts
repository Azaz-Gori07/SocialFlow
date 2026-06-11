import { z } from 'zod';

const platformEnum = z.enum(['twitter', 'instagram', 'facebook', 'linkedin', 'youtube', 'tiktok']);

export const createPostBaseSchema = z.object({
  content: z.string().min(1, 'Post content is required'),
  platforms: z.array(platformEnum).min(1, 'At least one social platform must be selected'),
  status: z.enum(['draft', 'scheduled']).default('draft'),
  scheduledAt: z.string().optional().refine((val) => {
    if (!val) return true;
    // Must be a future date
    return new Date(val).getTime() > Date.now();
  }, {
    message: 'Scheduled publishing date must be in the future'
  }),
  media: z.array(z.string()).optional().default([]),
  platformContent: z.record(z.string(), z.string()).optional().default({})
});

export const createPostSchema = createPostBaseSchema.refine((data) => {
  // If status is scheduled, scheduledAt must be provided
  if (data.status === 'scheduled' && !data.scheduledAt) {
    return false;
  }
  return true;
}, {
  message: 'Scheduled publishing date is required for scheduled posts',
  path: ['scheduledAt']
});

export const updatePostSchema = createPostBaseSchema.partial();

export const postIdSchema = z.object({
  id: z.string().min(1, 'Post ID is required')
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

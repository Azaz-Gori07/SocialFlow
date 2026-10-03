import { z } from 'zod';

const platformEnum = z.enum(['twitter', 'instagram', 'facebook', 'linkedin', 'youtube', 'threads']);

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

/**
 * Partial update. `.partial()` does NOT disable the inner `.default()` values —
 * a body of `{ scheduledAt }` still arrives with `status: 'draft'`, `media: []`
 * and `platformContent: {}` injected, which silently demoted every scheduled
 * post on edit. The update schema is therefore built without defaults so a PUT
 * only ever writes the fields the caller actually sent.
 */
export const updatePostSchema = z
  .object({
    content: z.string().min(1, 'Post content is required').optional(),
    platforms: z.array(platformEnum).min(1, 'At least one social platform must be selected').optional(),
    status: z.enum(['draft', 'scheduled']).optional(),
    scheduledAt: z
      .string()
      .optional()
      .refine((val) => {
        if (!val) return true;
        return new Date(val).getTime() > Date.now();
      }, { message: 'Scheduled publishing date must be in the future' }),
    media: z.array(z.string()).optional(),
    platformContent: z.record(z.string(), z.string()).optional()
  })
  .refine((data) => {
    if (data.status === 'scheduled' && !data.scheduledAt) return false;
    return true;
  }, {
    message: 'Scheduled publishing date is required for scheduled posts',
    path: ['scheduledAt']
  });

export const postIdSchema = z.object({
  id: z.string().min(1, 'Post ID is required')
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

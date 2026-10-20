import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  name: z.string().min(2, 'Workspace name must be at least 2 characters long').max(50, 'Workspace name cannot exceed 50 characters')
});

export const workspaceSettingsSchema = z.object({
  timezone: z.string().trim().min(1).max(80).optional(),
  dateFormat: z.enum(['MMM D, YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).optional(),
  autoShortenUrls: z.boolean().optional(),
  autoHashtags: z.boolean().optional(),
  crossPostWarning: z.boolean().optional(),
  webhookUrl: z.union([z.string().trim().url('Webhook must be a valid URL'), z.literal('')]).optional()
});

export const updateWorkspaceSchema = z
  .object({
    name: z.string().trim().min(2, 'Workspace name must be at least 2 characters long').max(50).optional(),
    settings: workspaceSettingsSchema.optional()
  })
  .refine((value) => value.name !== undefined || value.settings !== undefined, {
    message: 'Provide a name or settings to update'
  });

export const updateSettingsSchema = workspaceSettingsSchema.refine(
  (value) => Object.keys(value).length > 0,
  { message: 'Provide at least one setting to update' }
);

export const inviteMemberSchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  email: z.string().email('Invalid email address format'),
  role: z.enum(['admin', 'editor', 'viewer'], {
    message: "Role must be one of: 'admin', 'editor', or 'viewer'"
  })
});

export const updateRoleSchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  memberUserId: z.string().min(1, 'Member user ID is required'),
  role: z.enum(['admin', 'editor', 'viewer'], {
    message: "Role must be one of: 'admin', 'editor', or 'viewer'"
  })
});

export const listWorkspaceQuerySchema = z.object({
  limit: z.string().optional().transform((val) => {
    if (!val) return 50;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) || parsed < 1 ? 50 : Math.min(parsed, 200);
  }),
  offset: z.string().optional().transform((val) => {
    if (!val) return 0;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  })
});

export const listPostsQuerySchema = z.object({
  status: z.enum(['draft', 'scheduled', 'published', 'failed']).optional(),
  limit: z.string().optional().transform((val) => {
    if (!val) return 50;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) || parsed < 1 ? 50 : Math.min(parsed, 200);
  }),
  offset: z.string().optional().transform((val) => {
    if (!val) return 0;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  })
});

export const listCommentsQuerySchema = z.object({
  platform: z.string().optional(),
  status: z.enum(['unresolved', 'resolved']).optional(),
  limit: z.string().optional().transform((val) => {
    if (!val) return 50;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) || parsed < 1 ? 50 : Math.min(parsed, 200);
  }),
  offset: z.string().optional().transform((val) => {
    if (!val) return 0;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  })
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type ListWorkspaceQuery = z.infer<typeof listWorkspaceQuerySchema>;
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;

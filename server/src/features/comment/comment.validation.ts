import { z } from 'zod';

export const listCommentsQuerySchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  platform: z.enum(['twitter', 'instagram', 'facebook', 'linkedin', 'youtube', 'tiktok']).optional(),
  status: z.enum(['unresolved', 'resolved']).optional(),
  assignedTo: z.string().optional()
});

export const replyCommentSchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  commentId: z.string().min(1, 'Comment ID is required'),
  message: z.string().min(1, 'Message cannot be empty')
});

export const resolveCommentSchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  status: z.enum(['unresolved', 'resolved'])
});

export const assignCommentSchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  assignedTo: z.string().min(1, 'Assigned user ID is required')
});

export const suggestReplySchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  commentId: z.string().min(1, 'Comment ID is required')
});

export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;
export type ReplyCommentInput = z.infer<typeof replyCommentSchema>;
export type ResolveCommentInput = z.infer<typeof resolveCommentSchema>;
export type AssignCommentInput = z.infer<typeof assignCommentSchema>;
export type SuggestReplyInput = z.infer<typeof suggestReplySchema>;

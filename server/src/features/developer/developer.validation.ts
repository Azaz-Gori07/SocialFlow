import { z } from 'zod';

export const developerIdSchema = z.object({
  id: z.string().min(1, 'Developer ID is required')
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

/** Mongo ObjectId hex — validated before it reaches a query, which would otherwise cast-and-fail. */
export const mongoIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier')
});

export const repositoryIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid repository id')
});

export const githubCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'OAuth state is required')
});

/** Strict boolean: "true"/"false" strings are rejected, not coerced. */
export const monitoringSchema = z.object({
  enabled: z.boolean()
});

export const syncLogQuerySchema = z.object({
  repositoryId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid repository id'),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

const importanceEnum = z.enum(['TRIVIAL', 'LOW', 'MEDIUM', 'HIGH', 'MILESTONE']);
const memoryCategoryEnum = z.enum([
  'feature',
  'problem_solved',
  'milestone',
  'architecture',
  'tech_stack',
  'stage',
  'history',
  'custom'
]);
const opportunityStatusEnum = z.enum(['baseline', 'pending', 'generated', 'skipped', 'rejected']);

export const activityQuerySchema = z.object({
  repositoryId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid repository id').optional(),
  importance: importanceEnum.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

export const memoryQuerySchema = z.object({
  repositoryId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid repository id'),
  category: memoryCategoryEnum.optional(),
  search: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

/** At least one editable field; an empty patch is a no-op, not a silent 200. */
export const memoryEditSchema = z
  .object({
    value: z.string().min(1).max(2000).optional(),
    items: z.array(z.string().min(1).max(500)).max(50).optional(),
    category: memoryCategoryEnum.optional()
  })
  .refine((data) => data.value !== undefined || data.items !== undefined || data.category !== undefined, {
    message: 'Provide at least one of: value, items, category'
  });

export const opportunityQuerySchema = z.object({
  repositoryId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid repository id').optional(),
  status: opportunityStatusEnum.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

/** 'baseline' is pipeline-assigned, so it is not accepted from a client. */
export const opportunityStatusSchema = z.object({
  status: z.enum(['pending', 'generated', 'skipped', 'rejected'])
});

/**
 * The pipeline takes no body. `baseline` is assigned by the sync orchestrator on
 * the initial sync only, so the object is strict: an unknown key is a 400, not
 * a silently stripped value.
 */
export const pipelineSchema = z.strictObject({});

/**
 * Automation settings patch. Every field optional; strict booleans (no string
 * coercion) and strict integers, so "true" or 1.5 is a 400, not a silent no-op.
 * Server-side whitelisting in settings.service.ts is still the last gate.
 */
const toneEnum = z.enum(['technical', 'casual', 'storytelling', 'founder', 'learning', 'short_form']);

export const settingsPatchSchema = z
  .object({
    detectOpportunities: z.boolean().optional(),
    generateDrafts: z.boolean().optional(),
    autoContent: z.boolean().optional(),
    autoPublish: z.boolean().optional(),
    aiInstructions: z.string().max(4000).nullable().optional(),
    aiLength: z.enum(['short', 'medium', 'long']).nullable().optional(),
    aiTechnicalDepth: z.enum(['high_level', 'technical', 'deep_dive']).nullable().optional(),
    schedPeriod: z.enum(['day', 'week', 'month']).optional(),
    schedMinPosts: z.number().int().min(0).optional(),
    schedMaxPosts: z.number().int().min(1).optional(),
    maxPostsPerWeek: z.string().nullable().optional(),
    defaultTone: toneEnum.optional(),
    timezone: z.string().min(1).max(64).optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one setting to update'
  });

/** Manual generation trigger. */
export const contentGenerateSchema = z.object({
  preferredTone: toneEnum.optional(),
  customInstructions: z.string().max(4000).optional()
});

export type DeveloperIdInput = z.infer<typeof developerIdSchema>;
export type DeveloperPaginationInput = z.infer<typeof paginationSchema>;
export type GitHubCallbackInput = z.infer<typeof githubCallbackSchema>;
export type MonitoringInput = z.infer<typeof monitoringSchema>;
export type SyncLogQueryInput = z.infer<typeof syncLogQuerySchema>;
export type ActivityQueryInput = z.infer<typeof activityQuerySchema>;
export type MemoryQueryInput = z.infer<typeof memoryQuerySchema>;
export type MemoryEditInput = z.infer<typeof memoryEditSchema>;
export type OpportunityQueryInput = z.infer<typeof opportunityQuerySchema>;
export type OpportunityStatusInput = z.infer<typeof opportunityStatusSchema>;
export type PipelineInput = z.infer<typeof pipelineSchema>;
export type SettingsPatchInput = z.infer<typeof settingsPatchSchema>;
export type ContentGenerateInput = z.infer<typeof contentGenerateSchema>;

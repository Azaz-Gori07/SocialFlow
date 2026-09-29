import { AppError } from '../../../shared/errors/appError';
import { logger } from '../../../shared/utils/logger';
import { AIService } from '../../../services/ai/ai.service';
import { DraftService } from '../../draft/draft.service';
import { DraftRepository } from '../../draft/draft.repository';
import { ActivityService } from '../activities/activity.service';
import { MemoryService } from '../memory/memory.service';
import { MemoryRepository } from '../memory/memory.repository';
import { RepositoryService } from '../repositories/repository.service';
import { OpportunityRepository } from '../opportunities/opportunity.repository';
import { SettingsRepository } from '../settings/settings.repository';
import { AutomationSettings, resolveSettings } from '../settings/settings.service';
import {
  detectContentOpportunities,
  ActivityLike
} from './idea-detector';
import {
  PostVariant,
  StoryContext,
  buildStoryContext,
  buildPostPrompt,
  flattenPrompt,
  trimPost
} from './prompts';
import { WritingTone, StyleInput, analyzeStyle, StyleProfile } from './style-analyzer';
import { FactCheckResult, PostValidation, factCheckPost, validatePost } from './fact-checker';
import { shouldSkipOpportunity } from './smart-skip';

/** Post variants generated per opportunity, in order. Sequential = gentler on rate limits. */
const VARIANTS: PostVariant[] = ['story', 'technical', 'short_casual'];

const PERIOD_MS: Record<string, number> = {
  day: 86400 * 1000,
  week: 7 * 86400 * 1000,
  month: 30 * 86400 * 1000
};

/** Max opportunities inspected per auto run; keeps the loop bounded. */
const AUTO_SCAN_LIMIT = 200;

/**
 * User free-text instructions plus the two structural preferences. Both land in
 * the same USER CONTENT PREFERENCES block, so they are concatenated rather than
 * passed separately — the prompt builder treats that block as one string.
 */
function composeInstructions(
  custom: string | null | undefined,
  settings: AutomationSettings
): string | null {
  const lines: string[] = [];
  if (custom?.trim()) lines.push(custom.trim());
  if (settings.aiLength) lines.push(`Post length preference: ${settings.aiLength}.`);
  if (settings.aiTechnicalDepth) lines.push(`Technical depth: ${settings.aiTechnicalDepth.replace(/_/g, ' ')}.`);
  return lines.length > 0 ? lines.join('\n') : null;
}

export interface GeneratedDraft {
  id: string;
  variant: PostVariant;
  content: string;
}

export interface GenerateResult {
  drafts: GeneratedDraft[];
  factCheck: FactCheckResult;
  validation: Array<{ variant: PostVariant; valid: boolean; issues: PostValidation['issues'] }>;
  style: StyleProfile;
  /** Variants whose AI call failed; siblings still persist. */
  failedVariants: Array<{ variant: PostVariant; error: string }>;
}

export interface AutoGenerationResult {
  generated: number;
  skipped: number;
  pending: number;
  created: Array<{ draftId: string; opportunityId: string; opportunityTitle: string }>;
}

export class ContentService {
  private ai = new AIService();
  private draftRepository = new DraftRepository();
  private draftService = new DraftService(this.draftRepository);

  constructor(
    private opportunityRepository: OpportunityRepository,
    private activityService: ActivityService,
    private repositoryService: RepositoryService,
    private memoryService: MemoryService,
    private memoryRepository: MemoryRepository,
    private settingsRepository: SettingsRepository
  ) {}

  /**
   * Generate LinkedIn drafts for one opportunity: detect → context → style →
   * generate → fact-check → validate → persist as SocialFlow drafts.
   *
   * NEVER publishes. Drafts land in status 'draft' and stay under the user's
   * control in SocialFlow's own review flow.
   */
  async generateForOpportunity(
    userId: string,
    opportunityId: string,
    opts?: {
      preferredTone?: WritingTone;
      customInstructions?: string | null;
      /** Pre-built by a batch caller that already paid for the query. */
      memoryContext?: { techStack: string[]; journey: string[]; relatedHints: string[] };
    }
  ): Promise<GenerateResult> {
    const opportunity = await this.opportunityRepository.findOwned(userId, opportunityId);
    if (!opportunity) throw AppError.notFound('Opportunity not found');
    const repository = await this.repositoryService.getById(userId, opportunity.repositoryId);
    const activity = await this.activityService.getById(userId, opportunity.activityId);
    const settings = await resolveSettings(this.settingsRepository, userId);

    const [detected] = detectContentOpportunities([toActivityLike(activity)]);
    if (!detected) {
      throw AppError.badRequest('Activity is not a content opportunity (not post-worthy)');
    }

    if (!this.ai.isConfigured) throw AppError.providerNotConfigured('AI');

    const memory = opts?.memoryContext ?? await this.buildMemoryContext(userId, opportunity.repositoryId);
    const context = buildStoryContext({
      projectName: repository.name ?? repository.fullName,
      // Never feed the free-text repository description: it is user
      // meta-commentary, not verified evidence, and leaks into posts as false
      // claims about the work.
      projectDescription: undefined,
      techStack: memory.techStack,
      journey: memory.journey,
      problem: detected.problem,
      activityTitle: detected.title,
      changes: detected.changes,
      affectedAreas: detected.affectedAreas,
      evidence: detected.evidence,
      relatedMemoryHints: memory.relatedHints
    });

    const coveredTopics = await this.getCoveredTopics(userId, opportunity.repositoryId);
    const styleInput: StyleInput = {
      preferredTone: opts?.preferredTone ?? (settings.defaultTone as WritingTone),
      coveredTopics
    };
    const { profile } = analyzeStyle(styleInput);
    const customInstructions = composeInstructions(opts?.customInstructions ?? settings.aiInstructions, settings);

    const generated = await this.generateVariants(context, profile, styleInput, customInstructions);

    const factCheck = factCheckPost(
      generated.posts.map((p) => p.content).join('\n'),
      detected.evidence,
      { activityTitle: detected.title }
    );

    const validation = generated.posts.map((p) => {
      const result = validatePost(p.content);
      return { variant: p.variant, valid: result.valid, issues: result.issues };
    });

    // Structural gate: never persist degenerate variants (model misfires,
    // reasoning leaks) into the review queue.
    const drafts: GeneratedDraft[] = [];
    for (const post of generated.posts) {
      const v = validation.find((x) => x.variant === post.variant);
      if (v && !v.valid) continue;
      const draft = await this.draftService.createDraft(
        {
          platform: 'linkedin',
          contentType: 'post',
          caption: post.content,
          media: [],
          sourceType: 'developer_activity',
          developerActivityId: opportunity.activityId,
          developerRepositoryId: opportunity.repositoryId,
          developerOpportunityId: opportunity._id.toString(),
          evidence: detected.evidence,
          aiMetadata: {
            variant: post.variant,
            factCheck,
            validation: v,
            style: profile,
            opportunityTitle: detected.title
          }
        },
        userId
      );
      drafts.push({ id: draft._id.toString(), variant: post.variant, content: post.content });
    }

    if (drafts.length === 0) {
      // Status is intentionally NOT flipped: a retry may succeed.
      throw AppError.badRequest('All generated variants failed validation — no drafts persisted');
    }

    await this.opportunityRepository.updateStatus(opportunity._id.toString(), 'generated');

    return { drafts, factCheck, validation, style: profile, failedVariants: generated.failed };
  }

  /**
   * Auto content loop: for pending opportunities, generate drafts when the
   * settings allow. Respects the frequency cap and covered-topic dedup.
   *
   * ponytail: `autoPublish` is accepted but never publishes — SocialFlow has no
   * approved/auto-publish path for developer drafts and publishing must stay
   * SocialFlow-owned. Upgrade: queue via DraftPublisher.queueForPublishing once
   * the product wants developer drafts to auto-queue.
   */
  async runAutoGeneration(userId: string): Promise<AutoGenerationResult> {
    const empty: AutoGenerationResult = { generated: 0, skipped: 0, pending: 0, created: [] };
    try {
      const settings = await resolveSettings(this.settingsRepository, userId);
      if (!settings.autoContent && !settings.generateDrafts && !settings.autoPublish) return empty;

      const pending = await this.opportunityRepository.list({
        userId,
        status: 'pending',
        limit: AUTO_SCAN_LIMIT,
        offset: 0
      });

      const result: AutoGenerationResult = { generated: 0, skipped: 0, pending: pending.length, created: [] };
      if (pending.length === 0) return result;

      // Scheduler maximum: count drafts already produced in the period window.
      // Minimum is a target only — generation still requires pending
      // evidence-backed opportunities, so it can never force fabricated content.
      const windowMs = PERIOD_MS[settings.schedPeriod] ?? PERIOD_MS.week;
      const windowStart = new Date(Date.now() - windowMs);
      const alreadyInWindow = await this.countRecentDeveloperDrafts(userId, windowStart);
      const effectiveMax = this.effectiveMax(settings);

      // Per-repository caches. Neither input changes inside the loop — drafts
      // created by generation are all status 'draft', so they cannot alter
      // published-topic coverage — and both were previously re-queried per
      // opportunity, making the loop O(opportunities) in DB round trips.
      const coveredTopicsCache = new Map<string, string[]>();
      const memoryContextCache = new Map<
        string,
        { techStack: string[]; journey: string[]; relatedHints: string[] }
      >();

      for (const opportunity of pending) {
        if (alreadyInWindow + result.generated >= effectiveMax) {
          // At the scheduler maximum — leave the opportunity pending for a later window.
          result.skipped++;
          continue;
        }
        try {
          let coveredTopics = coveredTopicsCache.get(opportunity.repositoryId);
          if (!coveredTopics) {
            coveredTopics = await this.getCoveredTopics(userId, opportunity.repositoryId);
            coveredTopicsCache.set(opportunity.repositoryId, coveredTopics);
          }
          const decision = shouldSkipOpportunity({
            title: opportunity.title,
            coveredTopics,
            postsThisWeek: alreadyInWindow,
            maxPostsPerWeek: settings.maxPostsPerWeek,
            importance: (opportunity.metadata as { importance?: string })?.importance ?? 'MEDIUM',
            hasEvidence: !!((opportunity.metadata as { evidence?: unknown })?.evidence)
          });
          if (decision.skip) {
            result.skipped++;
            await this.opportunityRepository.updateStatus(opportunity._id.toString(), 'skipped');
            continue;
          }

          let memoryContext = memoryContextCache.get(opportunity.repositoryId);
          if (!memoryContext) {
            memoryContext = await this.buildMemoryContext(userId, opportunity.repositoryId);
            memoryContextCache.set(opportunity.repositoryId, memoryContext);
          }
          const generated = await this.generateForOpportunity(
            userId,
            opportunity._id.toString(),
            {
              preferredTone: settings.defaultTone as WritingTone,
              customInstructions: settings.aiInstructions,
              memoryContext
            }
          );
          result.generated += generated.drafts.length;
          for (const d of generated.drafts) {
            result.created.push({
              draftId: d.id,
              opportunityId: opportunity._id.toString(),
              opportunityTitle: opportunity.title
            });
          }
        } catch (error) {
          logger.error('[developer] auto-generate failed for opportunity', {
            opportunityId: opportunity._id.toString(),
            error: error instanceof Error ? error.message : String(error)
          });
          result.skipped++;
        }
      }
      return result;
    } catch (error) {
      logger.error('[developer] auto generation run failed', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      return empty;
    }
  }

  /**
   * Already-covered topics for a repository.
   *
   * Source choice: SocialFlow's `posts` collection has no metadata field, so
   * covered topics are read from the user's PUBLISHED developer drafts via
   * `aiMetadata.opportunityTitle` (queryable through the existing draft
   * repository, no schema bypass).
   */
  private async getCoveredTopics(userId: string, repositoryId: string): Promise<string[]> {
    const drafts = await this.listDeveloperDrafts(userId);
    const topics = new Set<string>();
    for (const d of drafts) {
      if (d.status !== 'published') continue;
      if (d.developerRepositoryId !== repositoryId) continue;
      const title = d.aiMetadata?.opportunityTitle;
      if (typeof title === 'string' && title.trim()) topics.add(title.toLowerCase());
    }
    return [...topics];
  }

  /** Developer-created drafts, used for both covered topics and the cap. */
  private async listDeveloperDrafts(userId: string) {
    const result = await this.draftRepository.findPaginated(userId, {
      limit: AUTO_SCAN_LIMIT,
      offset: 0
    });
    return result.items.filter((d) => d.sourceType === 'developer_activity');
  }

  private async countRecentDeveloperDrafts(userId: string, windowStart: Date): Promise<number> {
    const drafts = await this.listDeveloperDrafts(userId);
    return drafts.filter((d) => new Date(d.createdAt as unknown as string) >= windowStart).length;
  }

  private effectiveMax(settings: AutomationSettings): number {
    const legacyMax = settings.maxPostsPerWeek && settings.maxPostsPerWeek !== 'every'
      ? Number(settings.maxPostsPerWeek)
      : null;
    return legacyMax !== null && Number.isFinite(legacyMax) && legacyMax >= 0
      ? Math.min(settings.schedMaxPosts, legacyMax)
      : settings.schedMaxPosts;
  }

  /** Tech stack, milestone journey and feature/problem history from memory. */
  private async buildMemoryContext(
    userId: string,
    repositoryId: string
  ): Promise<{ techStack: string[]; journey: string[]; relatedHints: string[] }> {
    const rows = await this.memoryRepository.listActive(userId, repositoryId);
    const techStack = rows.filter((m) => m.category === 'tech_stack').flatMap((m) => m.items ?? []);
    const relatedHints = rows
      .filter((m) => m.category === 'feature' || m.category === 'problem_solved')
      .slice(0, 5)
      .map((m) => m.value);
    let journey: string[] = [];
    try {
      journey = (await this.memoryService.buildJourney(userId, repositoryId)).journey;
    } catch {
      // Journey is context enrichment; a failure must not block generation.
      journey = rows.filter((m) => m.category === 'milestone').map((m) => m.value);
    }
    return { techStack, journey, relatedHints };
  }

  /**
   * Sequential generation, one AI call per variant. A failing variant is
   * recorded and skipped — its siblings must still reach the user.
   */
  private async generateVariants(
    context: StoryContext,
    style: StyleProfile,
    styleInput: StyleInput,
    customInstructions?: string | null
  ): Promise<{ posts: Array<{ variant: PostVariant; content: string }>; failed: Array<{ variant: PostVariant; error: string }> }> {
    const posts: Array<{ variant: PostVariant; content: string }> = [];
    const failed: Array<{ variant: PostVariant; error: string }> = [];
    for (const variant of VARIANTS) {
      try {
        const { system, prompt } = buildPostPrompt(variant, context, style, styleInput, customInstructions);
        const response = await this.ai.execute({
          prompt: flattenPrompt(system, prompt),
          // Headroom for full narrative variants; a truncated post is worse
          // than a long one — review trims, cutoff corrupts.
          options: { temperature: 0.7, max_tokens: 2000 }
        });
        posts.push({ variant, content: trimPost(AIService.extractText(response.data)) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('[developer] post variant generation failed', { variant, error: message });
        failed.push({ variant, error: message });
      }
    }
    if (posts.length === 0) {
      throw AppError.providerError('AI generation failed for every variant');
    }
    return { posts, failed };
  }
}

function toActivityLike(activity: any): ActivityLike {
  return {
    id: activity._id.toString(),
    title: activity.title,
    type: activity.type,
    importance: activity.importance,
    importanceScore: activity.importanceScore ?? 0,
    problem: activity.problem ?? null,
    changes: activity.changes ?? [],
    affectedAreas: activity.affectedAreas ?? [],
    isMilestone: activity.isMilestone ?? null,
    linkedInWorthy: activity.linkedInWorthy ?? null,
    confidence: activity.confidence ?? null,
    evidence: activity.evidence ?? {},
    detectedAt: activity.detectedAt
  };
}

export default ContentService;

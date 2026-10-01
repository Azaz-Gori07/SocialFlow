import { AppError } from '../../../shared/errors/appError';
import { logger } from '../../../shared/utils/logger';
import { SettingsRepository, DeveloperSettingsPatch } from './settings.repository';
import { IDeveloperSettings } from './settings.model';

export interface AutomationSettings {
  detectOpportunities: boolean;
  generateDrafts: boolean;
  autoPublish: boolean;
  autoContent: boolean;
  aiInstructions: string | null;
  aiLength: string | null;
  aiTechnicalDepth: string | null;
  schedPeriod: string;
  schedMinPosts: number;
  schedMaxPosts: number;
  maxPostsPerWeek: string | null;
  defaultTone: string;
  timezone: string;
}

export const SETTINGS_DEFAULTS: AutomationSettings = {
  detectOpportunities: true,
  generateDrafts: false,
  autoPublish: false,
  autoContent: false,
  aiInstructions: null,
  aiLength: null,
  aiTechnicalDepth: null,
  schedPeriod: 'week',
  schedMinPosts: 1,
  schedMaxPosts: 3,
  maxPostsPerWeek: null,
  defaultTone: 'technical',
  timezone: 'UTC'
};

const AI_LENGTHS = ['short', 'medium', 'long'];
const AI_DEPTHS = ['high_level', 'technical', 'deep_dive'];
const SCHED_PERIODS = ['day', 'week', 'month'];

/** Maximum stored user instructions; longer input is truncated, not rejected. */
const AI_INSTRUCTIONS_MAX = 4000;

export class SettingsService {
  constructor(private settingsRepository: SettingsRepository) {}

  /** Load a user's automation settings — creates the row with defaults on first call. */
  async getSettings(userId: string): Promise<AutomationSettings> {
    const existing = await this.settingsRepository.findByUser(userId);
    if (existing) return rowToSettings(existing);
    await this.settingsRepository.createDefault(userId);
    return { ...SETTINGS_DEFAULTS };
  }

  async updateSettings(userId: string, patch: DeveloperSettingsPatch): Promise<AutomationSettings> {
    const existing = await this.settingsRepository.findByUser(userId);
    const allowed: DeveloperSettingsPatch = {};

    if (typeof patch.detectOpportunities === 'boolean') allowed.detectOpportunities = patch.detectOpportunities;
    if (typeof patch.generateDrafts === 'boolean') allowed.generateDrafts = patch.generateDrafts;
    if (typeof patch.autoPublish === 'boolean') allowed.autoPublish = patch.autoPublish;
    if (typeof patch.autoContent === 'boolean') allowed.autoContent = patch.autoContent;
    if (patch.aiInstructions !== undefined) {
      // Cap stored instructions; empty string clears back to null.
      const v = patch.aiInstructions;
      allowed.aiInstructions = v === null || v === undefined
        ? null
        : String(v).slice(0, AI_INSTRUCTIONS_MAX) || null;
    }
    if (patch.aiLength === null) {
      allowed.aiLength = null;
    } else if (typeof patch.aiLength === 'string' && AI_LENGTHS.includes(patch.aiLength)) {
      allowed.aiLength = patch.aiLength;
    }
    if (patch.aiTechnicalDepth === null) {
      allowed.aiTechnicalDepth = null;
    } else if (typeof patch.aiTechnicalDepth === 'string' && AI_DEPTHS.includes(patch.aiTechnicalDepth)) {
      allowed.aiTechnicalDepth = patch.aiTechnicalDepth;
    }
    if (patch.schedPeriod !== undefined && SCHED_PERIODS.includes(patch.schedPeriod)) {
      allowed.schedPeriod = patch.schedPeriod;
    }
    if (patch.schedMinPosts !== undefined && Number.isInteger(patch.schedMinPosts) && patch.schedMinPosts >= 0) {
      allowed.schedMinPosts = patch.schedMinPosts;
    }
    if (patch.schedMaxPosts !== undefined && Number.isInteger(patch.schedMaxPosts) && patch.schedMaxPosts >= 1) {
      allowed.schedMaxPosts = patch.schedMaxPosts;
    }
    // Minimum is a target, but an inverted range is a client error — reject
    // against the effective pair (incoming values over stored ones).
    if (allowed.schedMinPosts !== undefined || allowed.schedMaxPosts !== undefined) {
      const effectiveMin = allowed.schedMinPosts ?? existing?.schedMinPosts ?? SETTINGS_DEFAULTS.schedMinPosts;
      const effectiveMax = allowed.schedMaxPosts ?? existing?.schedMaxPosts ?? SETTINGS_DEFAULTS.schedMaxPosts;
      if (effectiveMin > effectiveMax) {
        throw AppError.badRequest('schedMinPosts cannot exceed schedMaxPosts');
      }
    }
    if (patch.maxPostsPerWeek !== undefined) allowed.maxPostsPerWeek = patch.maxPostsPerWeek;
    if (typeof patch.defaultTone === 'string') allowed.defaultTone = patch.defaultTone;
    if (typeof patch.timezone === 'string') allowed.timezone = patch.timezone;

    if (existing) {
      await this.settingsRepository.update(userId, allowed);
    } else {
      await this.settingsRepository.create(userId, allowed);
    }
    return this.getSettings(userId);
  }
}

/**
 * Job-safe settings read: a missing row yields defaults and a transient DB
 * failure degrades to defaults instead of crashing the scheduler.
 */
export async function resolveSettings(
  settingsRepository: SettingsRepository,
  userId: string
): Promise<AutomationSettings> {
  try {
    const existing = await settingsRepository.findByUser(userId);
    return existing ? rowToSettings(existing) : { ...SETTINGS_DEFAULTS };
  } catch (error) {
    logger.error('[developer] settings read failed, falling back to defaults', {
      userId,
      error: error instanceof Error ? error.message : String(error)
    });
    return { ...SETTINGS_DEFAULTS };
  }
}

function rowToSettings(row: IDeveloperSettings): AutomationSettings {
  return {
    detectOpportunities: row.detectOpportunities,
    generateDrafts: row.generateDrafts,
    autoPublish: row.autoPublish,
    autoContent: row.autoContent,
    aiInstructions: row.aiInstructions ?? null,
    aiLength: row.aiLength ?? null,
    aiTechnicalDepth: row.aiTechnicalDepth ?? null,
    schedPeriod: row.schedPeriod,
    schedMinPosts: row.schedMinPosts,
    schedMaxPosts: row.schedMaxPosts,
    maxPostsPerWeek: row.maxPostsPerWeek ?? null,
    defaultTone: row.defaultTone,
    timezone: row.timezone
  };
}

export default SettingsService;

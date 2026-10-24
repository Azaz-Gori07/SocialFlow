import AIErrorEventModel, { IAIErrorEvent, AIErrorType } from './aiErrorEvent.model';
import { logger } from '../../../shared/utils/logger';

export class ErrorTrackerService {
  async recordError(opts: {
    userId: string;
    repositoryId?: string;
    opportunityId?: string;
    variant?: string;
    errorType: AIErrorType;
    message: string;
    promptSummary?: string;
    avoidanceHint?: string;
  }): Promise<IAIErrorEvent | null> {
    try {
      const hint = opts.avoidanceHint ?? this.deriveAvoidanceHint(opts.errorType, opts.message);
      return await AIErrorEventModel.create({
        ...opts,
        avoidanceHint: hint
      });
    } catch (err) {
      logger.error('[errorTracker] failed to persist error event', {
        userId: opts.userId,
        error: err instanceof Error ? err.message : String(err)
      });
      return null;
    }
  }

  async getAvoidanceHints(userId: string, repositoryId?: string, limit = 5): Promise<string[]> {
    try {
      const query: Record<string, unknown> = { userId, avoidanceHint: { $exists: true, $ne: null } };
      if (repositoryId) {
        query.$or = [{ repositoryId }, { repositoryId: null }];
      }
      const events = await AIErrorEventModel.find(query)
        .sort({ createdAt: -1 })
        .limit(limit * 2)
        .select('avoidanceHint')
        .lean()
        .exec();

      const hints = events
        .map((e) => e.avoidanceHint)
        .filter((h): h is string => Boolean(h && h.trim()));

      return [...new Set(hints)].slice(0, limit);
    } catch (err) {
      logger.error('[errorTracker] failed to retrieve hints', {
        userId,
        error: err instanceof Error ? err.message : String(err)
      });
      return [];
    }
  }

  async getRecentErrors(userId: string, limit = 20): Promise<IAIErrorEvent[]> {
    return AIErrorEventModel.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  private deriveAvoidanceHint(errorType: AIErrorType, message: string): string | undefined {
    if (errorType === 'fact_check_failure') {
      if (message.includes('Percentage claim')) return 'Avoid citing unverified percentages or metric gains.';
      if (message.includes('performance')) return 'Do not claim performance benchmarks unless measured directly.';
      if (message.includes('scale')) return 'Do not inflate file or diff counts beyond proven numbers.';
      if (message.includes('user')) return 'Avoid user or customer count statistics.';
    }
    if (errorType === 'validation_failure') {
      if (message.includes('too short')) return 'Ensure sufficient context and complete sentences.';
      if (message.includes('Reasoning leak')) return 'Do not output internal thinking or tool calls.';
      if (message.includes('Generic hashtag')) return 'Use only domain and project specific tags.';
    }
    return undefined;
  }
}

export const errorTrackerService = new ErrorTrackerService();

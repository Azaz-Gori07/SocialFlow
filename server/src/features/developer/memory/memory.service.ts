import { AppError } from '../../../shared/errors/appError';
import { MemoryRepository, MemoryPatch, MemoryUpsertInput } from './memory.repository';
import { IDeveloperMemory, DeveloperMemoryCategory } from './memory.model';
import { ActivityRepository } from '../activities/activity.repository';
import { RepositoryService } from '../repositories/repository.service';

export interface MemoryUpsertResult {
  id: string;
  created: boolean;
  updated: boolean;
}

export interface MemoryListResult {
  items: IDeveloperMemory[];
  grouped: Record<string, IDeveloperMemory[]>;
  total: number;
  limit: number;
  offset: number;
}

export interface ProjectJourney {
  milestones: Array<{ title: string; detectedAt: Date; significance: string }>;
  journey: string[];
  memoryCount: number;
  categories: string[];
}

/**
 * Transforms detected development activities into persistent, evidence-backed
 * repository memory. NEVER invents facts: every entry is derived only from
 * activity evidence.
 */
export class MemoryService {
  constructor(
    private memoryRepository: MemoryRepository,
    private activityRepository: ActivityRepository,
    private repositoryService: RepositoryService
  ) {}

  /**
   * Upsert a memory entry by (repositoryId, key), recording history on change.
   * Updates in place rather than duplicating — keys are unique per repository,
   * so repeated activity detection refreshes rather than duplicates.
   */
  async upsertMemory(
    userId: string,
    repositoryId: string,
    input: MemoryUpsertInput
  ): Promise<MemoryUpsertResult> {
    await this.repositoryService.getById(userId, repositoryId);
    const existing = await this.memoryRepository.findByKey(repositoryId, input.key);

    if (existing) {
      const changed = existing.value !== input.value;
      await this.memoryRepository.update(repositoryId, input.key, {
        category: input.category,
        value: input.value,
        items: input.items ?? existing.items ?? [],
        source: input.source ?? existing.source,
        sourceActivityId: input.sourceActivityId ?? existing.sourceActivityId,
        // Shallow merge: a narrower re-derivation must not erase older provenance.
        evidence: input.evidence
          ? { ...((existing.evidence as Record<string, unknown>) ?? {}), ...input.evidence }
          : (existing.evidence as Record<string, unknown>) ?? {},
        confidence: input.confidence ?? existing.confidence,
        status: 'active'
      });
      if (changed) {
        await this.memoryRepository.pushHistory({
          userId,
          memoryId: existing._id.toString(),
          action: 'updated',
          previousValue: existing.value,
          newValue: input.value,
          source: input.source
        });
      }
      return { id: existing._id.toString(), created: false, updated: changed };
    }

    const created = await this.memoryRepository.create(userId, repositoryId, input);
    await this.memoryRepository.pushHistory({
      userId,
      memoryId: created._id.toString(),
      action: 'created',
      newValue: input.value,
      source: input.source
    });
    return { id: created._id.toString(), created: true, updated: false };
  }

  /**
   * Auto-update memory from newly detected development activities.
   * Feature/milestone work above LOW importance becomes a feature/milestone
   * entry; bug fixes always become solved problems; every other category of
   * work is legitimate history when it is not trivial.
   */
  async updateMemoryFromActivities(
    userId: string,
    repositoryId: string,
    activityIds: string[]
  ): Promise<{ written: number }> {
    if (activityIds.length === 0) return { written: 0 };
    await this.repositoryService.getById(userId, repositoryId);
    const activities = await this.activityRepository.findByIds(userId, activityIds);

    let written = 0;
    for (const activity of activities) {
      const evidence = (activity.evidence as Record<string, unknown>) ?? {};
      const isMilestone = activity.isMilestone;
      const category = deriveCategory(activity.type);
      const isNotTrivial = activity.importance !== 'TRIVIAL' && activity.importance !== 'LOW';

      // Feature/milestone work (skip trivial — memory should hold real history)
      if ((category === 'feature' || isMilestone) && isNotTrivial) {
        const key = slugify(`${activity.type}-${activity.title}`);
        const res = await this.upsertMemory(userId, repositoryId, {
          category: isMilestone ? 'milestone' : 'feature',
          key,
          value: isMilestone
            ? `${activity.title} (${activity.importance.toLowerCase()})`
            : activity.title,
          items: (activity.changes ?? []).slice(0, 10),
          source: 'auto',
          sourceActivityId: activity._id.toString(),
          evidence: { ...evidence, activityTitle: activity.title, detectedAt: activity.detectedAt },
          confidence: activity.confidence ?? 0
        });
        if (res.created) written++;
      }

      // Bug fixes → problems solved (always, regardless of importance)
      if (activity.type === 'BUG_FIX') {
        const res = await this.upsertMemory(userId, repositoryId, {
          category: 'problem_solved',
          key: `fixed-${slugify(activity.title)}`,
          value: activity.title,
          items: (activity.changes ?? []).slice(0, 8),
          source: 'auto',
          sourceActivityId: activity._id.toString(),
          evidence: { ...evidence, activityTitle: activity.title },
          confidence: activity.confidence ?? 0
        });
        if (res.created) written++;
      }

      // Every other category of work (TEST, API, DATABASE, REFACTOR, PERFORMANCE,
      // SECURITY, UI, ...) is legitimate project history when it is not trivial.
      if (activity.type !== 'FEATURE' && activity.type !== 'BUG_FIX' && isNotTrivial) {
        const res = await this.upsertMemory(userId, repositoryId, {
          category,
          key: slugify(`${activity.type}-${activity.title}`),
          value: activity.title,
          items: (activity.changes ?? []).slice(0, 8),
          source: 'auto',
          sourceActivityId: activity._id.toString(),
          evidence: { ...evidence, activityTitle: activity.title },
          confidence: activity.confidence ?? 0
        });
        if (res.created) written++;
      }
    }
    return { written };
  }

  /**
   * Active memory for a repository, grouped by category.
   *
   * `items` and `total` are the paginated truth (`total` counts the matching
   * rows, not the page); `grouped` mirrors the current page only, so the client
   * can render without a second request. Deliberately bounded — an unbounded
   * read here would pull a whole repository's memory on every page view.
   */
  async getMemory(userId: string, repositoryId: string, filter?: { category?: DeveloperMemoryCategory; limit?: number; offset?: number }): Promise<MemoryListResult> {
    await this.repositoryService.getById(userId, repositoryId);
    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;
    const [items, total] = await Promise.all([
      this.memoryRepository.list({ userId, repositoryId, category: filter?.category, limit, offset }),
      this.memoryRepository.countFiltered(userId, repositoryId, filter?.category)
    ]);
    return { items, grouped: groupByCategory(items), total, limit, offset };
  }

  /** Substring + category filter over active entries. */
  async searchMemory(
    userId: string,
    repositoryId: string,
    query: string | undefined,
    category?: DeveloperMemoryCategory
  ): Promise<IDeveloperMemory[]> {
    await this.repositoryService.getById(userId, repositoryId);
    let filtered = await this.memoryRepository.listActive(userId, repositoryId);
    if (category) filtered = filtered.filter((m) => m.category === category);
    const q = query?.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter((m) =>
        m.key.toLowerCase().includes(q) ||
        m.value.toLowerCase().includes(q) ||
        (m.items ?? []).some((i) => i.toLowerCase().includes(q))
      );
    }
    return filtered;
  }

  /** Archive a memory entry (soft-delete — history preserved). */
  async archiveMemory(userId: string, memoryId: string): Promise<boolean> {
    const memory = await this.memoryRepository.findOwned(userId, memoryId);
    if (!memory) throw AppError.notFound('Memory entry not found');
    if (memory.status === 'archived') return false;
    await this.memoryRepository.setStatus(memoryId, 'archived');
    await this.memoryRepository.pushHistory({
      userId,
      memoryId,
      action: 'archived',
      previousValue: memory.value,
      source: 'user'
    });
    return true;
  }

  /** Restore an archived memory entry. */
  async restoreMemory(userId: string, memoryId: string): Promise<boolean> {
    const memory = await this.memoryRepository.findOwned(userId, memoryId);
    if (!memory) throw AppError.notFound('Memory entry not found');
    if (memory.status === 'active') return false;
    await this.memoryRepository.setStatus(memoryId, 'active');
    await this.memoryRepository.pushHistory({
      userId,
      memoryId,
      action: 'restored',
      newValue: memory.value,
      source: 'user'
    });
    return true;
  }

  /** User manual edit — still recorded with source=user for audit. */
  async editMemory(userId: string, memoryId: string, patch: MemoryPatch): Promise<IDeveloperMemory> {
    const memory = await this.memoryRepository.findOwned(userId, memoryId);
    if (!memory) throw AppError.notFound('Memory entry not found');
    if (patch.value === undefined && patch.items === undefined && patch.category === undefined) {
      return memory;
    }

    const previousValue = memory.value;
    const update: Record<string, unknown> = { source: 'user' };
    if (patch.value !== undefined) update.value = patch.value;
    if (patch.items !== undefined) update.items = patch.items;
    if (patch.category !== undefined) update.category = patch.category;
    memory.set(update);
    await memory.save();

    await this.memoryRepository.pushHistory({
      userId,
      memoryId,
      action: 'updated',
      previousValue,
      source: 'user'
    });
    return memory;
  }

  /**
   * Chronological project journey from memory milestones + history.
   * "Auth → Driver tracking → Location → Payments".
   */
  async buildJourney(userId: string, repositoryId: string): Promise<ProjectJourney> {
    await this.repositoryService.getById(userId, repositoryId);
    const rows = await this.memoryRepository.listActive(userId, repositoryId);
    const milestones = rows
      .filter((m) => m.category === 'milestone')
      .map((m) => ({
        title: m.value,
        detectedAt: new Date(m.updatedAt),
        significance: String((m.evidence as { importance?: string })?.importance ?? '')
      }))
      .sort((a, b) => a.detectedAt.getTime() - b.detectedAt.getTime());
    return {
      milestones,
      journey: milestones.map((m) => m.title),
      memoryCount: rows.length,
      categories: Object.keys(groupByCategory(rows))
    };
  }
}

function groupByCategory(rows: IDeveloperMemory[]): Record<string, IDeveloperMemory[]> {
  const grouped: Record<string, IDeveloperMemory[]> = {};
  for (const r of rows) {
    (grouped[r.category] ??= []).push(r);
  }
  return grouped;
}

export function deriveCategory(type: string): DeveloperMemoryCategory {
  switch (type) {
    case 'FEATURE': return 'feature';
    case 'BUG_FIX': return 'problem_solved';
    case 'MILESTONE': return 'milestone';
    case 'REFACTOR':
    case 'ARCHITECTURE': return 'architecture';
    default: return 'history';
  }
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
}

export default MemoryService;

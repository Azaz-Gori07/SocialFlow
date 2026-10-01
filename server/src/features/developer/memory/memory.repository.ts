import DeveloperMemoryModel, { IDeveloperMemory, DeveloperMemoryCategory } from './memory.model';
import DeveloperMemoryHistoryModel, { IDeveloperMemoryHistory, DeveloperMemoryAction } from './memoryHistory.model';

type Query = Record<string, unknown>;

export interface MemoryListFilter {
  userId: string;
  repositoryId: string;
  category?: DeveloperMemoryCategory;
  status?: 'active' | 'archived';
  limit: number;
  offset: number;
}

export interface MemoryUpsertInput {
  category: DeveloperMemoryCategory;
  key: string;
  value: string;
  items?: string[];
  source?: string;
  sourceActivityId?: string;
  evidence?: Record<string, unknown>;
  confidence?: number;
}

export interface MemoryPatch {
  value?: string;
  items?: string[];
  category?: DeveloperMemoryCategory;
}

export interface PushHistoryInput {
  userId: string;
  memoryId: string;
  action: DeveloperMemoryAction;
  previousValue?: string;
  newValue?: string;
  source?: string;
}

export class MemoryRepository {
  async findByKey(repositoryId: string, key: string): Promise<IDeveloperMemory | null> {
    return DeveloperMemoryModel.findOne({ repositoryId, key } as Query).exec();
  }

  async findOwned(userId: string, memoryId: string): Promise<IDeveloperMemory | null> {
    return DeveloperMemoryModel.findOne({ _id: memoryId, userId } as Query).exec();
  }

  async list(filter: MemoryListFilter): Promise<IDeveloperMemory[]> {
    return DeveloperMemoryModel.find(this.listFilter(filter) as Query)
      .sort({ updatedAt: -1 })
      .skip(filter.offset)
      .limit(filter.limit)
      .exec();
  }

  private listFilter(filter: MemoryListFilter): Query {
    return {
      userId: filter.userId,
      repositoryId: filter.repositoryId,
      status: filter.status ?? 'active',
      ...(filter.category ? { category: filter.category } : {})
    };
  }

  /** Matching-row count for a `list` filter — the total for a paginated read. */
  async countFiltered(userId: string, repositoryId: string, category?: DeveloperMemoryCategory): Promise<number> {
    return DeveloperMemoryModel.countDocuments(this.listFilter({
      userId,
      repositoryId,
      category,
      limit: 0,
      offset: 0
    }) as Query).exec();
  }

  /**
   * All active entries for a repository. Bounded by `limit` because callers
   * (memory context for generation, journey building) only need recent history —
   * an unbounded read would grow with the repository.
   */
  async listActive(userId: string, repositoryId: string, limit = 200): Promise<IDeveloperMemory[]> {
    return DeveloperMemoryModel.find({ userId, repositoryId, status: 'active' } as Query)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .exec();
  }

  async countActive(userId: string, repositoryId?: string): Promise<number> {
    return DeveloperMemoryModel.countDocuments({
      userId,
      status: 'active',
      ...(repositoryId ? { repositoryId } : {})
    } as Query).exec();
  }

  async countByUser(userId: string): Promise<number> {
    return DeveloperMemoryModel.countDocuments({ userId } as Query).exec();
  }

  async create(userId: string, repositoryId: string, input: MemoryUpsertInput): Promise<IDeveloperMemory> {
    return DeveloperMemoryModel.create({
      userId,
      repositoryId,
      category: input.category,
      key: input.key,
      value: input.value,
      items: input.items ?? [],
      source: input.source ?? 'auto',
      sourceActivityId: input.sourceActivityId,
      evidence: input.evidence ?? {},
      confidence: input.confidence ?? 0,
      status: 'active'
    });
  }

  /**
   * In-place update. Keys are unique per repository, so re-deriving memory from
   * repeated activity detection refreshes an entry rather than duplicating it.
   * Evidence is shallow-merged: older provenance must not be dropped.
   */
  async update(
    repositoryId: string,
    key: string,
    patch: {
      category: DeveloperMemoryCategory;
      value: string;
      items: string[];
      source?: string;
      sourceActivityId?: string;
      evidence: Record<string, any>;
      confidence?: number;
      status: 'active';
    }
  ): Promise<void> {
    await DeveloperMemoryModel.updateOne({ repositoryId, key } as Query, { $set: patch }).exec();
  }

  async setStatus(memoryId: string, status: 'active' | 'archived'): Promise<void> {
    await DeveloperMemoryModel.updateOne({ _id: memoryId } as Query, { $set: { status } }).exec();
  }

  /** Append-only audit row for a memory change. */
  async pushHistory(input: PushHistoryInput): Promise<IDeveloperMemoryHistory> {
    return DeveloperMemoryHistoryModel.create({
      userId: input.userId,
      memoryId: input.memoryId,
      action: input.action,
      previousValue: input.previousValue,
      newValue: input.newValue,
      source: input.source ?? 'auto'
    });
  }

  async listHistory(memoryId: string, limit: number): Promise<IDeveloperMemoryHistory[]> {
    return DeveloperMemoryHistoryModel.find({ memoryId } as Query)
      .sort({ createdAt: 1 })
      .limit(limit)
      .exec();
  }
}

export default MemoryRepository;

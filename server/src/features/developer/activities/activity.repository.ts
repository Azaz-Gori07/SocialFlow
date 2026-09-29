import DeveloperActivityModel, { IDeveloperActivity, DeveloperImportance } from './activity.model';

type Query = Record<string, unknown>;

/** Mongoose duplicate-key error — backstop behind the read-before-write evidence check. */
export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

export interface ActivityListFilter {
  userId: string;
  repositoryId?: string;
  importance?: string;
  limit: number;
  offset: number;
}

export interface CreateActivityInput {
  userId: string;
  repositoryId: string;
  title: string;
  type: string;
  importance: DeveloperImportance;
  importanceScore: number;
  problem?: string;
  summary?: string;
  changes: string[];
  affectedAreas: string[];
  isMilestone: boolean;
  milestoneTitle?: string;
  linkedInWorthy: boolean;
  evidence: Record<string, any>;
  evidenceKey: string;
  confidence: number;
  detectedAt: Date;
  commitIds: string[];
  prIds: string[];
  issueIds: string[];
}

export class ActivityRepository {
  /**
   * Evidence-key lookup backing pipeline idempotency. `evidenceKey` is always
   * set on pipeline writes; the (repositoryId, evidenceKey) unique index is the
   * race-safe backstop behind this read.
   */
  async findByEvidenceKey(repositoryId: string, evidenceKey: string): Promise<IDeveloperActivity | null> {
    return DeveloperActivityModel.findOne({ repositoryId, evidenceKey } as Query).exec();
  }

  async listByUser(filter: ActivityListFilter): Promise<IDeveloperActivity[]> {
    const { userId, repositoryId, importance, limit, offset } = filter;
    return DeveloperActivityModel.find({
      userId,
      ...(repositoryId ? { repositoryId } : {}),
      ...(importance ? { importance } : {})
    } as Query)
      .sort({ detectedAt: -1 })
      .skip(offset)
      .limit(limit)
      .exec();
  }

  async countByUser(userId: string, repositoryId?: string): Promise<number> {
    return DeveloperActivityModel.countDocuments({
      userId,
      ...(repositoryId ? { repositoryId } : {})
    } as Query).exec();
  }

  async findOwned(userId: string, activityId: string): Promise<IDeveloperActivity | null> {
    return DeveloperActivityModel.findOne({ _id: activityId, userId } as Query).exec();
  }

  async findByIds(userId: string, activityIds: string[]): Promise<IDeveloperActivity[]> {
    if (activityIds.length === 0) return [];
    return DeveloperActivityModel.find({ userId, _id: { $in: activityIds } } as Query).exec();
  }

  /** All activities for a repository — the source set for opportunity detection. */
  async listByRepository(userId: string, repositoryId: string): Promise<IDeveloperActivity[]> {
    return DeveloperActivityModel.find({ userId, repositoryId } as Query).sort({ detectedAt: -1 }).exec();
  }

  /**
   * Insert one activity. A duplicate-key error means a concurrent run won the
   * race on the same evidence, so the existing row is returned instead of
   * failing the whole pipeline.
   */
  async create(input: CreateActivityInput): Promise<{ activity: IDeveloperActivity; created: boolean }> {
    try {
      const activity = await DeveloperActivityModel.create({ ...input, status: 'detected' });
      return { activity, created: true };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const existing = await DeveloperActivityModel.findOne({
        repositoryId: input.repositoryId,
        evidenceKey: input.evidenceKey
      } as Query).exec();
      if (!existing) throw error;
      return { activity: existing, created: false };
    }
  }
}

export default ActivityRepository;

import DeveloperOpportunityModel, {
  IDeveloperOpportunity,
  DeveloperOpportunityStatus
} from './opportunity.model';
import { isDuplicateKeyError } from '../activities/activity.repository';

type Query = Record<string, unknown>;

export interface OpportunityListFilter {
  userId: string;
  repositoryId?: string;
  status?: DeveloperOpportunityStatus;
  limit: number;
  offset: number;
}

export interface CreateOpportunityInput {
  userId: string;
  repositoryId: string;
  activityId: string;
  title: string;
  summary?: string;
  sourceType: string;
  sourceId: string;
  status: DeveloperOpportunityStatus;
  metadata: Record<string, any>;
}

export class OpportunityRepository {
  /** One opportunity per source activity — the unique index enforces it too. */
  async findBySource(repositoryId: string, sourceId: string): Promise<IDeveloperOpportunity | null> {
    return DeveloperOpportunityModel.findOne({ repositoryId, sourceId } as Query).exec();
  }

  async findOwned(userId: string, opportunityId: string): Promise<IDeveloperOpportunity | null> {
    return DeveloperOpportunityModel.findOne({ _id: opportunityId, userId } as Query).exec();
  }

  async list(filter: OpportunityListFilter): Promise<IDeveloperOpportunity[]> {
    return DeveloperOpportunityModel.find({
      userId: filter.userId,
      ...(filter.repositoryId ? { repositoryId: filter.repositoryId } : {}),
      ...(filter.status ? { status: filter.status } : {})
    } as Query)
      .sort({ createdAt: -1 })
      .skip(filter.offset)
      .limit(filter.limit)
      .exec();
  }

  async count(filter: Omit<OpportunityListFilter, 'limit' | 'offset'>): Promise<number> {
    return DeveloperOpportunityModel.countDocuments({
      userId: filter.userId,
      ...(filter.repositoryId ? { repositoryId: filter.repositoryId } : {}),
      ...(filter.status ? { status: filter.status } : {})
    } as Query).exec();
  }

  async create(input: CreateOpportunityInput): Promise<{ opportunity: IDeveloperOpportunity; created: boolean }> {
    try {
      const opportunity = await DeveloperOpportunityModel.create(input);
      return { opportunity, created: true };
    } catch (error) {
      // A concurrent detection run already queued this activity.
      if (!isDuplicateKeyError(error)) throw error;
      const existing = await DeveloperOpportunityModel.findOne({
        repositoryId: input.repositoryId,
        sourceId: input.sourceId
      } as Query).exec();
      if (!existing) throw error;
      return { opportunity: existing, created: false };
    }
  }

  async updateStatus(opportunityId: string, status: DeveloperOpportunityStatus): Promise<void> {
    await DeveloperOpportunityModel.updateOne({ _id: opportunityId } as Query, { $set: { status } }).exec();
  }
}

export default OpportunityRepository;

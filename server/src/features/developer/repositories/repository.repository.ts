import { IDeveloperRepository, DeveloperSyncStatus } from './repository.model';
import DeveloperRepositoryModel from './repository.model';
import DeveloperCommitModel from '../commits/commit.model';
import DeveloperCommitFileModel from '../commits/commitFile.model';
import DeveloperPullRequestModel from '../pullRequests/pullRequest.model';
import DeveloperIssueModel from '../issues/issue.model';
import DeveloperReleaseModel from '../releases/release.model';
import DeveloperSyncLogModel from '../sync/syncLog.model';

type Query = Record<string, unknown>;

export interface UpsertRepositoryInput {
  githubId: string;
  fullName: string;
  name?: string;
  description?: string;
  defaultBranch?: string;
  isPrivate?: boolean;
  ownerAvatarUrl?: string;
  language?: string;
  starsCount?: string;
  forksCount?: string;
  openIssuesCount?: string;
  metadata?: Record<string, any>;
}

export class RepositoryRepository {
  async listByUser(userId: string): Promise<IDeveloperRepository[]> {
    return DeveloperRepositoryModel.find({ userId } as Query).sort({ updatedAt: -1 }).exec();
  }

  async findById(repositoryId: string): Promise<IDeveloperRepository | null> {
    return DeveloperRepositoryModel.findById(repositoryId).exec();
  }

  async findManyByFullName(fullName: string): Promise<IDeveloperRepository[]> {
    return DeveloperRepositoryModel.find({ fullName } as Query).exec();
  }

  async findByGithubIds(userId: string, githubIds: string[]): Promise<IDeveloperRepository[]> {
    if (githubIds.length === 0) return [];
    return DeveloperRepositoryModel.find({ userId, githubId: { $in: githubIds } } as Query).exec();
  }

  /**
   * Insert or refresh the mirror row for a GitHub repository. `lastSyncedAt` is
   * intentionally left alone: mirroring lists what the user could sync, it does
   * not mean data has been imported.
   */
  async upsertByGithubId(userId: string, input: UpsertRepositoryInput): Promise<IDeveloperRepository> {
    const existing = await DeveloperRepositoryModel.findOne({
      userId,
      githubId: input.githubId
    } as Query).exec();
    const fields = {
      fullName: input.fullName,
      name: input.name,
      description: input.description,
      defaultBranch: input.defaultBranch,
      isPrivate: input.isPrivate,
      ownerAvatarUrl: input.ownerAvatarUrl,
      language: input.language,
      starsCount: input.starsCount,
      forksCount: input.forksCount,
      openIssuesCount: input.openIssuesCount,
      metadata: input.metadata
    };
    if (existing) {
      existing.set(fields);
      return existing.save();
    }
    return DeveloperRepositoryModel.create({ userId, githubId: input.githubId, aiMonitoring: true, ...fields });
  }

  async setSyncStatus(repositoryId: string, syncStatus: DeveloperSyncStatus): Promise<void> {
    await DeveloperRepositoryModel.updateOne({ _id: repositoryId } as Query, { $set: { syncStatus } }).exec();
  }

  async setMonitoring(repositoryId: string, aiMonitoring: boolean): Promise<void> {
    await DeveloperRepositoryModel.updateOne({ _id: repositoryId } as Query, { $set: { aiMonitoring } }).exec();
  }

  async updateSyncCursors(
    repositoryId: string,
    cursors: { lastSyncedAt?: Date; lastCommitSyncedAt?: Date; lastPrSyncedAt?: Date }
  ): Promise<void> {
    await DeveloperRepositoryModel.updateOne({ _id: repositoryId } as Query, { $set: cursors }).exec();
  }

  async updateMetadata(repositoryId: string, metadata: Record<string, any>): Promise<void> {
    await DeveloperRepositoryModel.updateOne({ _id: repositoryId } as Query, { $set: { metadata } }).exec();
  }

  /**
   * Delete the mirror row and the raw sync data it owns.
   *
   * Deliberately leaves activities, memory, and opportunities alone: those are
   * user-facing intelligence derived from the code, and a re-added repository
   * should not silently erase what the user already saw. Re-syncing an
   * existing repository never reaches this path.
   */
  async remove(repositoryId: string): Promise<void> {
    await Promise.all([
      DeveloperCommitFileModel.deleteMany({ repositoryId } as Query).exec(),
      DeveloperCommitModel.deleteMany({ repositoryId } as Query).exec(),
      DeveloperPullRequestModel.deleteMany({ repositoryId } as Query).exec(),
      DeveloperIssueModel.deleteMany({ repositoryId } as Query).exec(),
      DeveloperReleaseModel.deleteMany({ repositoryId } as Query).exec(),
      DeveloperSyncLogModel.deleteMany({ repositoryId } as Query).exec(),
      DeveloperRepositoryModel.deleteOne({ _id: repositoryId } as Query).exec()
    ]);
  }
}

export default RepositoryRepository;

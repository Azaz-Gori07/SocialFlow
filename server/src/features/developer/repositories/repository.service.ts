import { AppError } from '../../../shared/errors/appError';
import { IDeveloperRepository } from './repository.model';
import { RepositoryRepository } from './repository.repository';
import { ConnectionService } from '../connections/connection.service';
import { GitHubRepository, getRepositories } from '../github/github.client';

export interface AvailableRepository extends GitHubRepository {
  /** True when this repository is already mirrored for the user. */
  connected: boolean;
}

export class RepositoryService {
  constructor(
    private repositoryRepository: RepositoryRepository,
    private connectionService: ConnectionService
  ) {}

  async list(userId: string): Promise<IDeveloperRepository[]> {
    return this.repositoryRepository.listByUser(userId);
  }

  /**
   * Every repository the connected GitHub account can see, flagged with which
   * ones are already mirrored. Requires a connection.
   */
  async listFromGitHub(userId: string): Promise<AvailableRepository[]> {
    const token = await this.connectionService.getAccessToken(userId);
    const { data } = await getRepositories({ token });
    if (!Array.isArray(data)) return [];
    const mirrored = await this.repositoryRepository.findByGithubIds(
      userId,
      data.map((repo) => String(repo.id))
    );
    const mirroredIds = new Set(mirrored.map((repo) => repo.githubId));
    return data.map((repo) => ({ ...repo, connected: mirroredIds.has(String(repo.id)) }));
  }

  /**
   * Mirror the user's GitHub repositories into local rows so they can be synced.
   * `lastSyncedAt` stays null until a sync actually imports data.
   */
  async mirrorFromGitHub(userId: string): Promise<{ mirrored: number; total: number }> {
    const token = await this.connectionService.getAccessToken(userId);
    const { data } = await getRepositories({ token });
    if (!Array.isArray(data)) return { mirrored: 0, total: 0 };
    for (const repo of data) {
      await this.repositoryRepository.upsertByGithubId(userId, {
        githubId: String(repo.id),
        fullName: repo.full_name,
        name: repo.name,
        description: repo.description ?? undefined,
        defaultBranch: repo.default_branch ?? 'main',
        isPrivate: repo.private,
        ownerAvatarUrl: repo.owner?.avatar_url,
        language: repo.language ?? undefined,
        starsCount: String(repo.stargazers_count ?? 0),
        forksCount: String(repo.forks_count ?? 0),
        openIssuesCount: String(repo.open_issues_count ?? 0),
        metadata: { owner_login: repo.owner?.login }
      });
    }
    return { mirrored: data.length, total: data.length };
  }

  async getById(userId: string, repositoryId: string): Promise<IDeveloperRepository> {
    const repo = await this.repositoryRepository.findById(repositoryId);
    if (!repo) throw AppError.notFound('Repository not found');
    if (repo.userId !== userId) throw AppError.forbidden('Insufficient permissions');
    return repo;
  }

  async setMonitoring(userId: string, repositoryId: string, enabled: boolean): Promise<IDeveloperRepository> {
    const repo = await this.getById(userId, repositoryId);
    await this.repositoryRepository.setMonitoring(repo._id.toString(), enabled);
    repo.set({ aiMonitoring: enabled });
    return repo;
  }

  async remove(userId: string, repositoryId: string): Promise<{ removed: boolean }> {
    const repo = await this.getById(userId, repositoryId);
    await this.repositoryRepository.remove(repo._id.toString());
    return { removed: true };
  }
}

export default RepositoryService;

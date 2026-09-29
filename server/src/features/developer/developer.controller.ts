import { Response, NextFunction } from 'express';
import { DeveloperService } from './developer.service';
import { syncAndProcess } from './jobs/syncOrchestrator';
import { ApiResponse } from '../../shared/utils/response.util';
import { AuthenticatedRequest } from '../../shared/middleware/rbac.middleware';
import { AppError } from '../../shared/errors/appError';
import { DeveloperMemoryCategory } from './memory/memory.model';
import { DeveloperOpportunityStatus } from './opportunities/opportunity.model';

export class DeveloperController {
  constructor(private developerService: DeveloperService) {}

  /** Public: the client calls this to decide whether to show the nav entry. */
  getStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { enabled } = this.developerService.getStatus();
      return ApiResponse.success(res, { enabled }, 'Developer feature status');
    } catch (error) { next(error); }
  };

  overview = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const overview = await this.developerService.getOverview(req.user.id);
      return ApiResponse.success(res, overview, 'Developer overview retrieved');
    } catch (error) { next(error); }
  };

  /* ------------------------------- GitHub OAuth ------------------------------ */

  githubAuthUrl = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const url = this.developerService.connectionService.getAuthUrl(req.user.id);
      return ApiResponse.success(res, { url }, 'GitHub authorization URL generated');
    } catch (error) { next(error); }
  };

  githubCallback = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { code, state } = req.body;
      const connection = await this.developerService.connectionService.connect(req.user.id, code, state);
      return ApiResponse.success(res, connection, 'GitHub account connected');
    } catch (error) { next(error); }
  };

  githubConnection = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const status = await this.developerService.connectionService.getConnectedStatus(req.user.id);
      return ApiResponse.success(res, status, 'GitHub connection status retrieved');
    } catch (error) { next(error); }
  };

  githubDisconnect = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const result = await this.developerService.connectionService.disconnect(req.user.id);
      return ApiResponse.success(res, result, 'GitHub account disconnected');
    } catch (error) { next(error); }
  };

  /* ------------------------------- Repositories ----------------------------- */

  listRepositories = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const items = await this.developerService.repositoryService.list(req.user.id);
      return ApiResponse.success(res, { items, total: items.length }, 'Repositories retrieved');
    } catch (error) { next(error); }
  };

  listAvailableRepositories = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const items = await this.developerService.repositoryService.listFromGitHub(req.user.id);
      return ApiResponse.success(res, { items, total: items.length }, 'GitHub repositories retrieved');
    } catch (error) { next(error); }
  };

  syncRepositories = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const result = await this.developerService.repositoryService.mirrorFromGitHub(req.user.id);
      return ApiResponse.success(res, result, 'Repositories mirrored from GitHub');
    } catch (error) { next(error); }
  };

  getRepository = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const repository = await this.developerService.repositoryService.getById(req.user.id, req.params.id);
      return ApiResponse.success(res, repository, 'Repository retrieved');
    } catch (error) { next(error); }
  };

  setRepositoryMonitoring = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const repository = await this.developerService.repositoryService.setMonitoring(
        req.user.id,
        req.params.id,
        req.body.enabled
      );
      return ApiResponse.success(res, repository, 'Repository monitoring updated');
    } catch (error) { next(error); }
  };

  deleteRepository = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const result = await this.developerService.repositoryService.remove(req.user.id, req.params.id);
      return ApiResponse.success(res, result, 'Repository removed');
    } catch (error) { next(error); }
  };

  /* ----------------------------------- Sync --------------------------------- */

  runRepositorySync = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      // Full chain (sync → intelligence → memory → opportunities → drafts), not
      // just the sync, so a manual run matches what the worker/webhook do.
      const result = await syncAndProcess(req.user.id, req.params.id, 'manual', 'manual');
      return ApiResponse.success(res, {
        isInitialSync: result.isInitialSync,
        counts: result.counts,
        pipeline: result.pipeline,
        generation: result.generation,
        errors: result.errors
      }, 'Repository sync completed');
    } catch (error) { next(error); }
  };

  listSyncLogs = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { repositoryId, limit } = req.query as unknown as { repositoryId: string; limit: number };
      const items = await this.developerService.syncService.listSyncLogs(req.user.id, repositoryId, limit);
      return ApiResponse.success(res, { items, total: items.length }, 'Sync logs retrieved');
    } catch (error) { next(error); }
  };

  /* ------------------------------- Intelligence ------------------------------ */

  runPipeline = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      // No client-controlled baseline: the pipeline always runs as a normal
      // pass, so its opportunities are generated, never silently 'baseline'.
      const result = await this.developerService.pipelineService.runPipelineForRepository(
        req.user.id,
        req.params.id
      );
      return ApiResponse.success(res, {
        newActivities: result.newActivityIds.length,
        totalActivities: result.activities.length,
        memoryWritten: result.memoryWritten,
        newOpportunities: result.newOpportunities,
        baseline: result.baseline
      }, 'Intelligence pipeline completed');
    } catch (error) { next(error); }
  };

  /* -------------------------------- Activities ------------------------------- */

  listActivities = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { repositoryId, importance, limit, offset } = req.query as unknown as {
        repositoryId?: string;
        importance?: string;
        limit: number;
        offset: number;
      };
      const result = await this.developerService.activityService.list(req.user.id, {
        repositoryId,
        importance,
        limit,
        offset
      });
      return ApiResponse.success(res, result, 'Activities retrieved');
    } catch (error) { next(error); }
  };

  getActivity = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const activity = await this.developerService.activityService.getById(req.user.id, req.params.id);
      return ApiResponse.success(res, activity, 'Activity retrieved');
    } catch (error) { next(error); }
  };

  /* ---------------------------------- Memory --------------------------------- */

  listMemory = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { repositoryId, category, search, limit, offset } = req.query as unknown as {
        repositoryId: string;
        category?: DeveloperMemoryCategory;
        search?: string;
        limit: number;
        offset: number;
      };
      if (search) {
        const items = await this.developerService.memoryService.searchMemory(
          req.user.id,
          repositoryId,
          search,
          category
        );
        return ApiResponse.success(res, { items, total: items.length }, 'Memory search completed');
      }
      const result = await this.developerService.memoryService.getMemory(req.user.id, repositoryId, {
        category,
        limit,
        offset
      });
      return ApiResponse.success(res, result, 'Memory retrieved');
    } catch (error) { next(error); }
  };

  editMemory = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { value, items, category } = req.body ?? {};
      const memory = await this.developerService.memoryService.editMemory(req.user.id, req.params.id, {
        value,
        items,
        category
      });
      return ApiResponse.success(res, memory, 'Memory entry updated');
    } catch (error) { next(error); }
  };

  archiveMemory = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const archived = await this.developerService.memoryService.archiveMemory(req.user.id, req.params.id);
      return ApiResponse.success(res, { archived }, 'Memory entry archived');
    } catch (error) { next(error); }
  };

  restoreMemory = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const restored = await this.developerService.memoryService.restoreMemory(req.user.id, req.params.id);
      return ApiResponse.success(res, { restored }, 'Memory entry restored');
    } catch (error) { next(error); }
  };

  /* ------------------------------- Opportunities ------------------------------ */

  listOpportunities = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { repositoryId, status, limit, offset } = req.query as unknown as {
        repositoryId?: string;
        status?: DeveloperOpportunityStatus;
        limit: number;
        offset: number;
      };
      const result = await this.developerService.opportunityService.list(req.user.id, {
        repositoryId,
        status,
        limit,
        offset
      });
      return ApiResponse.success(res, result, 'Opportunities retrieved');
    } catch (error) { next(error); }
  };

  setOpportunityStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { status } = req.body ?? {};
      const opportunity = await this.developerService.opportunityService.updateStatus(
        req.user.id,
        req.params.id,
        status
      );
      return ApiResponse.success(res, opportunity, 'Opportunity status updated');
    } catch (error) { next(error); }
  };

  /* -------------------------- Content generation ---------------------------- */

  generateContent = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { preferredTone, customInstructions } = req.body ?? {};
      const result = await this.developerService.contentService.generateForOpportunity(
        req.user.id,
        req.params.id,
        { preferredTone, customInstructions }
      );
      return ApiResponse.success(
        res,
        {
          drafts: result.drafts,
          factCheck: result.factCheck,
          validation: result.validation,
          failedVariants: result.failedVariants
        },
        'Content drafts generated',
        201
      );
    } catch (error) { next(error); }
  };

  runContentAutoGeneration = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const result = await this.developerService.contentService.runAutoGeneration(req.user.id);
      return ApiResponse.success(res, result, 'Content auto-run completed');
    } catch (error) { next(error); }
  };

  /* -------------------------------- Settings -------------------------------- */

  getAutomationSettings = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const settings = await this.developerService.settingsService.getSettings(req.user.id);
      return ApiResponse.success(res, settings, 'Automation settings retrieved');
    } catch (error) { next(error); }
  };

  updateAutomationSettings = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const settings = await this.developerService.settingsService.updateSettings(
        req.user.id,
        req.body ?? {}
      );
      return ApiResponse.success(res, settings, 'Automation settings updated');
    } catch (error) { next(error); }
  };
}

export default DeveloperController;

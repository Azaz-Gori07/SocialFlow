import { Router, Request, Response, NextFunction } from 'express';
import { DeveloperController } from './developer.controller';
import { DeveloperService } from './developer.service';
import { ConnectionRepository } from './connections/connection.repository';
import { ConnectionService } from './connections/connection.service';
import { RepositoryRepository } from './repositories/repository.repository';
import { RepositoryService } from './repositories/repository.service';
import { SyncService } from './sync/sync.service';
import { ActivityRepository } from './activities/activity.repository';
import { ActivityService } from './activities/activity.service';
import { MemoryRepository } from './memory/memory.repository';
import { MemoryService } from './memory/memory.service';
import { OpportunityRepository } from './opportunities/opportunity.repository';
import { OpportunityService } from './opportunities/opportunity.service';
import { PipelineService } from './intelligence/pipeline.service';
import { SettingsRepository } from './settings/settings.repository';
import { SettingsService } from './settings/settings.service';
import { ContentService } from './content/content.service';
import { validate } from '../../shared/middleware/validate.middleware';
import { authenticate } from '../../shared/middleware/rbac.middleware';
import { env } from '../../shared/config/env.config';
import { AppError } from '../../shared/errors/appError';
import {
  activityQuerySchema,
  contentGenerateSchema,
  githubCallbackSchema,
  memoryEditSchema,
  memoryQuerySchema,
  monitoringSchema,
  mongoIdSchema,
  opportunityQuerySchema,
  opportunityStatusSchema,
  pipelineSchema,
  repositoryIdSchema,
  settingsPatchSchema,
  syncLogQuerySchema
} from './developer.validation';

const router = Router();

// Instantiate dependency graph
const connectionRepository = new ConnectionRepository();
const connectionService = new ConnectionService(connectionRepository);
const repositoryRepository = new RepositoryRepository();
const repositoryService = new RepositoryService(repositoryRepository, connectionService);
const syncService = new SyncService(repositoryService, connectionService);
const activityRepository = new ActivityRepository();
const activityService = new ActivityService(activityRepository, repositoryService);
const memoryRepository = new MemoryRepository();
const memoryService = new MemoryService(memoryRepository, activityRepository, repositoryService);
const opportunityRepository = new OpportunityRepository();
const opportunityService = new OpportunityService(opportunityRepository, activityService, repositoryService);
const settingsRepository = new SettingsRepository();
const pipelineService = new PipelineService(activityService, memoryService, opportunityService, settingsRepository);
const settingsService = new SettingsService(settingsRepository);
const contentService = new ContentService(
  opportunityRepository,
  activityService,
  repositoryService,
  memoryService,
  memoryRepository,
  settingsRepository
);
const developerService = new DeveloperService(
  connectionService,
  repositoryService,
  syncService,
  activityService,
  memoryService,
  opportunityService,
  pipelineService,
  settingsService,
  contentService
);
const developerController = new DeveloperController(developerService);

/**
 * Feature gate. When the module is off, every route below 404s so the surface
 * is indistinguishable from an unmounted router.
 */
export function developerFlowGate(req: Request, res: Response, next: NextFunction) {
  if (!env.developerFlowEnabled) {
    return next(AppError.notFound('Not found'));
  }
  next();
}

// GET /api/developer/status - Feature availability (no auth, no gate: the
// client needs it to decide whether to render the nav entry at all).
router.get('/status', developerController.getStatus as any);

// Everything past this point is gated.
router.use(developerFlowGate);

// GET /api/developer/overview - Dashboard counters
router.get(
  '/overview',
  authenticate as any,
  developerController.overview as any
);

// GET /api/developer/github/auth-url - Start the GitHub OAuth handshake
router.get(
  '/github/auth-url',
  authenticate as any,
  developerController.githubAuthUrl as any
);

// POST /api/developer/github/callback - Exchange the authorization code
router.post(
  '/github/callback',
  authenticate as any,
  validate({ body: githubCallbackSchema }),
  developerController.githubCallback as any
);

// GET /api/developer/github/connection - Connection status (never includes the token)
router.get(
  '/github/connection',
  authenticate as any,
  developerController.githubConnection as any
);

// DELETE /api/developer/github/connection - Disconnect GitHub
router.delete(
  '/github/connection',
  authenticate as any,
  developerController.githubDisconnect as any
);

// GET /api/developer/repositories - Mirrored repositories
router.get(
  '/repositories',
  authenticate as any,
  developerController.listRepositories as any
);

// GET /api/developer/repositories/available - Repositories on GitHub (requires a connection)
router.get(
  '/repositories/available',
  authenticate as any,
  developerController.listAvailableRepositories as any
);

// POST /api/developer/repositories/sync - Mirror GitHub repositories locally
router.post(
  '/repositories/sync',
  authenticate as any,
  developerController.syncRepositories as any
);

// GET /api/developer/repositories/:id - Repository detail
router.get(
  '/repositories/:id',
  authenticate as any,
  validate({ params: repositoryIdSchema }),
  developerController.getRepository as any
);

// PATCH /api/developer/repositories/:id/monitoring - Toggle AI monitoring
router.patch(
  '/repositories/:id/monitoring',
  authenticate as any,
  validate({ params: repositoryIdSchema, body: monitoringSchema }),
  developerController.setRepositoryMonitoring as any
);

// DELETE /api/developer/repositories/:id - Remove repository and its synced data
router.delete(
  '/repositories/:id',
  authenticate as any,
  validate({ params: repositoryIdSchema }),
  developerController.deleteRepository as any
);

// POST /api/developer/repositories/:id/sync - Run a full sync now
router.post(
  '/repositories/:id/sync',
  authenticate as any,
  validate({ params: repositoryIdSchema }),
  developerController.runRepositorySync as any
);

// GET /api/developer/sync-logs?repositoryId=... - Recent sync history
router.get(
  '/sync-logs',
  authenticate as any,
  validate({ query: syncLogQuerySchema }),
  developerController.listSyncLogs as any
);

// POST /api/developer/repositories/:id/pipeline - intelligence → memory → opportunities
router.post(
  '/repositories/:id/pipeline',
  authenticate as any,
  validate({ params: repositoryIdSchema, body: pipelineSchema }),
  developerController.runPipeline as any
);

// GET /api/developer/activities - Detected development activities
router.get(
  '/activities',
  authenticate as any,
  validate({ query: activityQuerySchema }),
  developerController.listActivities as any
);

// GET /api/developer/activities/:id - Single activity with full evidence
router.get(
  '/activities/:id',
  authenticate as any,
  validate({ params: mongoIdSchema }),
  developerController.getActivity as any
);

// GET /api/developer/memory - Repository memory, grouped by category
router.get(
  '/memory',
  authenticate as any,
  validate({ query: memoryQuerySchema }),
  developerController.listMemory as any
);

// PATCH /api/developer/memory/:id - Manual correction (source = user)
router.patch(
  '/memory/:id',
  authenticate as any,
  validate({ params: mongoIdSchema, body: memoryEditSchema }),
  developerController.editMemory as any
);

// POST /api/developer/memory/:id/archive - Soft-delete, history preserved
router.post(
  '/memory/:id/archive',
  authenticate as any,
  validate({ params: mongoIdSchema }),
  developerController.archiveMemory as any
);

// POST /api/developer/memory/:id/restore - Undo an archive
router.post(
  '/memory/:id/restore',
  authenticate as any,
  validate({ params: mongoIdSchema }),
  developerController.restoreMemory as any
);

// GET /api/developer/opportunities - Queued content opportunities
router.get(
  '/opportunities',
  authenticate as any,
  validate({ query: opportunityQuerySchema }),
  developerController.listOpportunities as any
);

// POST /api/developer/opportunities/:id/status - pending | generated | skipped | rejected
router.post(
  '/opportunities/:id/status',
  authenticate as any,
  validate({ params: mongoIdSchema, body: opportunityStatusSchema }),
  developerController.setOpportunityStatus as any
);

// POST /api/developer/opportunities/:id/generate - Generate LinkedIn drafts now
router.post(
  '/opportunities/:id/generate',
  authenticate as any,
  validate({ params: mongoIdSchema, body: contentGenerateSchema }),
  developerController.generateContent as any
);

// POST /api/developer/content/auto-run - Run the automatic generation pass once
router.post(
  '/content/auto-run',
  authenticate as any,
  developerController.runContentAutoGeneration as any
);

// GET /api/developer/settings/automation - Automation + AI content preferences
router.get(
  '/settings/automation',
  authenticate as any,
  developerController.getAutomationSettings as any
);

// PATCH /api/developer/settings/automation - Partial update (whitelisted server-side)
router.patch(
  '/settings/automation',
  authenticate as any,
  validate({ body: settingsPatchSchema }),
  developerController.updateAutomationSettings as any
);

export {
  developerController,
  developerService,
  connectionService,
  repositoryService,
  syncService,
  activityService,
  memoryService,
  opportunityService,
  pipelineService,
  settingsService,
  contentService
};
export default router;

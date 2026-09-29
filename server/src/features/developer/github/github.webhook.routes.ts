import { Router, Request, Response, NextFunction } from 'express';
import { env } from '../../../shared/config/env.config';
import { AppError } from '../../../shared/errors/appError';
import { ApiResponse } from '../../../shared/utils/response.util';
import { handleGitHubWebhook } from './github.webhook';

const router = Router();

/**
 * POST /api/webhooks/github - signed GitHub delivery.
 *
 * Mounted by server.ts only when DEVELOPER_FLOW_ENABLED is on, and still gated
 * here so the surface is absent even if the mount is moved. The route itself
 * carries no auth middleware: authenticity comes from the HMAC signature, and
 * the raw body must survive untouched for that check, so the parser lives in
 * server.ts alongside the existing Meta webhook.
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!env.developerFlowEnabled) return next(AppError.notFound('Not found'));

    const rawBody = (req as any).rawBody;
    if (!Buffer.isBuffer(rawBody)) throw AppError.badRequest('Raw body required for signature verification');

    // 202 for every acknowledged delivery: work is dispatched in the background,
    // and GitHub disables the webhook if it does not get a 2xx.
    const result = await handleGitHubWebhook(rawBody, req.headers as Record<string, string | string[] | undefined>);
    return ApiResponse.success(res, result, result.message ?? 'GitHub delivery accepted', 202);
  } catch (error) {
    next(error);
  }
});

export default router;

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../errors/appError';
import { env } from '../config/env.config';
import mongoose from 'mongoose';
import { resolveApiKey } from './apiKeyAuth';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
  /** Set when the request authenticated with a workspace API key. */
  apiKeyWorkspaceId?: string;
}

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    const rawHeaderKey = req.headers['x-api-key'];
    const headerApiKey = Array.isArray(rawHeaderKey) ? rawHeaderKey[0] : rawHeaderKey;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    // Two credential types share the Authorization header. A workspace API key
    // acts as its owner, so headless clients get the same API surface as the
    // dashboard without a 15-minute JWT dance.
    const apiKey = headerApiKey || (bearerToken?.startsWith('sf_live_') ? bearerToken : null);
    if (apiKey) {
      const identity = await resolveApiKey(apiKey);
      if (!identity) {
        return next(AppError.unauthorized('Invalid workspace API key'));
      }

      req.user = { id: identity.userId, email: identity.email };
      req.apiKeyWorkspaceId = identity.workspaceId;
      return next();
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(AppError.unauthorized('Access token required'));
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.JWT_SECRET) as { id: string; email: string };
    req.user = decoded;
    next();
  } catch (error) {
    return next(AppError.unauthorized('Invalid or expired access token'));
  }
}

// Enforce workspace member role constraints (RBAC)
export function requireRole(allowedRoles: string[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized('Authentication context required'));
      }

      // Locate workspaceId in request body, query params, or URL path parameters
      const workspaceId = req.params.workspaceId || req.body.workspaceId || req.query.workspaceId;
      if (!workspaceId) {
        return next(AppError.badRequest('Workspace ID is required for this operation'));
      }

      // Check member role dynamically via direct DB query on WorkspaceMember collection
      const WorkspaceMemberModel = mongoose.model('WorkspaceMember');
      const member = await WorkspaceMemberModel.findOne({
        workspaceId: workspaceId.toString(),
        userId: req.user.id
      }).exec();

      if (!member) {
        return next(AppError.forbidden('Access denied. You are not a member of this workspace.'));
      }

      if (!allowedRoles.includes(member.role)) {
        return next(
          AppError.forbidden(`Access denied. Insufficient permissions. Required one of: [${allowedRoles.join(', ')}]`)
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

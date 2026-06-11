import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../errors/appError';
import { env } from '../config/env.config';
import mongoose from 'mongoose';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Access token required'));
  }

  const token = authHeader.split(' ')[1];
  try {
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

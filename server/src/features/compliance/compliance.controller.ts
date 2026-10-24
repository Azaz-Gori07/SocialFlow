import { Response, NextFunction } from 'express';
import { ComplianceService } from './compliance.service';
import { complianceDigestService } from './complianceDigest.service';
import { ApiResponse } from '../../shared/utils/response.util';
import { AuthenticatedRequest } from '../../shared/middleware/rbac.middleware';
import { AppError } from '../../shared/errors/appError';

export class ComplianceController {
  constructor(private complianceService: ComplianceService) {}

  listChecks = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { status, limit, offset } = req.query as { status?: string; limit?: string; offset?: string };
      const result = await this.complianceService.listChecks(req.user.id, {
        status,
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0
      });
      return ApiResponse.success(res, result, 'Compliance checks retrieved');
    } catch (error) { next(error); }
  };

  resolveCheck = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { id } = req.params;
      const { status, note } = req.body;
      if (!status) return next(AppError.badRequest('Resolution status is required'));
      const check = await this.complianceService.resolveCheck(id, req.user.id, { status, note });
      return ApiResponse.success(res, check, 'Compliance check resolved');
    } catch (error) { next(error); }
  };

  getMetrics = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const metrics = await this.complianceService.getMetrics(req.user.id);
      return ApiResponse.success(res, metrics, 'Compliance metrics retrieved');
    } catch (error) { next(error); }
  };

  getDigest = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const digest = await complianceDigestService.generateDailyDigest(req.user.id);
      return ApiResponse.success(res, digest, 'Compliance daily digest generated');
    } catch (error) { next(error); }
  };

  listRules = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const rules = await this.complianceService.listRules(req.user.id);
      return ApiResponse.success(res, rules, 'Custom compliance rules retrieved');
    } catch (error) { next(error); }
  };

  createRule = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { name, pattern, isRegex, severity, action, platform, category, description } = req.body;
      if (!name || !pattern) return next(AppError.badRequest('name and pattern are required'));
      const rule = await this.complianceService.createRule(req.user.id, {
        name,
        pattern,
        isRegex: Boolean(isRegex),
        severity: severity || 'warning',
        action: action || 'review',
        platform: platform || 'all',
        category,
        description
      });
      return ApiResponse.success(res, rule, 'Custom rule created', 201);
    } catch (error) { next(error); }
  };

  updateRule = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { id } = req.params;
      const rule = await this.complianceService.updateRule(id, req.user.id, req.body);
      return ApiResponse.success(res, rule, 'Custom rule updated');
    } catch (error) { next(error); }
  };

  deleteRule = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const { id } = req.params;
      const deleted = await this.complianceService.deleteRule(id, req.user.id);
      return ApiResponse.success(res, { deleted }, 'Custom rule deleted');
    } catch (error) { next(error); }
  };
}

export const complianceController = new ComplianceController(new ComplianceService());
export default complianceController;

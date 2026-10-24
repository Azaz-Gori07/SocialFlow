import { Router } from 'express';
import { complianceController } from './compliance.controller';
import { authenticate } from '../../shared/middleware/rbac.middleware';

const router = Router();

// GET /api/compliance/checks — list compliance checks
router.get('/checks', authenticate as any, complianceController.listChecks as any);

// POST /api/compliance/checks/:id/resolve — admin resolve check
router.post('/checks/:id/resolve', authenticate as any, complianceController.resolveCheck as any);

// GET /api/compliance/metrics — compliance statistics & error aggregates
router.get('/metrics', authenticate as any, complianceController.getMetrics as any);

// GET /api/compliance/digest — daily digest summary
router.get('/digest', authenticate as any, complianceController.getDigest as any);

// Custom Rules
router.get('/rules', authenticate as any, complianceController.listRules as any);
router.post('/rules', authenticate as any, complianceController.createRule as any);
router.put('/rules/:id', authenticate as any, complianceController.updateRule as any);
router.delete('/rules/:id', authenticate as any, complianceController.deleteRule as any);

export default router;

import ComplianceCheckModel from './compliance.model';
import DraftModel from '../draft/draft.model';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.types';
import { logger } from '../../shared/utils/logger';

export interface IDigestSummary {
  userId: string;
  date: string;
  pendingReviews: number;
  blockedCount: number;
  publishedCount: number;
  totalChecks: number;
}

export class ComplianceDigestService {
  private notificationService = new NotificationService();

  async generateDailyDigest(userId: string): Promise<IDigestSummary> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [pendingReviews, blockedCount, publishedCount, totalChecks] = await Promise.all([
      DraftModel.countDocuments({
        userId,
        status: { $in: ['draft', 'ready'] },
        $or: [{ complianceApproved: false }, { complianceStatus: 'review' }]
      }),
      ComplianceCheckModel.countDocuments({
        userId,
        createdAt: { $gte: today },
        status: { $in: ['blocked', 'confirmed_violation'] }
      }),
      DraftModel.countDocuments({
        userId,
        status: 'published',
        publishedAt: { $gte: today.toISOString() }
      }),
      ComplianceCheckModel.countDocuments({
        userId,
        createdAt: { $gte: today }
      })
    ]);

    const summary: IDigestSummary = {
      userId,
      date: today.toISOString().slice(0, 10),
      pendingReviews,
      blockedCount,
      publishedCount,
      totalChecks
    };

    if (pendingReviews > 0 || blockedCount > 0) {
      await this.notificationService
        .create({
          userId,
          type: NotificationType.COMPLIANCE_ALERT,
          title: 'Daily Compliance Digest',
          message: `Compliance digest: ${pendingReviews} draft(s) need review, ${blockedCount} item(s) blocked today.`
        })
        .catch((err: any) => logger.warn('[compliance-digest] notification error', { error: String(err) }));
    }

    return summary;
  }
}

export const complianceDigestService = new ComplianceDigestService();
export default complianceDigestService;

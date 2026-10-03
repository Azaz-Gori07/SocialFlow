import ComplianceCheckModel, { IComplianceCheck } from './compliance.model';
import {
  ComplianceInput,
  ComplianceResult,
  POLICY_VERSION,
  blocksAutomaticPublish,
  checkContent,
  requiresReview,
} from './compliance-checker';
import { AppError } from '../../shared/errors/appError';
import { logger } from '../../shared/utils/logger';

/**
 * Compliance memory (§17, §35): an identical content+media item analysed under
 * the same policy version reuses the previous decision instead of being re-scored.
 * That is both the cost-control rule and the rule that a confirmed violation is
 * remembered.
 */
export class ComplianceService {
  /**
   * Returns the stored decision for this exact content, or null when it has never
   * been analysed under the current policy version.
   */
  async findReusable(
    userId: string,
    contentHash: string,
    platform: string,
    mediaHash?: string
  ): Promise<IComplianceCheck | null> {
    if (mediaHash) {
      const blocked = await ComplianceCheckModel.findOne({
        userId,
        mediaHash,
        policyVersion: POLICY_VERSION,
        status: { $in: ['blocked', 'confirmed_violation'] }
      } as any)
        .sort({ createdAt: -1 })
        .exec();
      if (blocked) return blocked;
    }
    return ComplianceCheckModel.findOne({ userId, contentHash, platform, policyVersion: POLICY_VERSION } as any)
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Analyses content and persists the decision. Reuses a previous identical
   * analysis instead of recomputing.
   */
  async check(
    userId: string,
    input: ComplianceInput,
    meta?: { workspaceId?: string; rightsDeclaration?: ComplianceInput['rightsDeclaration']; sourceUrl?: string }
  ): Promise<ComplianceResult & { reused: boolean; recordId: string }> {
    const blockedMediaHashes = await this.blockedMediaHashes(userId, input.media);
    const result = checkContent({ ...input, blockedMediaHashes });

    const reusable = await this.findReusable(userId, result.contentHash, input.platform, result.mediaHash);
    if (reusable) {
      logger.info('[compliance] reusing stored decision', {
        contentHash: result.contentHash.slice(0, 12),
        status: reusable.status
      });
      return { ...result, status: reusable.status as ComplianceResult['status'], reused: true, recordId: reusable._id.toString() };
    }

    const record = await ComplianceCheckModel.create({
      userId,
      workspaceId: meta?.workspaceId,
      contentHash: result.contentHash,
      mediaHash: result.mediaHash,
      platform: input.platform,
      policyVersion: result.policyVersion,
      status: result.status,
      findings: result.findings,
      riskScore: result.riskScore,
      rightsDeclaration: meta?.rightsDeclaration,
      sourceUrl: meta?.sourceUrl,
      processed: true
    } as any);

    return { ...result, reused: false, recordId: record._id.toString() };
  }

  /** Media the user has already had confirmed against them. */
  private async blockedMediaHashes(
    userId: string,
    media?: Array<{ url: string; kind: string }>
  ): Promise<string[]> {
    if (!media || media.length === 0) return [];
    const rows = await ComplianceCheckModel.find({
      userId,
      policyVersion: POLICY_VERSION,
      status: { $in: ['blocked', 'confirmed_violation'] },
      mediaHash: { $exists: true, $ne: null }
    } as any)
      .select('mediaHash')
      .exec();
    return rows.map((r) => r.mediaHash).filter((h): h is string => !!h);
  }

  /**
   * The publish gate. Throws for a hard block or an uncertain result that the
   * caller has not explicitly approved — uncertain means review, never silent
   * destruction and never silent publication.
   */
  async assertPublishable(
    userId: string,
    input: ComplianceInput,
    opts?: { workspaceId?: string; approved?: boolean; rightsDeclaration?: ComplianceInput['rightsDeclaration']; sourceUrl?: string }
  ): Promise<ComplianceResult & { reused: boolean; recordId: string }> {
    const result = await this.check(userId, input, opts);

    if (blocksAutomaticPublish(result.status)) {
      throw new AppError(
        `Publishing blocked by compliance: ${result.findings.filter((f) => f.severity === 'error').map((f) => f.message).join(' ')}`,
        422
      );
    }

    if (requiresReview(result.status) && !opts?.approved) {
      throw new AppError(
        `Compliance review required before publishing: ${result.findings.filter((f) => f.severity === 'warning').map((f) => f.message).join(' ')}`,
        409
      );
    }

    return result;
  }

  /** Latest decisions for a user, newest first. */
  async list(userId: string, limit = 50) {
    return ComplianceCheckModel.find({ userId } as any).sort({ createdAt: -1 }).limit(limit).exec();
  }

  /** Records that a provider confirmed the post exists. */
  async markPublished(recordId: string, externalPostId: string): Promise<void> {
    await ComplianceCheckModel.updateOne(
      { _id: recordId } as any,
      { $set: { status: 'published', externalPostId, publishedAt: new Date().toISOString() } } as any
    ).exec();
  }

  /**
   * Post-publish claim (§36). Only a provider-verified claim downgrades a
   * published item to `claimed_after_publish`; an uncertain signal is recorded
   * for review and never deletes or blocks anything by itself.
   */
  async recordClaim(
    userId: string,
    externalPostId: string,
    opts: { verified: boolean; reason: string }
  ): Promise<IComplianceCheck | null> {
    const existing = await ComplianceCheckModel.findOne({ userId, externalPostId } as any).exec();
    if (!existing) return null;

    const status = opts.verified ? 'claimed_after_publish' : 'review_required';
    return ComplianceCheckModel.findByIdAndUpdate(
      existing._id,
      {
        $set: {
          status,
          findings: [
            ...existing.findings,
            {
              code: opts.verified ? 'PROVIDER_CLAIM_VERIFIED' : 'PROVIDER_CLAIM_UNVERIFIED',
              severity: opts.verified ? 'error' : 'warning',
              message: opts.reason
            }
          ]
        }
      } as any,
      { new: true }
    ).exec();
  }
}
export default ComplianceService;
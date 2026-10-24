import ComplianceCheckModel, { IComplianceCheck } from './compliance.model';
import PostModel from '../post/post.model';
import CustomRuleModel, { ICustomRule } from './customRule.model';
import { imageHashService } from './imageHash.service';
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

function getTermFrequency(text: string): Map<string, number> {
  const words = (text || '').toLowerCase().match(/\b\w{3,}\b/g) || [];
  const tf = new Map<string, number>();
  for (const w of words) {
    tf.set(w, (tf.get(w) || 0) + 1);
  }
  return tf;
}

export function computeCosineSimilarity(text1: string, text2: string): number {
  const tf1 = getTermFrequency(text1);
  const tf2 = getTermFrequency(text2);
  if (tf1.size === 0 || tf2.size === 0) return 0;

  let dotProduct = 0;
  for (const [term, count1] of tf1) {
    const count2 = tf2.get(term) || 0;
    dotProduct += count1 * count2;
  }

  let mag1 = 0;
  for (const count of tf1.values()) mag1 += count * count;
  let mag2 = 0;
  for (const count of tf2.values()) mag2 += count * count;

  const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
  if (magnitude === 0) return 0;
  return dotProduct / magnitude;
}

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
    const computedMediaHashes = await imageHashService.computeMediaHashes(input.media || [], userId);
    const blockedMediaHashes = await this.blockedMediaHashes(userId, input.media);
    const result = checkContent({ ...input, blockedMediaHashes });

    // Check media against perceptual / fingerprint blocked hashes
    for (const h of computedMediaHashes) {
      if (imageHashService.isBlockedMatch(h, blockedMediaHashes)) {
        result.findings.push({
          code: 'MEDIA_COPYRIGHT_VIOLATION',
          severity: 'error',
          message: 'Media matches a blocked copyright or duplicate image signature.',
          evidence: h
        });
        result.status = 'blocked';
        break;
      }
    }

    // Check similarity against previously published posts
    try {
      const recentPosts = await PostModel.find({
        userId,
        content: { $exists: true, $ne: '' }
      } as any)
        .select('content')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean()
        .exec();

      for (const p of recentPosts) {
        if (!p.content || p.content === input.content) continue;
        const sim = computeCosineSimilarity(input.content, p.content);
        if (sim >= 0.85) {
          result.findings.push({
            code: 'HIGH_SIMILARITY_DUPLICATE',
            severity: 'warning',
            message: `Content is ${Math.round(sim * 100)}% similar to an existing post. Consider revising for originality.`,
            evidence: `similarity=${sim.toFixed(2)}`
          });
          if (result.status === 'clear' || result.status === 'low_risk') {
            result.status = 'review_required';
          }
          break;
        }
      }
    } catch (err) {
      logger.warn('[compliance] similarity check non-fatal error', {
        error: err instanceof Error ? err.message : String(err)
      });
    }

    // Check custom rules
    try {
      const customRules = await CustomRuleModel.find({ userId, enabled: true }).lean().exec();
      for (const rule of customRules) {
        if (rule.platform && rule.platform !== 'all' && rule.platform !== input.platform) {
          continue;
        }
        let matched = false;
        if (rule.isRegex) {
          try {
            const re = new RegExp(rule.pattern, 'i');
            matched = re.test(input.content || '');
          } catch {}
        } else {
          matched = (input.content || '').toLowerCase().includes(rule.pattern.toLowerCase());
        }

        if (matched) {
          result.findings.push({
            code: `CUSTOM_RULE_${rule._id}`,
            severity: rule.severity,
            message: `Custom rule "${rule.name}" triggered: matched pattern "${rule.pattern}"`
          });
          if (rule.action === 'block') {
            result.status = 'blocked';
          } else if (rule.action === 'review' && result.status !== 'blocked') {
            result.status = 'review_required';
          }
        }
      }
    } catch (err) {
      logger.warn('[compliance] custom rules evaluation error', {
        error: err instanceof Error ? err.message : String(err)
      });
    }

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
      mediaHashes: computedMediaHashes,
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
      $or: [
        { mediaHash: { $exists: true, $ne: null } },
        { mediaHashes: { $exists: true, $not: { $size: 0 } } }
      ]
    } as any)
      .select('mediaHash mediaHashes')
      .exec();
    const hashes: string[] = [];
    for (const r of rows) {
      if (r.mediaHash) hashes.push(r.mediaHash);
      if (r.mediaHashes && Array.isArray(r.mediaHashes)) {
        hashes.push(...r.mediaHashes);
      }
    }
    return hashes;
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

  async listChecks(
    userId: string,
    opts?: { status?: string; limit?: number; offset?: number }
  ): Promise<{ items: IComplianceCheck[]; total: number }> {
    const query: Record<string, unknown> = { userId };
    if (opts?.status) {
      query.status = opts.status;
    }
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const [items, total] = await Promise.all([
      ComplianceCheckModel.find(query as any)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .exec(),
      ComplianceCheckModel.countDocuments(query as any)
    ]);
    return { items, total };
  }

  async resolveCheck(
    id: string,
    userId: string,
    resolution: { status: string; note?: string }
  ): Promise<IComplianceCheck | null> {
    const existing = await ComplianceCheckModel.findOne({ _id: id, userId } as any).exec();
    if (!existing) throw AppError.notFound('Compliance check not found');

    const findings = [...existing.findings];
    if (resolution.note) {
      findings.push({
        code: 'ADMIN_RESOLUTION',
        severity: 'info' as any,
        message: resolution.note
      });
    }

    return ComplianceCheckModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: resolution.status,
          findings,
          resolvedAt: new Date(),
          resolvedBy: userId
        }
      } as any,
      { new: true }
    ).exec();
  }

  async getMetrics(userId: string): Promise<{
    totalChecks: number;
    clearCount: number;
    reviewCount: number;
    blockedCount: number;
    claimedCount: number;
    averageRiskScore: number;
    topFindings: Array<{ code: string; count: number }>;
  }> {
    const checks = await ComplianceCheckModel.find({ userId } as any)
      .select('status riskScore findings')
      .lean()
      .exec();

    let totalChecks = checks.length;
    let clearCount = 0;
    let reviewCount = 0;
    let blockedCount = 0;
    let claimedCount = 0;
    let totalRisk = 0;
    const codeCounts = new Map<string, number>();

    for (const c of checks) {
      totalRisk += c.riskScore || 0;
      if (c.status === 'clear' || c.status === 'low_risk') clearCount++;
      else if (c.status === 'review_required') reviewCount++;
      else if (c.status === 'blocked' || c.status === 'confirmed_violation') blockedCount++;
      else if (c.status === 'claimed_after_publish') claimedCount++;

      for (const f of c.findings || []) {
        if (f.code) {
          codeCounts.set(f.code, (codeCounts.get(f.code) || 0) + 1);
        }
      }
    }

    const topFindings = Array.from(codeCounts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalChecks,
      clearCount,
      reviewCount,
      blockedCount,
      claimedCount,
      averageRiskScore: totalChecks > 0 ? Number((totalRisk / totalChecks).toFixed(2)) : 0,
      topFindings
    };
  }

  /* -------------------------- Custom Rules CRUD --------------------------- */

  async listRules(userId: string): Promise<ICustomRule[]> {
    return CustomRuleModel.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async createRule(userId: string, data: Partial<ICustomRule>): Promise<ICustomRule> {
    return CustomRuleModel.create({
      ...data,
      userId
    });
  }

  async updateRule(id: string, userId: string, data: Partial<ICustomRule>): Promise<ICustomRule | null> {
    const existing = await CustomRuleModel.findOne({ _id: id, userId }).exec();
    if (!existing) throw AppError.notFound('Custom rule not found');
    return CustomRuleModel.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }

  async deleteRule(id: string, userId: string): Promise<boolean> {
    const result = await CustomRuleModel.deleteOne({ _id: id, userId }).exec();
    return result.deletedCount > 0;
  }
}
export default ComplianceService;
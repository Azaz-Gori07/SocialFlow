import mongoose, { Schema, Document, model } from 'mongoose';

export type ComplianceDecision =
  | 'not_checked'
  | 'checking'
  | 'clear'
  | 'low_risk'
  | 'review_required'
  | 'high_risk'
  | 'confirmed_violation'
  | 'blocked'
  | 'published'
  | 'claimed_after_publish'
  | 'removed';

/**
 * Pre-publish compliance + copyright memory (master plan §33–§36).
 *
 * One row per analysed content revision. The stable `contentHash` + `policyVersion`
 * pair is what lets an identical post reuse a previous decision instead of paying
 * for the same analysis again, and what stops a confirmed violation from being
 * silently republished.
 */
export interface IComplianceCheck extends Document {
  userId: string;
  workspaceId?: string;
  /** SHA-256 of the normalised content + media set. */
  contentHash: string;
  /** SHA-256 of the media URLs only, so the same caption on new media re-analyses. */
  mediaHash?: string;
  platform: string;
  /** Incremented whenever the checker rules change; old rows keep their meaning. */
  policyVersion: string;
  status: ComplianceDecision;
  /** Structured findings; each carries a severity and a reason. */
  findings: Array<{
    code: string;
    severity: 'info' | 'warning' | 'error';
    message: string;
    evidence?: string;
  }>;
  /** Highest finding severity, denormalised for cheap queries. */
  riskScore: number;
  /** User-declared rights. Never inferred. */
  rightsDeclaration?: 'owned' | 'licensed' | 'permission_granted' | 'unknown';
  sourceUrl?: string;
  /** Set once a provider confirms the post exists, for post-publish claims. */
  externalPostId?: string;
  publishedAt?: string;
  processed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schemaOptions = { timestamps: true };

const ComplianceCheckSchema = new Schema<IComplianceCheck>(
  {
    userId: { type: String, required: true, index: true },
    workspaceId: { type: String, index: true },
    contentHash: { type: String, required: true },
    mediaHash: { type: String },
    platform: { type: String, required: true },
    policyVersion: { type: String, required: true },
    status: {
      type: String,
      enum: [
        'not_checked', 'checking', 'clear', 'low_risk', 'review_required',
        'high_risk', 'confirmed_violation', 'blocked', 'published',
        'claimed_after_publish', 'removed'
      ],
      default: 'not_checked'
    },
    findings: {
      type: [
        new Schema(
          {
            code: { type: String, required: true },
            severity: { type: String, enum: ['info', 'warning', 'error'], required: true },
            message: { type: String, required: true },
            evidence: { type: String }
          },
          { _id: false }
        )
      ],
      default: []
    },
    riskScore: { type: Number, default: 0, min: 0, max: 100 },
    rightsDeclaration: {
      type: String,
      enum: ['owned', 'licensed', 'permission_granted', 'unknown']
    },
    sourceUrl: { type: String },
    externalPostId: { type: String },
    publishedAt: { type: String },
    processed: { type: Boolean, default: false }
  },
  schemaOptions
);

// Same content + same policy version = reuse the previous decision.
ComplianceCheckSchema.index({ userId: 1, contentHash: 1, platform: 1, policyVersion: 1 });
ComplianceCheckSchema.index({ contentHash: 1, policyVersion: 1, status: 1 });
ComplianceCheckSchema.index({ mediaHash: 1, policyVersion: 1 });
ComplianceCheckSchema.index({ status: 1, createdAt: -1 });

const ComplianceCheckModel =
  (mongoose.models.ComplianceCheck as mongoose.Model<IComplianceCheck>) ||
  model<IComplianceCheck>('ComplianceCheck', ComplianceCheckSchema);

export default ComplianceCheckModel;
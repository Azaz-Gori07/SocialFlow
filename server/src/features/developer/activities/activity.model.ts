import mongoose, { Schema, Document, Model } from 'mongoose';

export type DeveloperImportance = 'TRIVIAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'MILESTONE';

/**
 * A "Development Activity" — a grouped, classified, scored unit of work
 * distilled from raw GitHub activity. Evidence-backed: every claim traces to
 * commits/PRs/issues via `evidence` and the `*Ids` arrays.
 */
export interface IDeveloperActivity extends Document {
  userId: string;
  repositoryId: string;
  title: string;
  /** pr_group | standalone_commit | ... */
  type: string;
  importance: DeveloperImportance;
  importanceScore: number;
  problem?: string;
  summary?: string;
  changes: string[];
  affectedAreas: string[];
  isMilestone: boolean;
  milestoneTitle?: string;
  linkedInWorthy: boolean;
  evidence: Record<string, any>;
  /** JSON.stringify of evidence.commitShas — set by the pipeline, backs the dedupe unique index. */
  evidenceKey?: string;
  /** 0-100 */
  confidence: number;
  status: string;
  detectedAt: Date;
  commitIds: string[];
  prIds: string[];
  issueIds: string[];
  createdAt: string;
  updatedAt: string;
}

const DeveloperActivitySchema = new Schema<IDeveloperActivity>(
  {
    userId: { type: String, required: true, index: true },
    repositoryId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    type: { type: String, required: true },
    importance: {
      type: String,
      required: true,
      enum: ['TRIVIAL', 'LOW', 'MEDIUM', 'HIGH', 'MILESTONE']
    },
    importanceScore: { type: Number, default: 0 },
    problem: { type: String },
    summary: { type: String },
    changes: { type: [String], default: [] },
    affectedAreas: { type: [String], default: [] },
    isMilestone: { type: Boolean, default: false },
    milestoneTitle: { type: String },
    linkedInWorthy: { type: Boolean, default: false },
    evidence: { type: Schema.Types.Mixed, required: true, default: {} },
    evidenceKey: { type: String },
    confidence: { type: Number, default: 0 },
    status: { type: String, default: 'detected' },
    detectedAt: { type: Date, default: Date.now },
    commitIds: { type: [String], default: [] },
    prIds: { type: [String], default: [] },
    issueIds: { type: [String], default: [] }
  },
  {
    timestamps: true,
    collection: 'developer_activities',
    toJSON: {
      virtuals: true,
      transform: (doc: any, ret: any) => {
        ret._id = ret._id.toString();
        delete ret.__v;
        return ret;
      }
    },
    toObject: { virtuals: true }
  }
);

// Idempotent re-sync: the same evidence must not produce two activities.
DeveloperActivitySchema.index({ repositoryId: 1, evidenceKey: 1 }, { unique: true });
DeveloperActivitySchema.index({ userId: 1, repositoryId: 1 });
DeveloperActivitySchema.index({ importance: 1 });
DeveloperActivitySchema.index({ detectedAt: -1 });

export const DeveloperActivityModel =
  (mongoose.models.DeveloperActivity as Model<IDeveloperActivity>) ||
  mongoose.model<IDeveloperActivity>('DeveloperActivity', DeveloperActivitySchema);
export default DeveloperActivityModel;

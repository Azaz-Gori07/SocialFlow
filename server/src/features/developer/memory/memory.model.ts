import mongoose, { Schema, Document, Model } from 'mongoose';

export type DeveloperMemoryCategory =
  | 'feature'
  | 'problem_solved'
  | 'milestone'
  | 'architecture'
  | 'tech_stack'
  | 'stage'
  | 'history'
  | 'custom';

/**
 * Persistent repository knowledge — a distilled, evidence-backed history of
 * what was built, fixed, and changed over time. Memory is only written from
 * verified evidence; no free-form AI claims are stored as fact.
 */
export interface IDeveloperMemory extends Document {
  userId: string;
  repositoryId: string;
  category: DeveloperMemoryCategory;
  key: string;
  value: string;
  /** Structured detail (e.g. tech stack items, completed milestone list). */
  items: string[];
  /** auto | user | seed */
  source: string;
  /** active | archived */
  status: string;
  sourceActivityId?: string;
  /** { prNumbers, issueNumbers, commitShas, activityTitle } */
  evidence: Record<string, any>;
  /** 0-100 */
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

const DeveloperMemorySchema = new Schema<IDeveloperMemory>(
  {
    userId: { type: String, required: true, index: true },
    repositoryId: { type: String, required: true, index: true },
    category: {
      type: String,
      required: true,
      enum: [
        'feature',
        'problem_solved',
        'milestone',
        'architecture',
        'tech_stack',
        'stage',
        'history',
        'custom'
      ]
    },
    key: { type: String, required: true },
    value: { type: String, required: true },
    items: { type: [String], default: [] },
    source: { type: String, default: 'auto' },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active'
    },
    sourceActivityId: { type: String },
    evidence: { type: Schema.Types.Mixed, default: {} },
    confidence: { type: Number, default: 0 }
  },
  {
    timestamps: true,
    collection: 'developer_memory',
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

// One memory entry per key per repository — re-derivation updates in place.
DeveloperMemorySchema.index({ repositoryId: 1, key: 1 }, { unique: true });
DeveloperMemorySchema.index({ userId: 1, category: 1 });
DeveloperMemorySchema.index({ status: 1 });

export const DeveloperMemoryModel =
  (mongoose.models.DeveloperMemory as Model<IDeveloperMemory>) ||
  mongoose.model<IDeveloperMemory>('DeveloperMemory', DeveloperMemorySchema);
export default DeveloperMemoryModel;

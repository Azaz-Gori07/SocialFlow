import mongoose, { Schema, Document, Model } from 'mongoose';

export type DeveloperOpportunityStatus =
  | 'baseline'
  | 'pending'
  | 'generated'
  | 'skipped'
  | 'rejected';

/**
 * A content opportunity derived from a development activity. One per source
 * activity, enforced by the unique index on (repositoryId, sourceId) so
 * re-running detection cannot duplicate a queued opportunity.
 */
export interface IDeveloperOpportunity extends Document {
  userId: string;
  repositoryId: string;
  activityId: string;
  title: string;
  summary?: string;
  /** activity | ... */
  sourceType: string;
  sourceId: string;
  status: DeveloperOpportunityStatus;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

const DeveloperOpportunitySchema = new Schema<IDeveloperOpportunity>(
  {
    userId: { type: String, required: true, index: true },
    repositoryId: { type: String, required: true, index: true },
    activityId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    summary: { type: String },
    sourceType: { type: String, default: 'activity' },
    sourceId: { type: String, required: true },
    status: {
      type: String,
      enum: ['baseline', 'pending', 'generated', 'skipped', 'rejected'],
      default: 'pending'
    },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true,
    collection: 'developer_opportunities',
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

DeveloperOpportunitySchema.index({ repositoryId: 1, sourceId: 1 }, { unique: true });
DeveloperOpportunitySchema.index({ status: 1 });

export const DeveloperOpportunityModel =
  (mongoose.models.DeveloperOpportunity as Model<IDeveloperOpportunity>) ||
  mongoose.model<IDeveloperOpportunity>('DeveloperOpportunity', DeveloperOpportunitySchema);
export default DeveloperOpportunityModel;

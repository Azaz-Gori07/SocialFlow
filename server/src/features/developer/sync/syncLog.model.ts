import mongoose, { Schema, Document, Model } from 'mongoose';

export type DeveloperSyncSource = 'manual' | 'webhook' | 'scheduled';
export type DeveloperSyncLogStatus = 'running' | 'completed' | 'failed';

/**
 * Tracks every sync attempt — manual, webhook-triggered, or scheduled.
 * Used for dashboard status display and debugging failed syncs.
 * Timestamps are explicit (not mongoose-managed) because a run's start and
 * end are domain data, and this collection is append-only per run.
 */
export interface IDeveloperSyncLog extends Document {
  userId: string;
  repositoryId: string;
  source: DeveloperSyncSource;
  eventType: string;
  status: DeveloperSyncLogStatus;
  recordsProcessed: string;
  errorMessage?: string;
  metadata: Record<string, any>;
  startedAt: Date;
  completedAt?: Date;
}

const DeveloperSyncLogSchema = new Schema<IDeveloperSyncLog>(
  {
    userId: { type: String, required: true, index: true },
    repositoryId: { type: String, required: true, index: true },
    source: {
      type: String,
      required: true,
      enum: ['manual', 'webhook', 'scheduled']
    },
    eventType: { type: String, required: true },
    status: {
      type: String,
      enum: ['running', 'completed', 'failed'],
      default: 'running',
      index: true
    },
    recordsProcessed: { type: String, default: '0' },
    errorMessage: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date }
  },
  {
    timestamps: false,
    collection: 'developer_sync_logs',
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

DeveloperSyncLogSchema.index({ repositoryId: 1, status: 1 });
DeveloperSyncLogSchema.index({ startedAt: -1 });

export const DeveloperSyncLogModel =
  (mongoose.models.DeveloperSyncLog as Model<IDeveloperSyncLog>) ||
  mongoose.model<IDeveloperSyncLog>('DeveloperSyncLog', DeveloperSyncLogSchema);
export default DeveloperSyncLogModel;

import mongoose, { Schema, Document, Model } from 'mongoose';

export type DeveloperMemoryAction = 'created' | 'updated' | 'archived' | 'restored' | 'deleted';

/**
 * Audit history of a memory entry — every create/update/archive is recorded
 * with the previous and new value, so the project journey can be traced.
 * `createdAt` doubles as `changedAt` (see timestamps below).
 */
export interface IDeveloperMemoryHistory extends Document {
  userId: string;
  memoryId: string;
  action: DeveloperMemoryAction;
  previousValue?: string;
  newValue?: string;
  evidence: Record<string, any>;
  source: string;
  createdAt: string;
}

const DeveloperMemoryHistorySchema = new Schema<IDeveloperMemoryHistory>(
  {
    userId: { type: String, required: true, index: true },
    memoryId: { type: String, required: true, index: true },
    action: {
      type: String,
      required: true,
      enum: ['created', 'updated', 'archived', 'restored', 'deleted']
    },
    previousValue: { type: String },
    newValue: { type: String },
    evidence: { type: Schema.Types.Mixed, default: {} },
    source: { type: String, default: 'auto' }
  },
  {
    // Append-only audit log: createdAt is the change time, so no updatedAt.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'developer_memory_history',
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

DeveloperMemoryHistorySchema.index({ memoryId: 1 });

export const DeveloperMemoryHistoryModel =
  (mongoose.models.DeveloperMemoryHistory as Model<IDeveloperMemoryHistory>) ||
  mongoose.model<IDeveloperMemoryHistory>('DeveloperMemoryHistory', DeveloperMemoryHistorySchema);
export default DeveloperMemoryHistoryModel;

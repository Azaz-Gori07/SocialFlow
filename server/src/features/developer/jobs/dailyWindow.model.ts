import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDailyWindow extends Document {
  userId: string;
  repositoryId: string;
  windowDate: string; // YYYY-MM-DD
  aggregatedAt: Date;
  scheduledFor: Date;
  activityIds: string[];
  draftId?: string;
  status: 'pending' | 'processed' | 'skipped';
  createdAt: Date;
  updatedAt: Date;
}

const DailyWindowSchema = new Schema<IDailyWindow>(
  {
    userId: { type: String, required: true, index: true },
    repositoryId: { type: String, required: true, index: true },
    windowDate: { type: String, required: true, index: true },
    aggregatedAt: { type: Date, required: true },
    scheduledFor: { type: Date, required: true },
    activityIds: { type: [String], default: [] },
    draftId: { type: String },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'processed', 'skipped'],
      default: 'pending'
    }
  },
  { timestamps: true }
);

DailyWindowSchema.index({ userId: 1, repositoryId: 1, windowDate: 1 }, { unique: true });

const DailyWindowModel: Model<IDailyWindow> =
  mongoose.models.DailyWindow ||
  mongoose.model<IDailyWindow>('DailyWindow', DailyWindowSchema);

export default DailyWindowModel;

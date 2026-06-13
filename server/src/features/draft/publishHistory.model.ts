import mongoose, { Schema, model, Document, Model } from 'mongoose';
import { DraftPlatform } from './draft.model';

export type PublishOutcome = 'success' | 'failed';

export interface IPublishHistory extends Document {
  draftId: string;
  userId: string;
  platform: DraftPlatform;
  attemptNumber: number;
  outcome: PublishOutcome;
  statusBefore: string;
  statusAfter: string;
  publishedAt?: string;
  platformResponse?: {
    postId?: string;
    url?: string;
    platform: string;
    raw?: any;
  };
  errorMessage?: string;
  errorStack?: string;
  createdAt: string;
}

const PublishHistorySchema = new Schema<IPublishHistory>({
  draftId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  platform: {
    type: String,
    required: true,
    enum: ['instagram', 'facebook', 'linkedin', 'twitter', 'youtube'],
    index: true
  },
  attemptNumber: { type: Number, required: true },
  outcome: { type: String, required: true, enum: ['success', 'failed'] },
  statusBefore: { type: String, required: true },
  statusAfter: { type: String, required: true },
  publishedAt: { type: String },
  platformResponse: {
    type: new Schema({
      postId: { type: String },
      url: { type: String },
      platform: { type: String },
      raw: { type: Schema.Types.Mixed }
    }, { _id: false })
  },
  errorMessage: { type: String },
  errorStack: { type: String }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc: any, ret: any) => {
      ret._id = ret._id.toString();
      delete ret.__v;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

PublishHistorySchema.index({ draftId: 1, attemptNumber: -1 });
PublishHistorySchema.index({ userId: 1, platform: 1, createdAt: -1 });
PublishHistorySchema.index({ draftId: 1, createdAt: -1 });

export const PublishHistoryModel = (mongoose.models.PublishHistory as Model<IPublishHistory>) || model<IPublishHistory>('PublishHistory', PublishHistorySchema);
export default PublishHistoryModel;
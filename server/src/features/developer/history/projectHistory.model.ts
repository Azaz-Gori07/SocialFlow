import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IProjectPostHistory extends Document {
  userId: string;
  draftId?: string;
  accountId?: string;
  platform?: string;
  repositoryId?: string;
  externalPostId?: string;
  content?: string;
  postedAt?: Date;
  status: string;
  dayKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectPostHistorySchema = new Schema<IProjectPostHistory>(
  {
    userId: { type: String, required: true, index: true },
    draftId: { type: String },
    accountId: { type: String, index: true },
    platform: { type: String },
    repositoryId: { type: String, index: true },
    externalPostId: { type: String },
    content: { type: String },
    postedAt: { type: Date },
    status: { type: String, default: 'published' },
    dayKey: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

ProjectPostHistorySchema.index({ userId: 1, accountId: 1, dayKey: 1 });
ProjectPostHistorySchema.index({ userId: 1, repositoryId: 1, dayKey: 1 });

export const ProjectPostHistoryModel: Model<IProjectPostHistory> =
  mongoose.models.ProjectPostHistory ||
  mongoose.model<IProjectPostHistory>('ProjectPostHistory', ProjectPostHistorySchema);

export default ProjectPostHistoryModel;

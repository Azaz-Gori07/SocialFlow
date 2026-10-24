import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IProjectHistory extends Document {
  userId: string;
  repositoryId: string;
  totalPostsPublished: number;
  lastPostedAt?: Date | null;
  publishedDraftIds: string[];
  topicsCovered: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ProjectHistorySchema = new Schema<IProjectHistory>(
  {
    userId: { type: String, required: true, index: true },
    repositoryId: { type: String, required: true, index: true },
    totalPostsPublished: { type: Number, default: 0 },
    lastPostedAt: { type: Date, default: null },
    publishedDraftIds: { type: [String], default: [] },
    topicsCovered: { type: [String], default: [] }
  },
  { timestamps: true }
);

ProjectHistorySchema.index({ userId: 1, repositoryId: 1 }, { unique: true });

const ProjectHistoryModel: Model<IProjectHistory> =
  mongoose.models.ProjectHistory ||
  mongoose.model<IProjectHistory>('ProjectHistory', ProjectHistorySchema);

export default ProjectHistoryModel;

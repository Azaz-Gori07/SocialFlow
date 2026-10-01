import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDeveloperPullRequest extends Document {
  userId: string;
  repositoryId: string;
  githubId: string;
  number: number;
  title?: string;
  body?: string;
  state: string; // open | closed | merged
  authorLogin?: string;
  authorAvatarUrl?: string;
  sourceBranch?: string;
  targetBranch?: string;
  labels: string[];
  additions: number;
  deletions: number;
  changedFiles: number;
  commentsCount: number;
  reviewCommentsCount: number;
  merged: boolean;
  mergedAt?: Date;
  mergedByLogin?: string;
  closedAt?: Date;
  url?: string;
  createdAt: string;
  updatedAt: string;
}

const DeveloperPullRequestSchema = new Schema<IDeveloperPullRequest>(
  {
    userId: { type: String, required: true, index: true },
    repositoryId: { type: String, required: true, index: true },
    githubId: { type: String, required: true },
    number: { type: Number, required: true },
    title: { type: String },
    body: { type: String },
    state: { type: String, index: true },
    authorLogin: { type: String },
    authorAvatarUrl: { type: String },
    sourceBranch: { type: String },
    targetBranch: { type: String },
    labels: { type: [String], default: [] },
    additions: { type: Number, default: 0 },
    deletions: { type: Number, default: 0 },
    changedFiles: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    reviewCommentsCount: { type: Number, default: 0 },
    merged: { type: Boolean, default: false },
    mergedAt: { type: Date },
    mergedByLogin: { type: String },
    closedAt: { type: Date },
    url: { type: String }
  },
  {
    timestamps: true,
    collection: 'developer_pull_requests',
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

DeveloperPullRequestSchema.index({ repositoryId: 1, githubId: 1 }, { unique: true });
DeveloperPullRequestSchema.index({ repositoryId: 1, state: 1 });

export const DeveloperPullRequestModel =
  (mongoose.models.DeveloperPullRequest as Model<IDeveloperPullRequest>) ||
  mongoose.model<IDeveloperPullRequest>('DeveloperPullRequest', DeveloperPullRequestSchema);
export default DeveloperPullRequestModel;

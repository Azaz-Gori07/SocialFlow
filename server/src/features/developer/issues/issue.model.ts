import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDeveloperIssue extends Document {
  userId: string;
  repositoryId: string;
  githubId: string;
  number: number;
  title?: string;
  body?: string;
  state: string; // open | closed
  authorLogin?: string;
  authorAvatarUrl?: string;
  labels: string[];
  assignees: string[];
  milestone?: string;
  commentsCount: number;
  closedAt?: Date;
  url?: string;
  createdAt: string;
  updatedAt: string;
}

const DeveloperIssueSchema = new Schema<IDeveloperIssue>(
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
    labels: { type: [String], default: [] },
    assignees: { type: [String], default: [] },
    milestone: { type: String },
    commentsCount: { type: Number, default: 0 },
    closedAt: { type: Date },
    url: { type: String }
  },
  {
    timestamps: true,
    collection: 'developer_issues',
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

DeveloperIssueSchema.index({ repositoryId: 1, githubId: 1 }, { unique: true });
DeveloperIssueSchema.index({ repositoryId: 1, state: 1 });

export const DeveloperIssueModel =
  (mongoose.models.DeveloperIssue as Model<IDeveloperIssue>) ||
  mongoose.model<IDeveloperIssue>('DeveloperIssue', DeveloperIssueSchema);
export default DeveloperIssueModel;

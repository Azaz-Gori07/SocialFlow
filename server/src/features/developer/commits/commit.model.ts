import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDeveloperCommit extends Document {
  userId: string;
  repositoryId: string;
  sha: string;
  message: string;
  authorName?: string;
  authorEmail?: string;
  authorAvatarUrl?: string;
  committedAt: Date;
  pushedAt?: Date;
  additions: number;
  deletions: number;
  filesChanged: number;
  url?: string;
  verified: boolean;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

const DeveloperCommitSchema = new Schema<IDeveloperCommit>(
  {
    userId: { type: String, required: true, index: true },
    repositoryId: { type: String, required: true, index: true },
    sha: { type: String, required: true, maxlength: 40 },
    message: { type: String, required: true },
    authorName: { type: String },
    authorEmail: { type: String },
    authorAvatarUrl: { type: String },
    committedAt: { type: Date, required: true },
    pushedAt: { type: Date },
    additions: { type: Number, default: 0 },
    deletions: { type: Number, default: 0 },
    filesChanged: { type: Number, default: 0 },
    url: { type: String },
    verified: { type: Boolean, default: false },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true,
    collection: 'developer_commits',
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

DeveloperCommitSchema.index({ repositoryId: 1, sha: 1 }, { unique: true });
DeveloperCommitSchema.index({ repositoryId: 1, committedAt: -1 });

export const DeveloperCommitModel =
  (mongoose.models.DeveloperCommit as Model<IDeveloperCommit>) ||
  mongoose.model<IDeveloperCommit>('DeveloperCommit', DeveloperCommitSchema);
export default DeveloperCommitModel;

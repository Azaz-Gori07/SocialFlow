import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDeveloperRelease extends Document {
  userId: string;
  repositoryId: string;
  githubId: string;
  tagName?: string;
  name?: string;
  body?: string;
  authorLogin?: string;
  authorAvatarUrl?: string;
  isDraft: boolean;
  isPrerelease: boolean;
  assetsCount: number;
  url?: string;
  publishedAt?: Date;
  createdAt: string;
  updatedAt: string;
}

const DeveloperReleaseSchema = new Schema<IDeveloperRelease>(
  {
    userId: { type: String, required: true, index: true },
    repositoryId: { type: String, required: true, index: true },
    githubId: { type: String, required: true },
    tagName: { type: String },
    name: { type: String },
    body: { type: String },
    authorLogin: { type: String },
    authorAvatarUrl: { type: String },
    isDraft: { type: Boolean, default: false },
    isPrerelease: { type: Boolean, default: false },
    assetsCount: { type: Number, default: 0 },
    url: { type: String },
    publishedAt: { type: Date }
  },
  {
    timestamps: true,
    collection: 'developer_releases',
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

DeveloperReleaseSchema.index({ repositoryId: 1, githubId: 1 }, { unique: true });

export const DeveloperReleaseModel =
  (mongoose.models.DeveloperRelease as Model<IDeveloperRelease>) ||
  mongoose.model<IDeveloperRelease>('DeveloperRelease', DeveloperReleaseSchema);
export default DeveloperReleaseModel;

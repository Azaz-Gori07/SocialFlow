import mongoose, { Schema, Document, Model } from 'mongoose';

/** File-level changes for a commit, from the GitHub commit detail API. */
export interface IDeveloperCommitFile extends Document {
  userId: string;
  repositoryId: string;
  commitId: string;
  filename: string;
  status?: string; // added | modified | removed | renamed | copied | changed
  additions: number;
  deletions: number;
  changes: number;
  previousFilename?: string;
  fileType?: string; // source | test | config | docs | style | asset | lockfile | other
  module?: string; // detected top-level module (dir or repo name)
  createdAt: string;
  updatedAt: string;
}

const DeveloperCommitFileSchema = new Schema<IDeveloperCommitFile>(
  {
    userId: { type: String, required: true, index: true },
    repositoryId: { type: String, required: true, index: true },
    commitId: { type: String, required: true, index: true },
    filename: { type: String, required: true },
    status: { type: String },
    additions: { type: Number, default: 0 },
    deletions: { type: Number, default: 0 },
    changes: { type: Number, default: 0 },
    previousFilename: { type: String },
    fileType: { type: String },
    module: { type: String }
  },
  {
    timestamps: true,
    collection: 'developer_commit_files',
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

// Not unique: GitHub reports the same filename once per commit, but re-syncs
// replace rows rather than relying on an upsert key.
DeveloperCommitFileSchema.index({ commitId: 1 });
DeveloperCommitFileSchema.index({ module: 1 });

export const DeveloperCommitFileModel =
  (mongoose.models.DeveloperCommitFile as Model<IDeveloperCommitFile>) ||
  mongoose.model<IDeveloperCommitFile>('DeveloperCommitFile', DeveloperCommitFileSchema);
export default DeveloperCommitFileModel;

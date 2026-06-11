import mongoose, { Schema, model, Document, Model } from 'mongoose';

export interface IWorkspace extends Document {
  name: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWorkspaceMember extends Document {
  workspaceId: string;
  userId: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    ownerId: {
      type: String,
      required: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

const WorkspaceMemberSchema = new Schema<IWorkspaceMember>(
  {
    workspaceId: {
      type: String,
      required: true,
      index: true
    },
    userId: {
      type: String,
      required: true,
      index: true
    },
    role: {
      type: String,
      required: true,
      enum: ['owner', 'admin', 'editor', 'viewer'],
      default: 'viewer'
    }
  },
  {
    timestamps: true
  }
);

// Ensure a user can only have a single role mapped per workspace
WorkspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export const WorkspaceModel = (mongoose.models.Workspace as Model<IWorkspace>) || model<IWorkspace>('Workspace', WorkspaceSchema);
export const WorkspaceMemberModel = (mongoose.models.WorkspaceMember as Model<IWorkspaceMember>) || model<IWorkspaceMember>('WorkspaceMember', WorkspaceMemberSchema);

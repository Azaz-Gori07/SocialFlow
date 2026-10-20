import mongoose, { Schema, model, Document, Model } from 'mongoose';

export interface IWorkspaceSettings {
  timezone: string;
  dateFormat: string;
  autoShortenUrls: boolean;
  autoHashtags: boolean;
  crossPostWarning: boolean;
  webhookUrl?: string;
  /** Server-managed delivery telemetry, never accepted from clients. */
  webhookLastDeliveryAt?: string;
  webhookLastStatus?: number;
  webhookLastError?: string;
}

export interface IWorkspace extends Document {
  name: string;
  ownerId: string;
  settings?: IWorkspaceSettings;
  /** SHA-256 of the workspace API key — the key itself is never stored in plain text. */
  apiKeyHash?: string;
  /** First characters of the key so the UI can identify it without revealing it. */
  apiKeyPrefix?: string;
  /** Reversible copy (AES-256-GCM) shown only to the workspace owner. */
  apiKeyEncrypted?: string;
  apiKeyCreatedAt?: Date;
  apiKeyLastUsedAt?: Date;
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

export const DEFAULT_WORKSPACE_SETTINGS: IWorkspaceSettings = {
  timezone: 'Asia/Kolkata (IST, UTC+05:30)',
  dateFormat: 'MMM D, YYYY',
  autoShortenUrls: true,
  autoHashtags: true,
  crossPostWarning: true,
  webhookUrl: ''
};

const WorkspaceSettingsSchema = new Schema<IWorkspaceSettings>(
  {
    timezone: { type: String, default: DEFAULT_WORKSPACE_SETTINGS.timezone },
    dateFormat: { type: String, default: DEFAULT_WORKSPACE_SETTINGS.dateFormat },
    autoShortenUrls: { type: Boolean, default: true },
    autoHashtags: { type: Boolean, default: true },
    crossPostWarning: { type: Boolean, default: true },
    webhookUrl: { type: String, default: '' },
    webhookLastDeliveryAt: { type: String },
    webhookLastStatus: { type: Number },
    webhookLastError: { type: String }
  },
  { _id: false }
);

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
    },
    settings: {
      type: WorkspaceSettingsSchema,
      default: () => ({ ...DEFAULT_WORKSPACE_SETTINGS })
    },
    apiKeyHash: {
      type: String,
      index: true,
      sparse: true
    },
    apiKeyPrefix: { type: String },
    apiKeyEncrypted: { type: String },
    apiKeyCreatedAt: { type: Date },
    apiKeyLastUsedAt: { type: Date }
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

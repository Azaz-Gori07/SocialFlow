import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Per-user Developer Intelligence preferences.
 * Auto-publish defaults to OFF — users must explicitly enable it.
 */
export interface IDeveloperSettings extends Document {
  userId: string;
  detectOpportunities: boolean;
  generateDrafts: boolean;
  // Global account-wide switch: meaningful activity in ANY non-blocked repo
  // may trigger AI draft generation. OFF by default — user opts in.
  // ON means drafts are generated; real auto-publishing is a separate switch.
  autoContent: boolean;
  autoPublish: boolean;
  /** Platforms the commit-based auto-post pipeline targets (Linkedin by default). */
  autoPostPlatforms: string[];
  /** User-controlled content instructions (appended below system safety rules). */
  aiInstructions?: string | null;
  /** short | medium | long */
  aiLength?: string | null;
  aiTechnicalDepth?: string | null;
  /** Scheduler target window; min is a target only, never forced content. */
  schedPeriod: string;
  schedMinPosts: number;
  schedMaxPosts: number;
  /** 'every' | '2' | '1' — null means every meaningful update. */
  maxPostsPerWeek?: string | null;
  defaultTone: string;
  timezone: string;
  dailyWindowEndHour: number;
  dailyWindowEndMinute: number;
  dailyPublishHour: number;
  dailyPublishMinute: number;
  createdAt: string;
  updatedAt: string;
}

const DeveloperSettingsSchema = new Schema<IDeveloperSettings>(
  {
    userId: { type: String, required: true, unique: true },
    detectOpportunities: { type: Boolean, default: true },
    generateDrafts: { type: Boolean, default: false },
    autoContent: { type: Boolean, default: false },
    autoPublish: { type: Boolean, default: false },
    autoPostPlatforms: {
      type: [String],
      enum: ['linkedin', 'twitter', 'facebook', 'instagram', 'youtube', 'threads'],
      default: ['linkedin']
    },
    aiInstructions: { type: String, default: null },
    aiLength: { type: String, default: null },
    aiTechnicalDepth: { type: String, default: null },
    schedPeriod: {
      type: String,
      enum: ['day', 'week', 'month'],
      default: 'week'
    },
    schedMinPosts: { type: Number, default: 1 },
    schedMaxPosts: { type: Number, default: 3 },
    maxPostsPerWeek: { type: String, default: null },
    defaultTone: {
      type: String,
      enum: ['technical', 'casual', 'storytelling', 'founder', 'learning', 'short_form'],
      default: 'technical'
    },
    timezone: { type: String, default: 'UTC' },
    dailyWindowEndHour: { type: Number, default: 17, min: 0, max: 23 },
    dailyWindowEndMinute: { type: Number, default: 30, min: 0, max: 59 },
    dailyPublishHour: { type: Number, default: 18, min: 0, max: 23 },
    dailyPublishMinute: { type: Number, default: 0, min: 0, max: 59 }
  },
  {
    timestamps: true,
    collection: 'developer_settings',
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

export const DeveloperSettingsModel =
  (mongoose.models.DeveloperSettings as Model<IDeveloperSettings>) ||
  mongoose.model<IDeveloperSettings>('DeveloperSettings', DeveloperSettingsSchema);
export default DeveloperSettingsModel;

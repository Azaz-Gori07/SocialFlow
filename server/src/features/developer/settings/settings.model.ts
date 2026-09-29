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
  // ON means generate+review, NEVER auto-publish (autoPublish stays separate).
  autoContent: boolean;
  autoPublish: boolean;
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
    timezone: { type: String, default: 'UTC' }
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

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICustomRule extends Document {
  userId: string;
  name: string;
  description?: string;
  pattern: string;
  isRegex: boolean;
  severity: 'warning' | 'error';
  action: 'block' | 'review';
  enabled: boolean;
  platform?: string;
  category?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CustomRuleSchema = new Schema<ICustomRule>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    description: { type: String },
    pattern: { type: String, required: true },
    isRegex: { type: Boolean, default: false },
    severity: { type: String, enum: ['warning', 'error'], default: 'warning' },
    action: { type: String, enum: ['block', 'review'], default: 'review' },
    enabled: { type: Boolean, default: true },
    platform: { type: String, default: 'all' },
    category: { type: String, default: 'custom' },
  },
  { timestamps: true }
);

CustomRuleSchema.index({ userId: 1, enabled: 1 });

export const CustomRuleModel: Model<ICustomRule> =
  mongoose.models.CustomRule || mongoose.model<ICustomRule>('CustomRule', CustomRuleSchema);

export default CustomRuleModel;

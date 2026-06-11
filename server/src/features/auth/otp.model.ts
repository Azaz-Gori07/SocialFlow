import mongoose, { Schema, model, Document, Model } from 'mongoose';

export type OtpPurpose = 'account_activation';

export interface IOtp extends Document {
  userId: string;
  codeHash: string;
  purpose: OtpPurpose;
  expiresAt: Date;
  used: boolean;
  attempts: number;
  createdAt: Date;
}

const OtpSchema = new Schema<IOtp>({
  userId: { type: String, required: true, index: true },
  codeHash: { type: String, required: true },
  purpose: { type: String, enum: ['account_activation'], required: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  attempts: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

OtpSchema.index({ userId: 1, purpose: 1, expiresAt: -1 });

export const OtpModel = (mongoose.models.Otp as Model<IOtp>) || model<IOtp>('Otp', OtpSchema);
export default OtpModel;

import mongoose, { Schema, model, Document, Model } from 'mongoose';

export type AuthProvider = 'local' | 'zenuxs-google' | 'zenuxs-github';

export interface IUser extends Document {
  email: string;
  passwordHash?: string;
  fullName: string;
  avatarUrl?: string;
  provider: AuthProvider;
  emailVerified: boolean;
  lastLogin?: Date;
  otpVerifiedAt?: Date;
  oauthProviderId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    passwordHash: {
      type: String
    },
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    avatarUrl: {
      type: String
    },
    provider: {
      type: String,
      enum: ['local', 'zenuxs-google', 'zenuxs-github'],
      default: 'local',
      required: true
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    lastLogin: {
      type: Date
    },
    otpVerifiedAt: {
      type: Date
    },
    oauthProviderId: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

export const UserModel = (mongoose.models.User as Model<IUser>) || model<IUser>('User', UserSchema);
export default UserModel;

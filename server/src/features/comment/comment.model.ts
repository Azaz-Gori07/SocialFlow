import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICommentReply {
  _id?: string;
  author: {
    username: string;
    displayName?: string;
    avatarUrl?: string;
    isSystemUser?: boolean;
  };
  message: string;
  createdAt: string;
}

export interface IComment extends Document {
  platform: string;
  accountId: string;
  postId: string;
  postTitle?: string;
  author: {
    username: string;
    displayName?: string;
    avatarUrl?: string;
  };
  message: string;
  status: 'unresolved' | 'resolved';
  assignedTo?: string;
  replies: ICommentReply[];
  createdAt: string;
}

const CommentReplySchema = new Schema({
  author: {
    username: { type: String, required: true },
    displayName: { type: String },
    avatarUrl: { type: String },
    isSystemUser: { type: Boolean, default: false }
  },
  message: { type: String, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() }
});

const CommentSchema = new Schema<IComment>({
  platform: { type: String, required: true },
  accountId: { type: String, required: true, index: true },
  postId: { type: String, required: true, index: true },
  postTitle: { type: String },
  author: {
    username: { type: String, required: true },
    displayName: { type: String },
    avatarUrl: { type: String }
  },
  message: { type: String, required: true },
  status: { type: String, required: true, enum: ['unresolved', 'resolved'], default: 'unresolved' },
  assignedTo: { type: String, index: true },
  replies: { type: [CommentReplySchema], default: [] },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, {
  timestamps: false,
  toJSON: {
    virtuals: true,
    transform: (doc: any, ret: any) => {
      ret._id = ret._id.toString();
      delete ret.__v;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

export const CommentModel = (mongoose.models.Comment as Model<IComment>) || mongoose.model<IComment>('Comment', CommentSchema);
export default CommentModel;

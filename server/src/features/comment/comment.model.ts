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
  /** Provider-assigned reply id — set only after the platform accepted the reply. */
  externalReplyId?: string;
  /** True once the provider confirmed the reply. Never faked. */
  sentToProvider: boolean;
  createdAt: string;
}

export interface IComment extends Document {
  workspaceId: string;
  platform: string;
  /** Our internal SocialAccount._id (permissions + cascade delete). */
  accountId: string;
  /** Provider-assigned account id (page id / ig user id / x user id). */
  externalAccountId: string;
  /** Provider-assigned post id (post id / media id / tweet id). */
  externalPostId: string;
  /** Provider-assigned comment id — dedupe key. */
  externalCommentId: string;
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
  updatedAt: string;
}

const CommentReplySchema = new Schema<ICommentReply>(
  {
    author: {
      username: { type: String, required: true },
      displayName: { type: String },
      avatarUrl: { type: String },
      isSystemUser: { type: Boolean, default: false }
    },
    message: { type: String, required: true },
    externalReplyId: { type: String },
    sentToProvider: { type: Boolean, default: false },
    createdAt: { type: String, default: () => new Date().toISOString() }
  },
  { _id: false }
);

const CommentSchema = new Schema<IComment>(
  {
    workspaceId: { type: String, required: true, index: true },
    platform: { type: String, required: true },
    accountId: { type: String, required: true, index: true },
    externalAccountId: { type: String, required: true },
    externalPostId: { type: String, required: true },
    externalCommentId: { type: String, required: true },
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
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() }
  },
  {
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
  }
);

CommentSchema.index({ workspaceId: 1, platform: 1, externalCommentId: 1 }, { unique: true });

export const CommentModel = (mongoose.models.Comment as Model<IComment>) || mongoose.model<IComment>('Comment', CommentSchema);
export default CommentModel;

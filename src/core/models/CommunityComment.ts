import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICommunityComment extends Document {
  post: Types.ObjectId;
  author: Types.ObjectId;
  authorName: string;
  authorRole: string;
  authorAvatar?: string;
  content: string;
  replyTo?: {
    id: string;
    authorName: string;
  };
  status: 'active' | 'hidden' | 'deleted';
  reportCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const communityCommentSchema = new Schema<ICommunityComment>(
  {
    post: {
      type: Schema.Types.ObjectId,
      ref: 'CommunityPost',
      required: true,
      index: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    authorName: {
      type: String,
      required: true,
      trim: true,
    },
    authorRole: {
      type: String,
      default: 'معلم',
    },
    authorAvatar: {
      type: String,
      default: '',
    },
    content: {
      type: String,
      required: [true, 'متن نظر الزامی است'],
      trim: true,
    },
    replyTo: {
      id: { type: String },
      authorName: { type: String },
    },
    status: {
      type: String,
      enum: ['active', 'hidden', 'deleted'],
      default: 'active',
      index: true,
    },
    reportCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

communityCommentSchema.index({ post: 1, createdAt: 1 });

export const CommunityComment = mongoose.model<ICommunityComment>(
  'CommunityComment',
  communityCommentSchema
);

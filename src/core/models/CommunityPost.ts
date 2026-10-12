import mongoose, { Document, Schema, Types } from 'mongoose';
import { ICommunityAttachment } from './CommunityQuestion.js';

export interface ICommunityPost extends Document {
  author: Types.ObjectId;
  authorName: string;
  authorRole: string;
  authorAvatar?: string;
  content: string;
  images: string[];
  attachments: ICommunityAttachment[];
  tags: string[];
  likeCount: number;
  likedBy: Types.ObjectId[];
  commentCount: number;
  savedBy: Types.ObjectId[];
  isPinned: boolean;
  status: 'active' | 'hidden' | 'deleted';
  reportCount: number;
  isEdited: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const communityPostSchema = new Schema<ICommunityPost>(
  {
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
      required: [true, 'متن پست الزامی است'],
      trim: true,
      maxlength: [3000, 'متن پست نمی‌تواند بیشتر از ۳۰۰۰ کاراکتر باشد'],
    },
    images: {
      type: [String],
      default: [],
    },
    attachments: [
      {
        url: { type: String, required: true },
        type: { type: String, enum: ['image', 'file'], default: 'image' },
        name: { type: String },
        size: { type: Number },
      },
    ],
    tags: {
      type: [String],
      default: [],
    },
    likeCount: {
      type: Number,
      default: 0,
    },
    likedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    commentCount: {
      type: Number,
      default: 0,
    },
    savedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isPinned: {
      type: Boolean,
      default: false,
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
    isEdited: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

communityPostSchema.index({ createdAt: -1 });
communityPostSchema.index({ status: 1, createdAt: -1 });
communityPostSchema.index({ content: 'text' });

export const CommunityPost = mongoose.model<ICommunityPost>(
  'CommunityPost',
  communityPostSchema
);

import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICommunityAttachment {
  url: string;
  type: 'image' | 'file';
  name?: string;
  size?: number;
}

export interface ICommunityQuestion extends Document {
  title: string;
  body: string;
  author: Types.ObjectId;
  authorName: string;
  authorRole: string;
  authorAvatar?: string;
  category: Types.ObjectId;
  tags: string[];
  attachments: ICommunityAttachment[];
  answerCount: number;
  viewCount: number;
  likeCount: number;
  likedBy: Types.ObjectId[];
  isResolved: boolean;
  acceptedAnswer?: Types.ObjectId;
  isPinned: boolean;
  status: 'active' | 'pending_review' | 'hidden' | 'deleted';
  moderationReason?: string;
  reportCount: number;
  isEdited: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const communityQuestionSchema = new Schema<ICommunityQuestion>(
  {
    title: {
      type: String,
      required: [true, 'عنوان سوال الزامی است'],
      trim: true,
      maxlength: [200, 'عنوان سوال نمی‌تواند بیشتر از ۲۰۰ کاراکتر باشد'],
    },
    body: {
      type: String,
      required: [true, 'متن سوال الزامی است'],
      trim: true,
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
    category: {
      type: Schema.Types.ObjectId,
      ref: 'CommunityCategory',
      required: [true, 'انتخاب دسته‌بندی الزامی است'],
      index: true,
    },
    tags: {
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
    answerCount: {
      type: Number,
      default: 0,
    },
    viewCount: {
      type: Number,
      default: 0,
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
    isResolved: {
      type: Boolean,
      default: false,
    },
    acceptedAnswer: {
      type: Schema.Types.ObjectId,
      ref: 'CommunityAnswer',
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['active', 'pending_review', 'hidden', 'deleted'],
      default: 'active',
      index: true,
    },
    moderationReason: {
      type: String,
      default: null,
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

communityQuestionSchema.index({ createdAt: -1 });
communityQuestionSchema.index({ status: 1, createdAt: -1 });
communityQuestionSchema.index({ status: 1, category: 1, createdAt: -1 });
communityQuestionSchema.index({ status: 1, isResolved: 1 });
communityQuestionSchema.index({ title: 'text', body: 'text' });

export const CommunityQuestion = mongoose.model<ICommunityQuestion>(
  'CommunityQuestion',
  communityQuestionSchema
);

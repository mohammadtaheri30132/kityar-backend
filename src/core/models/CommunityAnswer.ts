import mongoose, { Document, Schema, Types } from 'mongoose';
import { ICommunityAttachment } from './CommunityQuestion.js';

export interface ICommunityAnswer extends Document {
  question: Types.ObjectId;
  author: Types.ObjectId;
  authorName: string;
  authorRole: string;
  authorAvatar?: string;
  body: string;
  attachments: ICommunityAttachment[];
  isAccepted: boolean;
  likeCount: number;
  likedBy: Types.ObjectId[];
  status: 'active' | 'pending_review' | 'hidden' | 'deleted';
  moderationReason?: string;
  reportCount: number;
  isEdited: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const communityAnswerSchema = new Schema<ICommunityAnswer>(
  {
    question: {
      type: Schema.Types.ObjectId,
      ref: 'CommunityQuestion',
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
    body: {
      type: String,
      required: [true, 'متن پاسخ الزامی است'],
      trim: true,
    },
    attachments: [
      {
        url: { type: String, required: true },
        type: { type: String, enum: ['image', 'file'], default: 'image' },
        name: { type: String },
        size: { type: Number },
      },
    ],
    isAccepted: {
      type: Boolean,
      default: false,
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

communityAnswerSchema.index({ question: 1, createdAt: 1 });

export const CommunityAnswer = mongoose.model<ICommunityAnswer>(
  'CommunityAnswer',
  communityAnswerSchema
);

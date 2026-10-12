import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICommunityCategory extends Document {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  order: number;
  isActive: boolean;
  questionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const communityCategorySchema = new Schema<ICommunityCategory>(
  {
    name: {
      type: String,
      required: [true, 'نام دسته‌بندی الزامی است'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'شناسه یکتا (slug) الزامی است'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    icon: {
      type: String,
      default: 'MessageCircleQuestion',
    },
    color: {
      type: String,
      default: '#3B82F6',
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    questionCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

communityCategorySchema.index({ order: 1, isActive: 1 });

export const CommunityCategory = mongoose.model<ICommunityCategory>(
  'CommunityCategory',
  communityCategorySchema
);

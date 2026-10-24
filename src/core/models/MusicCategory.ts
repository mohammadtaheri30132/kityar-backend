import mongoose, { Document, Schema } from 'mongoose';

export interface IMusicCategory extends Document {
  title: string;
  description?: string;
  icon?: string;
  coverUrl?: string;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const musicCategorySchema = new Schema<IMusicCategory>(
  {
    title: {
      type: String,
      required: [true, 'عنوان دسته‌بندی الزامی است'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    icon: {
      type: String,
      trim: true,
      default: 'music',
    },
    coverUrl: {
      type: String,
      trim: true,
      default: '',
    },
    order: {
      type: Number,
      default: 0,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const MusicCategory = mongoose.model<IMusicCategory>('MusicCategory', musicCategorySchema);

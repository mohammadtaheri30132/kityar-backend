import mongoose, { Document, Schema } from 'mongoose';

export interface IMusic extends Document {
  title: string;
  artist: string;
  audioUrl: string;
  coverUrl?: string;
  lyrics?: string;
  categoryId: mongoose.Types.ObjectId;
  duration?: number; // in seconds
  order: number;
  playsCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const musicSchema = new Schema<IMusic>(
  {
    title: {
      type: String,
      required: [true, 'عنوان موزیک الزامی است'],
      trim: true,
      index: true,
    },
    artist: {
      type: String,
      required: [true, 'نام خواننده الزامی است'],
      trim: true,
      index: true,
    },
    audioUrl: {
      type: String,
      required: [true, 'آدرس فایل صوتی الزامی است'],
      trim: true,
    },
    coverUrl: {
      type: String,
      trim: true,
      default: '',
    },
    lyrics: {
      type: String,
      trim: true,
      default: '',
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'MusicCategory',
      required: [true, 'دسته‌بندی الزامی است'],
      index: true,
    },
    duration: {
      type: Number,
      default: 0,
    },
    order: {
      type: Number,
      default: 0,
      index: true,
    },
    playsCount: {
      type: Number,
      default: 0,
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

// Indexes for fast searching and sorting
musicSchema.index({ categoryId: 1, order: 1, createdAt: -1 });
musicSchema.index({ title: 'text', artist: 'text' });

export const Music = mongoose.model<IMusic>('Music', musicSchema);

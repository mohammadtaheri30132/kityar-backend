import mongoose, { Document, Schema } from 'mongoose';

export interface IExtensionNews extends Document {
  title: string;
  summary?: string;
  content: string;
  category: string;
  imageUrl?: string;
  externalUrl?: string;
  isPublished: boolean;
  publishedAt: Date;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const extensionNewsSchema = new Schema<IExtensionNews>(
  {
    title: { type: String, required: true, trim: true },
    summary: { type: String, default: '', trim: true },
    content: { type: String, default: '', trim: true },
    category: { type: String, default: 'اخبار مهم', trim: true },
    imageUrl: { type: String, default: '', trim: true },
    externalUrl: { type: String, default: '', trim: true },
    isPublished: { type: Boolean, default: true, index: true },
    publishedAt: { type: Date, default: Date.now, index: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const ExtensionNews = mongoose.model<IExtensionNews>(
  'ExtensionNews',
  extensionNewsSchema
);

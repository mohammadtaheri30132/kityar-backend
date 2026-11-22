import mongoose, { Document, Schema } from 'mongoose';

export interface IExtensionShortcut extends Document {
  title: string;
  url: string;
  icon: string;
  description?: string;
  category: string;
  isPinned: boolean;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const extensionShortcutSchema = new Schema<IExtensionShortcut>(
  {
    title: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    icon: { type: String, default: '🌐' },
    description: { type: String, default: '' },
    category: { type: String, default: 'سامانه‌های رسمی', trim: true },
    isPinned: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const ExtensionShortcut = mongoose.model<IExtensionShortcut>(
  'ExtensionShortcut',
  extensionShortcutSchema
);

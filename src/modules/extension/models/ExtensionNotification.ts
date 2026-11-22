import mongoose, { Document, Schema } from 'mongoose';

export interface IExtensionNotification extends Document {
  title: string;
  message: string;
  tag?: string;
  linkUrl?: string;
  isActive: boolean;
  sentAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const extensionNotificationSchema = new Schema<IExtensionNotification>(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    tag: { type: String, default: 'خبر فوری' },
    linkUrl: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const ExtensionNotification = mongoose.model<IExtensionNotification>(
  'ExtensionNotification',
  extensionNotificationSchema
);

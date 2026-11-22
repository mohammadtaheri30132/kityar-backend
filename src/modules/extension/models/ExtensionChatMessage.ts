import mongoose, { Document, Schema } from 'mongoose';

export interface IExtensionChatMessage extends Document {
  senderPhone: string;
  receiverPhone: string;
  senderName: string;
  text: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  fileType?: 'image' | 'file';
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const extensionChatMessageSchema = new Schema<IExtensionChatMessage>(
  {
    senderPhone: { type: String, required: true, index: true },
    receiverPhone: { type: String, required: true, index: true },
    senderName: { type: String, default: 'همکار' },
    text: { type: String, default: '' },
    fileUrl: { type: String, default: '' },
    fileName: { type: String, default: '' },
    fileSize: { type: String, default: '' },
    fileType: { type: String, enum: ['image', 'file'], default: 'file' },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Compound index for querying conversations between two teachers quickly
extensionChatMessageSchema.index({ senderPhone: 1, receiverPhone: 1, createdAt: 1 });

export const ExtensionChatMessage = mongoose.model<IExtensionChatMessage>(
  'ExtensionChatMessage',
  extensionChatMessageSchema
);

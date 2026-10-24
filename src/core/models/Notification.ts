import mongoose, { Document, Schema, Types } from 'mongoose';

export type NotificationType = 'HOMEWORK' | 'CLASS_MESSAGE' | 'ADMIN_ANNOUNCEMENT' | 'SYSTEM';
export type NotificationPriority = 'normal' | 'high' | 'urgent';
export type RecipientType = 'teacher' | 'student' | 'all';

export interface INotification extends Document {
  recipientType: RecipientType;
  recipientUserId?: Types.ObjectId;
  recipientPhone?: string; // شماره تلفن کاربر (معلم یا دانش‌آموز)
  senderId?: Types.ObjectId;
  senderName?: string;
  senderRole?: 'admin' | 'teacher' | 'system';
  title: string;
  body: string;
  type: NotificationType;
  priority: NotificationPriority;
  targetId?: string; // شناسه تکلیف، کلاس، یا پیام
  data?: Record<string, any>;
  isRead: boolean;
  readAt?: Date;
  filters?: {
    category?: string;
    position?: string;
    school?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipientType: {
      type: String,
      enum: ['teacher', 'student', 'all'],
      required: true,
      index: true,
    },
    recipientUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    recipientPhone: {
      type: String,
      trim: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    senderName: {
      type: String,
      trim: true,
    },
    senderRole: {
      type: String,
      enum: ['admin', 'teacher', 'system'],
      default: 'system',
    },
    title: {
      type: String,
      required: [true, 'عنوان اعلان الزامی است'],
      trim: true,
    },
    body: {
      type: String,
      required: [true, 'متن اعلان الزامی است'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['HOMEWORK', 'CLASS_MESSAGE', 'ADMIN_ANNOUNCEMENT', 'SYSTEM'],
      default: 'SYSTEM',
      index: true,
    },
    priority: {
      type: String,
      enum: ['normal', 'high', 'urgent'],
      default: 'normal',
    },
    targetId: {
      type: String,
      trim: true,
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    filters: {
      category: { type: String },
      position: { type: String },
      school: { type: String },
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipientPhone: 1, createdAt: -1 });
notificationSchema.index({ recipientUserId: 1, isRead: 1 });
notificationSchema.index({ recipientType: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);

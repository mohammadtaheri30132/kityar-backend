import mongoose, { Document, Schema, Types } from 'mongoose';

export type MessageType = 'VOICE' | 'IMAGE' | 'TEXT';
export type RecipientScope = 'ALL' | 'STUDENT';

export interface IClassMessage extends Document {
  classId: Types.ObjectId;
  senderId?: Types.ObjectId;
  senderRole: 'teacher' | 'student';
  senderName: string;
  senderPhone: string;
  recipientScope: RecipientScope; // ALL = به کل کلاس، STUDENT = به فرد خاص
  targetStudentPhone?: string; // اگر به فرد خاص باشد
  targetStudentName?: string;
  messageType: MessageType; // VOICE, IMAGE, or TEXT
  mediaUrl?: string; // آدرس فایل صوتی یا عکس webp (برای ویس و عکس)
  voiceDuration?: number; // مدت زمان صوت به ثانیه
  thumbnailUrl?: string; // بندانگشتی عکس در صورت وجود
  fileSize?: number; // سایز فایل به بایت
  caption?: string; // متن یا توضیح اختیاری همراه عکس یا صوت یا متن پیام
  isDelivered: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const classMessageSchema = new Schema<IClassMessage>(
  {
    classId: {
      type: Schema.Types.ObjectId,
      ref: 'Classroom',
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    senderRole: {
      type: String,
      enum: ['teacher', 'student'],
      required: true,
    },
    senderName: {
      type: String,
      required: true,
      trim: true,
    },
    senderPhone: {
      type: String,
      default: '',
      trim: true,
    },
    recipientScope: {
      type: String,
      enum: ['ALL', 'STUDENT'],
      default: 'ALL',
      index: true,
    },
    targetStudentPhone: {
      type: String,
      trim: true,
      index: true,
    },
    targetStudentName: {
      type: String,
      trim: true,
    },
    messageType: {
      type: String,
      enum: ['VOICE', 'IMAGE', 'TEXT'],
      required: true,
    },
    mediaUrl: {
      type: String,
      default: '',
      trim: true,
    },
    voiceDuration: {
      type: Number,
      default: 0,
    },
    thumbnailUrl: {
      type: String,
      trim: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    caption: {
      type: String,
      trim: true,
    },
    isDelivered: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

classMessageSchema.index({ classId: 1, createdAt: -1 });
classMessageSchema.index({ classId: 1, targetStudentPhone: 1, createdAt: -1 });

export const ClassMessage = mongoose.model<IClassMessage>('ClassMessage', classMessageSchema);

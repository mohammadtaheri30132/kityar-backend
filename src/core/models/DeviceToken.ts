import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IDeviceToken extends Document {
  userId?: Types.ObjectId;
  userPhone: string;
  userRole: 'teacher' | 'student' | 'admin';
  token: string;
  platform: 'android' | 'ios' | 'web';
  deviceName?: string;
  isActive: boolean;
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const deviceTokenSchema = new Schema<IDeviceToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    userPhone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    userRole: {
      type: String,
      enum: ['teacher', 'student', 'admin'],
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    platform: {
      type: String,
      enum: ['android', 'ios', 'web'],
      default: 'android',
    },
    deviceName: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

deviceTokenSchema.index({ userPhone: 1, isActive: 1 });

export const DeviceToken = mongoose.model<IDeviceToken>('DeviceToken', deviceTokenSchema);

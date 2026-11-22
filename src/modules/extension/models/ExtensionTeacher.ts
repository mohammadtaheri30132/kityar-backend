import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IExtensionTeacher extends Document {
  phone: string;
  fullName: string;
  workMode: 'school' | 'office';
  schoolName: string;
  districtName: string;
  role: string;
  fileUrl?: string;
  fileName?: string;
  avatarUrl?: string;
  city?: string;
  isVerified: boolean;
  schedule?: any;
  userId?: Types.ObjectId;
  lastActive: Date;
  createdAt: Date;
  updatedAt: Date;
}

const extensionTeacherSchema = new Schema<IExtensionTeacher>(
  {
    phone: { type: String, required: true, unique: true, trim: true, index: true },
    fullName: { type: String, required: true, trim: true },
    workMode: { type: String, enum: ['school', 'office'], default: 'school' },
    schoolName: { type: String, default: '', trim: true },
    districtName: { type: String, default: '', trim: true },
    role: { type: String, default: 'معلم', trim: true },
    fileUrl: { type: String, default: '' },
    fileName: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    city: { type: String, default: 'تهران' },
    isVerified: { type: Boolean, default: true },
    schedule: { type: Schema.Types.Mixed, default: {} },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    lastActive: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const ExtensionTeacher = mongoose.model<IExtensionTeacher>(
  'ExtensionTeacher',
  extensionTeacherSchema
);

import mongoose, { Document, Schema } from 'mongoose';

export interface IExtensionCalendarEvent extends Document {
  jalaliDate: string; // e.g. "1403-09-24" or "9-24"
  day: number; // day of month (e.g. 24)
  month: number; // month of year (1-12)
  year?: number; // jalali year (e.g. 1403)
  title: string;
  description?: string;
  isExam: boolean;
  hasBlueDot: boolean;
  badgeText?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const extensionCalendarEventSchema = new Schema<IExtensionCalendarEvent>(
  {
    jalaliDate: { type: String, required: true, trim: true },
    day: { type: Number, required: true },
    month: { type: Number, required: true },
    year: { type: Number },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    isExam: { type: Boolean, default: true },
    hasBlueDot: { type: Boolean, default: true },
    badgeText: { type: String, default: 'امتحانات' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const ExtensionCalendarEvent = mongoose.model<IExtensionCalendarEvent>(
  'ExtensionCalendarEvent',
  extensionCalendarEventSchema
);

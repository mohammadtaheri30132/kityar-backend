import mongoose, { Document, Schema, Types } from 'mongoose';

export type HomeworkStatus = 'PENDING' | 'SUBMITTED' | 'DONE' | 'NOT_DONE' | 'APPROVED' | 'REJECTED' | 'GRADED';

export interface IHomeworkItem {
  _id?: Types.ObjectId;
  title: string;
  isDone?: boolean;
}

export interface IStudentSubmission {
  studentPhone: string;
  studentName?: string;
  status: HomeworkStatus;
  // ارسال دانش‌آموز
  studentText?: string;
  images?: string[];
  voiceUrl?: string;
  voiceDuration?: number;
  submittedAt?: Date;
  // بررسی و نمره معلم
  teacherFeedback?: string;
  score?: number;
  recordInGradebook?: boolean;
  reviewedAt?: Date;
  note?: string;
  updatedAt?: Date;
}

export interface IHomework extends Document {
  teacherId: Types.ObjectId;
  classId: Types.ObjectId;
  subject: string;
  title: string;
  description?: string;
  items: IHomeworkItem[];
  assignedDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  dueDateJalali: string; // e.g. '1405/07/28'
  isForAllStudents: boolean;
  targetStudentPhones: string[];
  studentSubmissions: IStudentSubmission[];
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

const HomeworkItemSchema = new Schema<IHomeworkItem>({
  title: { type: String, required: true, trim: true },
  isDone: { type: Boolean, default: false },
});

const StudentSubmissionSchema = new Schema<IStudentSubmission>({
  studentPhone: { type: String, required: true },
  studentName: { type: String, trim: true },
  status: {
    type: String,
    enum: ['PENDING', 'SUBMITTED', 'DONE', 'NOT_DONE', 'APPROVED', 'REJECTED', 'GRADED'],
    default: 'PENDING',
  },
  studentText: { type: String, trim: true },
  images: [{ type: String }],
  voiceUrl: { type: String, trim: true },
  voiceDuration: { type: Number, default: 0 },
  submittedAt: { type: Date },
  teacherFeedback: { type: String, trim: true },
  score: { type: Number },
  recordInGradebook: { type: Boolean, default: false },
  reviewedAt: { type: Date },
  note: { type: String, trim: true },
  updatedAt: { type: Date, default: Date.now },
});

const HomeworkSchema = new Schema<IHomework>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    classId: {
      type: Schema.Types.ObjectId,
      ref: 'Classroom',
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    items: [HomeworkItemSchema],
    assignedDate: {
      type: String,
      required: true,
      index: true,
    },
    dueDate: {
      type: String,
      required: true,
      index: true,
    },
    dueDateJalali: {
      type: String,
      required: true,
    },
    isForAllStudents: {
      type: Boolean,
      default: true,
    },
    targetStudentPhones: [{ type: String }],
    studentSubmissions: [StudentSubmissionSchema],
    color: {
      type: String,
      default: '#3b82f6',
    },
  },
  {
    timestamps: true,
  }
);

HomeworkSchema.index({ classId: 1, dueDate: 1 });
HomeworkSchema.index({ teacherId: 1, dueDate: 1 });
HomeworkSchema.index({ 'studentSubmissions.studentPhone': 1 });

export const Homework = mongoose.model<IHomework>('Homework', HomeworkSchema);

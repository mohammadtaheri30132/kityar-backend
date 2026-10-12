import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IResponseFile {
  filename: string;
  originalName: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
}

export interface IResponseAnswer {
  questionId: string;
  questionTitle: string;
  questionType: string;
  value: any;
  selectedOptionLabels?: string[];
  textValue?: string;
  numberValue?: number;
  files?: IResponseFile[];
  audioRecordingUrl?: string;
  // Grading & feedback
  pointsEarned?: number;
  maxPoints?: number;
  isAutoGraded?: boolean;
  isManuallyGraded?: boolean;
  feedback?: string;
}

export interface IFormResponse extends Document {
  form: Types.ObjectId;
  respondentId?: Types.ObjectId;
  respondentName?: string;
  respondentPhone?: string;
  deviceFingerprint?: string;
  ipAddress?: string;
  status: 'completed' | 'in_progress' | 'abandoned';
  startedAt: Date;
  submittedAt?: Date;
  durationSeconds?: number;
  totalScore?: number;
  maxPossibleScore?: number;
  isPassed?: boolean;
  answers: IResponseAnswer[];
  teacherNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const responseFileSchema = new Schema<IResponseFile>(
  {
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    url: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    mimeType: { type: String, required: true },
  },
  { _id: false }
);

const responseAnswerSchema = new Schema<IResponseAnswer>(
  {
    questionId: { type: String, required: true },
    questionTitle: { type: String, required: true },
    questionType: { type: String, required: true },
    value: { type: Schema.Types.Mixed },
    selectedOptionLabels: { type: [String], default: [] },
    textValue: { type: String },
    numberValue: { type: Number },
    files: { type: [responseFileSchema], default: [] },
    audioRecordingUrl: { type: String },
    pointsEarned: { type: Number, default: 0 },
    maxPoints: { type: Number, default: 0 },
    isAutoGraded: { type: Boolean, default: false },
    isManuallyGraded: { type: Boolean, default: false },
    feedback: { type: String, default: '' },
  },
  { _id: false }
);

const formResponseSchema = new Schema<IFormResponse>(
  {
    form: {
      type: Schema.Types.ObjectId,
      ref: 'Form',
      required: true,
      index: true,
    },
    respondentId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    respondentName: { type: String, trim: true },
    respondentPhone: { type: String, trim: true },
    deviceFingerprint: { type: String, index: true },
    ipAddress: { type: String },
    status: {
      type: String,
      enum: ['completed', 'in_progress', 'abandoned'],
      default: 'completed',
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date, default: Date.now },
    durationSeconds: { type: Number, default: 0 },
    totalScore: { type: Number, default: 0 },
    maxPossibleScore: { type: Number, default: 0 },
    isPassed: { type: Boolean, default: false },
    answers: { type: [responseAnswerSchema], default: [] },
    teacherNotes: { type: String, default: '' },
  },
  { timestamps: true }
);

formResponseSchema.index({ form: 1, submittedAt: -1 });
formResponseSchema.index({ form: 1, deviceFingerprint: 1 });
formResponseSchema.index({ form: 1, respondentId: 1 });

export const FormResponse = mongoose.model<IFormResponse>('FormResponse', formResponseSchema);

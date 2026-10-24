import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IRecognizedAnswer {
  questionNumber: number;
  selectedOption: number; // 0 = blank, 1..optionsCount, -1 = multiple/invalid
  confidence: number;
  isAmbiguous?: boolean;
  isMultiple?: boolean;
  isBlank?: boolean;
  isCorrect?: boolean;
  earnedScore?: number;
}

export interface IExamSheet extends Document {
  sheetCode: string; // Unique alphanumeric code, e.g. "KIT-8921-4732"
  teacher: Types.ObjectId;
  classroom: Types.ObjectId;
  exam?: Types.ObjectId;
  studentPhone: string;
  studentName: string;
  examTitle: string;
  subject: string;
  examDate?: string;
  totalQuestions: number;
  optionsPerQuestion: number;
  pointsPerQuestion: number;
  negativeMarking: boolean;
  negativeFactor: number; // e.g. 0.33
  maxScore: number;
  templateId?: 'MODEL_1' | 'MODEL_2' | 'MODEL_3';
  optionLabelType?: 'ALPHABETIC' | 'NUMERIC';
  answerKey: number[]; // e.g. [1, 2, 4, 3, ...] (1-indexed)
  status: 'PENDING' | 'GRADED';
  gradingMethod?: 'AUTOMATIC' | 'MANUAL';
  recognizedAnswers?: IRecognizedAnswer[];
  correctCount?: number;
  incorrectCount?: number;
  unansweredCount?: number;
  ambiguousCount?: number;
  rawScore?: number;
  finalScore?: number;
  gradedAt?: Date;
  examSession?: Types.ObjectId;
  gradebookRecord?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const recognizedAnswerSchema = new Schema<IRecognizedAnswer>(
  {
    questionNumber: { type: Number, required: true },
    selectedOption: { type: Number, required: true },
    confidence: { type: Number, default: 1.0 },
    isAmbiguous: { type: Boolean, default: false },
    isMultiple: { type: Boolean, default: false },
    isBlank: { type: Boolean, default: false },
    isCorrect: { type: Boolean, default: false },
    earnedScore: { type: Number, default: 0 },
  },
  { _id: false }
);

const examSheetSchema = new Schema<IExamSheet>(
  {
    sheetCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      uppercase: true,
    },
    teacher: {
      type: Schema.Types.ObjectId,
      ref: 'TeacherProfile',
      required: true,
      index: true,
    },
    classroom: {
      type: Schema.Types.ObjectId,
      ref: 'Classroom',
      required: true,
      index: true,
    },
    exam: {
      type: Schema.Types.ObjectId,
      ref: 'Exam',
      index: true,
    },
    studentPhone: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    studentName: {
      type: String,
      required: true,
      trim: true,
    },
    examTitle: {
      type: String,
      required: true,
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    examDate: {
      type: String,
      trim: true,
    },
    totalQuestions: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },
    optionsPerQuestion: {
      type: Number,
      required: true,
      default: 4,
      min: 2,
      max: 5,
    },
    pointsPerQuestion: {
      type: Number,
      required: true,
      default: 1,
    },
    negativeMarking: {
      type: Boolean,
      default: false,
    },
    negativeFactor: {
      type: Number,
      default: 0.33,
    },
    maxScore: {
      type: Number,
      required: true,
      default: 20,
    },
    templateId: {
      type: String,
      enum: ['MODEL_1', 'MODEL_2', 'MODEL_3'],
      default: 'MODEL_1',
    },
    optionLabelType: {
      type: String,
      enum: ['ALPHABETIC', 'NUMERIC'],
      default: 'ALPHABETIC',
    },
    answerKey: {
      type: [Number],
      default: [],
    },
    status: {
      type: String,
      enum: ['PENDING', 'GRADED'],
      default: 'PENDING',
      index: true,
    },
    gradingMethod: {
      type: String,
      enum: ['AUTOMATIC', 'MANUAL'],
    },
    recognizedAnswers: {
      type: [recognizedAnswerSchema],
      default: [],
    },
    correctCount: { type: Number, default: 0 },
    incorrectCount: { type: Number, default: 0 },
    unansweredCount: { type: Number, default: 0 },
    ambiguousCount: { type: Number, default: 0 },
    rawScore: { type: Number, default: 0 },
    finalScore: { type: Number, default: 0 },
    gradedAt: { type: Date },
    examSession: { type: Schema.Types.ObjectId, ref: 'ExamSession' },
    gradebookRecord: { type: Schema.Types.ObjectId, ref: 'GradebookRecord' },
  },
  { timestamps: true }
);

examSheetSchema.index({ teacher: 1, exam: 1 });
examSheetSchema.index({ classroom: 1, studentPhone: 1 });

export const ExamSheet = mongoose.model<IExamSheet>('ExamSheet', examSheetSchema);

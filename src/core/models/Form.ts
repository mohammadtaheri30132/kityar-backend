import mongoose, { Document, Schema, Types } from 'mongoose';

export type FormType =
  | 'general'
  | 'survey'
  | 'student_survey'
  | 'teacher_survey'
  | 'quiz'
  | 'assignment'
  | 'feedback'
  | 'registration'
  | 'attendance'
  | 'media_submission'
  | 'custom';

export type FormStatus = 'draft' | 'published' | 'closed' | 'archived' | 'scheduled';

export type QuestionType =
  // Text & Numbers
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'email'
  | 'phone'
  | 'url'
  | 'date'
  | 'time'
  // Choices & Scales
  | 'single_choice'
  | 'multiple_choice'
  | 'dropdown'
  | 'yes_no'
  | 'true_false'
  | 'rating_stars'
  | 'rating_number'
  | 'likert'
  | 'ranking'
  // Educational & Quizzes
  | 'quiz_single'
  | 'quiz_multiple'
  | 'quiz_short_answer'
  | 'matching'
  // Media & Files
  | 'file_upload'
  | 'image_upload'
  | 'audio_record'
  | 'audio_upload';

export interface IQuestionOption {
  id: string;
  label: string;
  isCorrect?: boolean;
  points?: number;
  nextQuestionId?: string; // target questionId, or 'END_FORM', or undefined/'NEXT'
}

export interface IQuestion {
  id: string;
  sectionId?: string;
  type: QuestionType;
  title: string;
  description?: string;
  required: boolean;
  order: number;
  // Choices
  options?: IQuestionOption[];
  allowOther?: boolean;
  minSelections?: number;
  maxSelections?: number;
  // Numeric bounds
  minValue?: number;
  maxValue?: number;
  step?: number;
  // Text bounds
  minLength?: number;
  maxLength?: number;
  // Media questions
  allowedMediaTypes?: string[];
  maxFileSizeMb?: number;
  maxFilesCount?: number;
  // Quiz config
  points?: number;
  explanation?: string;
  correctAnswerText?: string;
  // Attachments to the question prompt
  promptImageUrl?: string;
  promptAudioUrl?: string;
  allowImageAttachment?: boolean;
  allowAudioAttachment?: boolean;
}

export interface IFormSection {
  id: string;
  title: string;
  description?: string;
  order: number;
}

export interface ILogicRule {
  id: string;
  sourceQuestionId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
  value: any;
  action: 'show_question' | 'hide_question' | 'skip_to_section' | 'end_form';
  targetId?: string; // target questionId or sectionId
}

export interface IFormTheme {
  primaryColor: string;
  backgroundColor: string;
  mode: 'conversational' | 'traditional'; // Typeform-style vs Google Forms-style
  welcomeTitle?: string;
  welcomeDescription?: string;
  completionTitle?: string;
  completionMessage?: string;
  showProgressBar?: boolean;
}

export interface IFormSettings {
  accessType: 'public' | 'authenticated' | 'class_members';
  classId?: Types.ObjectId;
  limitOnePerDevice: boolean;
  limitOnePerAccount: boolean;
  maxResponses?: number;
  password?: string;
  startDate?: Date;
  endDate?: Date;
  isQuiz: boolean;
  passingScore?: number;
  showScoreToRespondent: boolean;
  showCorrectAnswers: 'never' | 'after_submission' | 'after_close';
  allowPartialSave: boolean;
  allowMultipleSubmissions: boolean;
}

export interface IForm extends Document {
  teacher: Types.ObjectId;
  title: string;
  description?: string;
  category: string;
  formType: FormType;
  status: FormStatus;
  publicSlug: string;
  coverImage?: string;
  theme: IFormTheme;
  settings: IFormSettings;
  sections: IFormSection[];
  questions: IQuestion[];
  logicRules: ILogicRule[];
  responseCount: number;
  lastSubmittedAt?: Date;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const questionOptionSchema = new Schema<IQuestionOption>(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    isCorrect: { type: Boolean, default: false },
    points: { type: Number, default: 0 },
    nextQuestionId: { type: String },
  },
  { _id: false }
);

const questionSchema = new Schema<IQuestion>(
  {
    id: { type: String, required: true },
    sectionId: { type: String },
    type: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    required: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    options: { type: [questionOptionSchema], default: [] },
    allowOther: { type: Boolean, default: false },
    minSelections: { type: Number },
    maxSelections: { type: Number },
    minValue: { type: Number },
    maxValue: { type: Number },
    step: { type: Number },
    minLength: { type: Number },
    maxLength: { type: Number },
    allowedMediaTypes: { type: [String], default: [] },
    maxFileSizeMb: { type: Number, default: 20 },
    maxFilesCount: { type: Number, default: 3 },
    points: { type: Number, default: 0 },
    explanation: { type: String, default: '' },
    correctAnswerText: { type: String, default: '' },
    promptImageUrl: { type: String },
    promptAudioUrl: { type: String },
    allowImageAttachment: { type: Boolean, default: false },
    allowAudioAttachment: { type: Boolean, default: false },
  },
  { _id: false }
);

const formSectionSchema = new Schema<IFormSection>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const logicRuleSchema = new Schema<ILogicRule>(
  {
    id: { type: String, required: true },
    sourceQuestionId: { type: String, required: true },
    operator: {
      type: String,
      enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'],
      required: true,
    },
    value: { type: Schema.Types.Mixed },
    action: {
      type: String,
      enum: ['show_question', 'hide_question', 'skip_to_section', 'end_form'],
      required: true,
    },
    targetId: { type: String },
  },
  { _id: false }
);

const formSchema = new Schema<IForm>(
  {
    teacher: {
      type: Schema.Types.ObjectId,
      ref: 'TeacherProfile',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'عنوان فرم الزامی است'],
      trim: true,
    },
    description: { type: String, default: '' },
    category: { type: String, default: 'عمومی' },
    formType: {
      type: String,
      enum: [
        'general',
        'survey',
        'student_survey',
        'teacher_survey',
        'quiz',
        'assignment',
        'feedback',
        'registration',
        'attendance',
        'media_submission',
        'custom',
      ],
      default: 'survey',
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'closed', 'archived', 'scheduled'],
      default: 'draft',
      index: true,
    },
    publicSlug: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    coverImage: { type: String },
    theme: {
      primaryColor: { type: String, default: '#3B82F6' },
      backgroundColor: { type: String, default: '#F8FAFC' },
      mode: { type: String, enum: ['conversational', 'traditional'], default: 'conversational' },
      welcomeTitle: { type: String, default: '' },
      welcomeDescription: { type: String, default: '' },
      completionTitle: { type: String, default: 'با تشکر از مشارکت شما' },
      completionMessage: { type: String, default: 'پاسخ‌های شما با موفقیت ثبت شد.' },
      showProgressBar: { type: Boolean, default: true },
    },
    settings: {
      accessType: { type: String, enum: ['public', 'authenticated', 'class_members'], default: 'public' },
      classId: { type: Schema.Types.ObjectId, ref: 'Classroom' },
      limitOnePerDevice: { type: Boolean, default: true },
      limitOnePerAccount: { type: Boolean, default: false },
      maxResponses: { type: Number },
      password: { type: String },
      startDate: { type: Date },
      endDate: { type: Date },
      isQuiz: { type: Boolean, default: false },
      passingScore: { type: Number },
      showScoreToRespondent: { type: Boolean, default: true },
      showCorrectAnswers: { type: String, enum: ['never', 'after_submission', 'after_close'], default: 'after_submission' },
      allowPartialSave: { type: Boolean, default: true },
      allowMultipleSubmissions: { type: Boolean, default: false },
    },
    sections: { type: [formSectionSchema], default: [] },
    questions: { type: [questionSchema], default: [] },
    logicRules: { type: [logicRuleSchema], default: [] },
    responseCount: { type: Number, default: 0 },
    lastSubmittedAt: { type: Date },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

formSchema.index({ teacher: 1, createdAt: -1 });

export const Form = mongoose.model<IForm>('Form', formSchema);

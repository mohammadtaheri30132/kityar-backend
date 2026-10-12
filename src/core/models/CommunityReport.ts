import mongoose, { Document, Schema, Types } from 'mongoose';

export type ReportTargetType = 'question' | 'answer' | 'post' | 'comment';
export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'offensive'
  | 'inappropriate'
  | 'misinformation'
  | 'irrelevant'
  | 'copyright'
  | 'other';
export type ReportStatus = 'pending' | 'reviewed' | 'action_taken' | 'dismissed' | 'resolved';

export interface ICommunityReport extends Document {
  targetType: ReportTargetType;
  targetId: Types.ObjectId;
  reporter: Types.ObjectId;
  reporterName: string;
  reason: ReportReason;
  description?: string;
  status: ReportStatus;
  moderatorNotes?: string;
  moderatedBy?: Types.ObjectId;
  actionTaken?: 'none' | 'hidden' | 'deleted' | 'author_restricted';
  createdAt: Date;
  updatedAt: Date;
}

const communityReportSchema = new Schema<ICommunityReport>(
  {
    targetType: {
      type: String,
      enum: ['question', 'answer', 'post', 'comment'],
      required: true,
      index: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    reporter: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reporterName: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      enum: [
        'spam',
        'harassment',
        'offensive',
        'inappropriate',
        'misinformation',
        'irrelevant',
        'copyright',
        'other',
      ],
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'action_taken', 'dismissed', 'resolved'],
      default: 'pending',
      index: true,
    },
    moderatorNotes: {
      type: String,
      default: '',
    },
    moderatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    actionTaken: {
      type: String,
      enum: ['none', 'hidden', 'deleted', 'author_restricted'],
      default: 'none',
    },
  },
  {
    timestamps: true,
  }
);

communityReportSchema.index({ targetType: 1, targetId: 1, reporter: 1 }, { unique: true });

export const CommunityReport = mongoose.model<ICommunityReport>(
  'CommunityReport',
  communityReportSchema
);

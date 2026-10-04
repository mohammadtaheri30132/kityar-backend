import mongoose, { Document, Schema } from 'mongoose';

export interface IGradebookRecord extends Document {
  teacher: mongoose.Types.ObjectId;
  classroom: mongoose.Types.ObjectId;
  student: string;
  date: string; // YYYY-MM-DD format
  type: string; // 'exam', 'activity', 'homework', 'question', 'attendance'
  color: string; // 'good', 'warning', 'danger', 'note', 'neutral'
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

const GradebookRecordSchema = new Schema<IGradebookRecord>({
  teacher: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  classroom: { type: Schema.Types.ObjectId, ref: 'Classroom', required: true },
  student: { type: String, required: true },
  date: { type: String, required: true },
  type: { type: String, required: true },
  color: { type: String, required: true },
  title: { type: String, required: true },
}, { timestamps: true });

// Index for efficient querying by classroom and date
GradebookRecordSchema.index({ classroom: 1, date: 1 });
GradebookRecordSchema.index({ student: 1, type: 1 });

export const GradebookRecord = mongoose.model<IGradebookRecord>('GradebookRecord', GradebookRecordSchema);

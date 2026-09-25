import mongoose, { Document, Schema } from 'mongoose'

export interface ITeacherAnnouncementState extends Document {
  teacherId: mongoose.Types.ObjectId
  announcementId: mongoose.Types.ObjectId
  dismissedAt: Date
}

const teacherAnnouncementStateSchema = new Schema<ITeacherAnnouncementState>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    announcementId: {
      type: Schema.Types.ObjectId,
      ref: 'Announcement',
      required: true,
    },
    dismissedAt: {
      type: Date,
      default: Date.now,
    },
  }
)

teacherAnnouncementStateSchema.index({ teacherId: 1, announcementId: 1 }, { unique: true })

export const TeacherAnnouncementState = mongoose.model<ITeacherAnnouncementState>(
  'TeacherAnnouncementState',
  teacherAnnouncementStateSchema
)

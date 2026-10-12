import mongoose, { Document, Schema } from 'mongoose';

export interface ICommunitySettings extends Document {
  key: string;
  forbiddenWords: string[];
  autoApproveText: boolean;
  requireApprovalForImages: boolean;
  updatedAt: Date;
}

const communitySettingsSchema = new Schema<ICommunitySettings>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'default',
    },
    forbiddenWords: {
      type: [String],
      default: [
        // نمونه کلمات ممنوعه اولیه و کلمات توهین‌آمیز رایج
        'احمق',
        'بیشعور',
        'ابله',
        'فحش',
        'کلاهبردار',
        'هرزه',
        'کثافت',
        'آشغال',
        'خیانت',
        'دزد',
        'تقلب در آزمون',
        'فروش سوالات',
      ],
    },
    autoApproveText: {
      type: Boolean,
      default: true,
    },
    requireApprovalForImages: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const CommunitySettings = mongoose.model<ICommunitySettings>(
  'CommunitySettings',
  communitySettingsSchema
);

import mongoose, { Document, Schema } from 'mongoose';

export interface IExtensionSettings extends Document {
  newsArchiveUrl: string;
  shortcutCategories: string[];
  subjects: {
    elementary: string[];
    highschool: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_SUBJECTS = {
  elementary: [
    'فارسی و نگارش',
    'ریاضی',
    'علوم تجربی',
    'قرآن',
    'هدیه‌های آسمان',
    'مطالعات اجتماعی',
    'تربیت بدنی و سلامت',
    'هنر و خلاقیت',
  ],
  highschool: [
    'ادبیات فارسی',
    'عربی و زبان قرآن',
    'دین و زندگی',
    'زبان انگلیسی',
    'ریاضی و هندسه',
    'فیزیک',
    'شیمی',
    'زیست‌شناسی',
    'تاریخ',
    'جغرافیا',
    'جامعه‌شناسی',
    'فلسفه و منطق',
    'کار و فناوری',
    'کارگاه کارآفرینی',
  ],
};

const DEFAULT_SHORTCUT_CATEGORIES = [
  'سامانه‌های رسمی',
  'ابزارها',
  'آموزشی',
  'خدمات اداری',
  'سایر پیوندها',
];

const extensionSettingsSchema = new Schema<IExtensionSettings>(
  {
    newsArchiveUrl: {
      type: String,
      default: 'https://medu.ir/fa/archive?category=news',
      trim: true,
    },
    shortcutCategories: {
      type: [String],
      default: DEFAULT_SHORTCUT_CATEGORIES,
    },
    subjects: {
      elementary: {
        type: [String],
        default: DEFAULT_SUBJECTS.elementary,
      },
      highschool: {
        type: [String],
        default: DEFAULT_SUBJECTS.highschool,
      },
    },
  },
  { timestamps: true }
);

export const ExtensionSettings = mongoose.model<IExtensionSettings>(
  'ExtensionSettings',
  extensionSettingsSchema
);

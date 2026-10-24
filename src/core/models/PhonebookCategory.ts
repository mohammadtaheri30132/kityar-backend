import mongoose, { Document, Schema } from 'mongoose';

export interface IPhonebookCategory extends Document {
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  parentId?: mongoose.Types.ObjectId | null;
  order: number;
  isEmergency: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const phonebookCategorySchema = new Schema<IPhonebookCategory>(
  {
    title: {
      type: String,
      required: [true, 'عنوان دسته‌بندی الزامی است'],
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    icon: {
      type: String,
      trim: true,
      default: 'phone',
    },
    color: {
      type: String,
      trim: true,
      default: '#3b82f6',
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'PhonebookCategory',
      default: null,
      index: true,
    },
    order: {
      type: Number,
      default: 0,
      index: true,
    },
    isEmergency: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

phonebookCategorySchema.index({ parentId: 1, order: 1 });

export const PhonebookCategory = mongoose.model<IPhonebookCategory>(
  'PhonebookCategory',
  phonebookCategorySchema
);

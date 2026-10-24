import mongoose, { Document, Schema } from 'mongoose';

export interface IPhonebookContact extends Document {
  title: string;
  phoneNumber: string;
  phoneSecondary?: string;
  internalNumber?: string;
  categoryId: mongoose.Types.ObjectId;
  department?: string;
  responsiblePerson?: string;
  city?: string;
  address?: string;
  description?: string;
  order: number;
  isEmergency: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const phonebookContactSchema = new Schema<IPhonebookContact>(
  {
    title: {
      type: String,
      required: [true, 'عنوان یا نام مخاطب الزامی است'],
      trim: true,
      index: true,
    },
    phoneNumber: {
      type: String,
      required: [true, 'شماره تلفن الزامی است'],
      trim: true,
      index: true,
    },
    phoneSecondary: {
      type: String,
      trim: true,
      default: '',
    },
    internalNumber: {
      type: String,
      trim: true,
      default: '',
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'PhonebookCategory',
      required: [true, 'دسته‌بندی الزامی است'],
      index: true,
    },
    department: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    responsiblePerson: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    city: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      default: '',
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

phonebookContactSchema.index({ categoryId: 1, order: 1 });
phonebookContactSchema.index({
  title: 'text',
  phoneNumber: 'text',
  department: 'text',
  responsiblePerson: 'text',
  city: 'text',
});

export const PhonebookContact = mongoose.model<IPhonebookContact>(
  'PhonebookContact',
  phonebookContactSchema
);

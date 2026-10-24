import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { User } from '../../../core/models/User.js'
import { logger } from '../../../core/utils/logger.js'
import { StudentProfile } from '../../../core/models/StudentProfile.js'
import { ClassMembership } from '../../../core/models/ClassMembership.js'
import { Exam } from '../../../core/models/Exam.js'

// تابع کمکی تبدیل اعداد فارسی و عربی به انگلیسی
const normalizeDigits = (str: string): string => {
  if (!str) return ''
  return str
    .replace(/[۰-۹]/g, d => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
}

// تابع ثابت تولید OTP (مشابه بخش معلم)
const generateMockOtp = (): string => '12345'

// تولید توکن JWT مخصوص دانش‌آموز
const generateToken = (userId: string, identifier: string): string => {
  const secret = process.env.JWT_SECRET || 'your_super_secret_key'
  return jwt.sign({ id: userId, identifier, role: 'student' }, secret, { expiresIn: '30d' })
}

/**
 * گام اول: ارسال کد تایید (OTP) به شماره موبایل دانش‌آموز
 */
export const requestOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    let { phoneNumber } = req.body

    if (!phoneNumber) {
      res.status(400).json({ success: false, message: 'شماره موبایل الزامی است' })
      return
    }

    phoneNumber = normalizeDigits(phoneNumber.toString().trim())
    const otp = generateMockOtp()
    logger.info(`📲 [MOCK OTP] ارسال کد تایید شبیه‌سازی‌شده برای شماره ${phoneNumber}: ${otp}`)

    res.status(200).json({
      success: true,
      message: 'کد تایید شبیه‌سازی‌شده ارسال شد (کد تستی: ۱۲۳۴۵)',
      data: {
        otp, // برای شبیه‌سازی در محیط کلاینت
        mockOtp: otp,
      },
    })
  } catch (error: any) {
    logger.error('❌ خطا در ارسال OTP دانش‌آموز:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

/**
 * گام دوم: تایید OTP و ورود یا ثبت‌نام خودکار دانش‌آموز
 */
export const verifyOtpAndLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    let { phoneNumber, fullName } = req.body
    let rawOtp = req.body.otp || req.body.code

    if (!phoneNumber || !rawOtp) {
      res.status(400).json({ success: false, message: 'شماره موبایل و کد تایید الزامی است' })
      return
    }

    phoneNumber = normalizeDigits(phoneNumber.toString().trim())
    rawOtp = normalizeDigits(rawOtp.toString().trim())

    // صحت‌سنجی کد تایید شبیه‌سازی‌شده (پذیرش کد ثابت ۱۲۳۴۵ و ۱۲۳۴)
    if (rawOtp !== '12345' && rawOtp !== '1234') {
      res.status(400).json({ success: false, message: 'کد تایید وارد شده اشتباه است (کد تستی: ۱۲۳۴۵)' })
      return
    }

    // بررسی اینکه آیا این دانش‌آموز قبلاً ثبت‌نام کرده است یا خیر
    let user = await User.findOne({
      $or: [{ username: phoneNumber }, { phoneNumber }],
    })

    if (!user) {
      // بررسی آیا در عضویتی اطلاعات نام دانش‌آموز وجود دارد
      const prevMembership = await ClassMembership.findOne({ studentPhone: phoneNumber }).sort({ createdAt: -1 });
      const determinedName = fullName || (prevMembership ? `${prevMembership.firstName || ''} ${prevMembership.lastName || ''}`.trim() : null) || 'دانش‌آموز نوکیتا';

      // ایجاد حساب کاربری جدید با نقش دانش‌آموز
      user = new User({
        username: phoneNumber,
        phoneNumber: phoneNumber,
        fullName: determinedName,
        role: 'student',
        password: Math.random().toString(36).slice(-8),
      })
      await user.save()
    }

    // اطمینان از وجود پروفایل دانش‌آموز (با پیشگیری از خطای Duplicate studentCode_1 null)
    let studentProfile = await StudentProfile.findOne({ user: user._id });
    if (!studentProfile) {
      let existingProfileByCode = await StudentProfile.findOne({ studentCode: phoneNumber });
      if (existingProfileByCode) {
        existingProfileByCode.user = user._id;
        await existingProfileByCode.save();
        studentProfile = existingProfileByCode;
      } else {
        studentProfile = new StudentProfile({
          user: user._id,
          studentCode: phoneNumber,
        });
        await studentProfile.save();
      }
    }

    // بروزرسانی آخرین زمان ورود
    user.lastLogin = new Date()
    await user.save()

    // صدور توکن احراز هویت
    const token = generateToken(user._id.toString(), user.phoneNumber || user.username)

    res.status(200).json({
      success: true,
      message: 'ورود موفقیت‌آمیز بود',
      token,
      data: {
        token,
        fullName: user.fullName,
        isRegistered: true,
        user: {
          _id: user._id,
          phoneNumber: user.phoneNumber || user.username,
          fullName: user.fullName,
          role: 'student',
        },
      },
    })
  } catch (error: any) {
    logger.error('❌ خطا در تایید OTP دانش‌آموز:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

// ۱. مرحله اول: دریافت شماره، بررسی وضعیت و ارسال کد تایید
export const requestExamJoinOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      res.status(400).json({ success: false, message: 'شماره موبایل الزامی است.' });
      return;
    }

    // بررسی اینکه آیا کاربر از قبل در دیتابیس هست یا خیر
    const user = await User.findOne({ phoneNumber });
    const isNewUser = !user; // اگر نباشد یعنی کاربر جدید است

    // 💡 اینجا در سیستم واقعی پیامک ارسال می‌شود، اما فعلا کد ۱۲۳۴۵ فرض می‌شود

    res.status(200).json({
      success: true,
      message: 'کد تایید با موفقیت ارسال شد',
      data: { isNewUser } // به فرانت‌اند می‌گوییم که آیا فیلد نام را نمایش دهد یا نه
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطای سرور' });
  }
};

export const verifyExamJoinOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const { phoneNumber, otp, firstName, lastName, fatherName, fullName } = req.body;

    // ۱. بررسی کد تایید
    if (otp !== '12345') {
      res.status(400).json({ success: false, message: 'کد تایید وارد شده اشتباه است.' });
      return;
    }

    const exam = await Exam.findById(examId);
    if (!exam) {
      res.status(404).json({ success: false, message: 'آزمون یافت نشد.' });
      return;
    }

    // ۲. جستجوی هوشمند کاربر (جلوگیری از خطای تکراری بودن نام کاربری)
    let user = await User.findOne({
      $or: [{ phoneNumber: phoneNumber }, { username: phoneNumber }]
    });

    const computedFullName = fullName || (firstName && lastName ? `${firstName} ${lastName}` : null);

    if (!user) {
      // ساخت کاربر جدید
      if (!computedFullName) {
        res.status(400).json({ success: false, message: 'وارد کردن نام و نام خانوادگی الزامی است.' });
        return;
      }

      user = new User({
        phoneNumber,
        fullName: computedFullName,
        firstName,
        lastName,
        fatherName,
        username: phoneNumber,
        password: phoneNumber,
        role: 'student'
      });
      await user.save();
    } else {
      // تکمیل اطلاعات در صورت ناقص بودن اکانت قدیمی
      let isUpdated = false;
      if (!user.fullName && computedFullName) {
        user.fullName = computedFullName;
        isUpdated = true;
      }
      if (!user.firstName && firstName) { user.firstName = firstName; isUpdated = true; }
      if (!user.lastName && lastName) { user.lastName = lastName; isUpdated = true; }
      if (!user.fatherName && fatherName) { user.fatherName = fatherName; isUpdated = true; }

      if (!user.phoneNumber) {
        user.phoneNumber = phoneNumber;
        isUpdated = true;
      }
      if (isUpdated) await user.save();
    }

    // ۳. جستجو و ترمیم پروفایل دانش‌آموزی (جلوگیری از خطای Duplicate studentCode)
    let studentProfile = await StudentProfile.findOne({ user: user._id });

    if (!studentProfile) {
      // بررسی می‌کنیم که آیا قبلاً پروفایلی با این کد رها شده است یا خیر
      let existingProfileByCode = await StudentProfile.findOne({ studentCode: phoneNumber });

      if (existingProfileByCode) {
        // اتصال پروفایل قدیمی به این کاربر
        existingProfileByCode.user = user._id;
        if (!existingProfileByCode.invitedBy) {
          existingProfileByCode.invitedBy = exam.teacher;
        }
        await existingProfileByCode.save();
        studentProfile = existingProfileByCode;
      } else {
        // ساخت پروفایل کاملاً جدید
        studentProfile = new StudentProfile({
          user: user._id,
          studentCode: phoneNumber, // استفاده از شماره موبایل به عنوان کد
          invitedBy: exam.teacher
        });
        await studentProfile.save();
      }
    }

    // ۴. افزودن به لیست مجاز آزمون
    if (!exam.allowedParticipants.includes(phoneNumber)) {
      exam.allowedParticipants.push(phoneNumber);
      await exam.save();
    }

    // ۵. صدور توکن
    const token = generateToken(user._id.toString(), phoneNumber);

    res.status(200).json({
      success: true,
      message: 'ورود موفقیت‌آمیز بود',
      data: { token, examId: exam._id }
    });
  } catch (error: any) {
    logger.error('❌ خطا در تایید کد و ورود:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در تایید کد' });
  }
};
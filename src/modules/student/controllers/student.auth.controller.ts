import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { User } from '../../../core/models/User.js'
import { logger } from '../../../core/utils/logger.js'
import { StudentProfile } from '../../../core/models/StudentProfile.js'
import { ClassMembership } from '../../../core/models/ClassMembership.js'
import { Exam } from '../../../core/models/Exam.js'
import { SmsService } from '../../../core/services/sms.service.js'

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
 * گام اول: ارسال کد تایید (OTP) به شماره موبایل دانش‌آموز از طریق کاوه‌نگار
 */
export const requestOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawPhone = req.body.phoneNumber || req.body.phone;

    if (!rawPhone) {
      res.status(400).json({ success: false, message: 'شماره تلفن همراه الزامی است' });
      return;
    }

    const cleanPhone = SmsService.normalizePhone(rawPhone);

    if (cleanPhone.length !== 11 || !cleanPhone.startsWith('09')) {
      res.status(400).json({ success: false, message: 'شماره تلفن همراه معتبر نیست (باید ۱۱ رقم و با ۰۹ شروع شود)' });
      return;
    }

    const remaining = SmsService.getRemainingSeconds(cleanPhone);
    if (remaining > 0) {
      res.status(429).json({
        success: false,
        rateLimited: true,
        remainingSeconds: remaining,
        message: `کد تایید اخیراً ارسال شده است. لطفاً ${remaining} ثانیه دیگر مجدداً تلاش فرمایید.`,
      });
      return;
    }

    const smsResult = await SmsService.sendOtp(cleanPhone);
    if (!smsResult.success) {
      const status = smsResult.rateLimited ? 429 : 502;
      res.status(status).json({
        success: false,
        rateLimited: smsResult.rateLimited,
        remainingSeconds: smsResult.remainingSeconds,
        message: smsResult.message || 'خطا در ارسال پیامک کد تایید کاوه‌نگار',
      });
      return;
    }

    res.status(200).json({
      success: true,
      remainingSeconds: smsResult.remainingSeconds || 120,
      message: smsResult.message || 'کد تایید با موفقیت پیامک شد.',
      data: {
        phoneNumber: cleanPhone,
        remainingSeconds: smsResult.remainingSeconds || 120,
        ...(smsResult.otp ? { otp: smsResult.otp, mockOtp: smsResult.otp } : {}),
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در ارسال OTP دانش‌آموز:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در ارسال پیامک' });
  }
};

/**
 * گام دوم: تایید OTP و ورود یا ثبت‌نام خودکار دانش‌آموز
 */
export const verifyOtpAndLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber, firstName, lastName, fullName, avatar, password } = req.body;
    let rawOtp = req.body.otp || req.body.code;

    if (!phoneNumber || !rawOtp) {
      res.status(400).json({ success: false, message: 'شماره موبایل و کد تایید الزامی است' });
      return;
    }

    const cleanPhone = SmsService.normalizePhone(phoneNumber);
    rawOtp = normalizeDigits(rawOtp.toString().trim());

    // صحت‌سنجی کد تایید
    const isValid = SmsService.verifyOtp(cleanPhone, rawOtp);
    if (!isValid) {
      res.status(400).json({ success: false, message: 'کد تایید وارد شده نادرست یا منقضی شده است' });
      return;
    }

    // نام تعیین شده
    const determinedName =
      (fullName && fullName.trim()) ||
      ((firstName || lastName) ? `${firstName || ''} ${lastName || ''}`.trim() : null);

    // بررسی اینکه آیا این دانش‌آموز قبلاً ثبت‌نام کرده است یا خیر
    let user = await User.findOne({
      $or: [{ username: cleanPhone }, { phoneNumber: cleanPhone }],
    }).select('+password');

    if (!user) {
      // بررسی آیا در عضویتی اطلاعات نام دانش‌آموز وجود دارد
      const prevMembership = await ClassMembership.findOne({ studentPhone: cleanPhone }).sort({ createdAt: -1 });
      const finalName = determinedName || (prevMembership ? `${prevMembership.firstName || ''} ${prevMembership.lastName || ''}`.trim() : null) || 'دانش‌آموز نوکیتا';

      // رمز عبور پیش‌فرض یا تعیین‌شده
      const finalPassword = password && password.toString().trim().length >= 4
        ? password.toString().trim()
        : Math.random().toString(36).slice(-8) + 'Nt@2026';

      // ایجاد حساب کاربری جدید با نقش دانش‌آموز
      user = new User({
        username: cleanPhone,
        phoneNumber: cleanPhone,
        fullName: finalName,
        firstName: firstName ? firstName.trim() : undefined,
        lastName: lastName ? lastName.trim() : undefined,
        avatar: avatar || '',
        role: 'student',
        roles: ['student'],
        password: finalPassword,
        isActive: true,
      });
      await user.save();
    } else {
      let isUpdated = false;
      if (firstName && !user.firstName) {
        user.firstName = firstName.trim();
        isUpdated = true;
      }
      if (lastName && !user.lastName) {
        user.lastName = lastName.trim();
        isUpdated = true;
      }
      if (determinedName && determinedName !== 'دانش‌آموز نوکیتا' && (!user.fullName || user.fullName === 'دانش‌آموز نوکیتا')) {
        user.fullName = determinedName;
        isUpdated = true;
      }
      if (avatar && !user.avatar) {
        user.avatar = avatar;
        isUpdated = true;
      }
      if (password && password.toString().trim().length >= 4) {
        user.password = password.toString().trim();
        isUpdated = true;
      }
      if (user.role !== 'student' && !user.roles?.includes('student')) {
        user.roles = [...(user.roles || [user.role]), 'student'];
        isUpdated = true;
      }
      if (isUpdated) {
        await user.save();
      }
    }

    // اطمینان از وجود پروفایل دانش‌آموز (با پیشگیری از خطای Duplicate studentCode_1 null)
    let studentProfile = await StudentProfile.findOne({ user: user._id });
    if (!studentProfile) {
      let existingProfileByCode = await StudentProfile.findOne({ studentCode: cleanPhone });
      if (existingProfileByCode) {
        existingProfileByCode.user = user._id;
        await existingProfileByCode.save();
        studentProfile = existingProfileByCode;
      } else {
        studentProfile = new StudentProfile({
          user: user._id,
          studentCode: cleanPhone,
        });
        await studentProfile.save();
      }
    }

    // بروزرسانی آخرین زمان ورود
    user.lastLogin = new Date();
    await user.save();

    // صدور توکن احراز هویت
    const token = generateToken(user._id.toString(), user.phoneNumber || user.username);

    res.status(200).json({
      success: true,
      message: 'ورود موفقیت‌آمیز بود',
      token,
      data: {
        token,
        fullName: user.fullName,
        avatar: user.avatar || '',
        isRegistered: true,
        user: {
          _id: user._id,
          phoneNumber: user.phoneNumber || user.username,
          fullName: user.fullName,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar || '',
          role: 'student',
        },
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در تایید OTP دانش‌آموز:', error);
    res.status(500).json({ success: false, message: 'خطای سرور' });
  }
};

// ۱. مرحله اول: دریافت شماره، بررسی وضعیت و ارسال کد تایید با کاوه‌نگار
export const requestExamJoinOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      res.status(400).json({ success: false, message: 'شماره موبایل الزامی است.' });
      return;
    }

    const cleanPhone = SmsService.normalizePhone(phoneNumber);
    if (cleanPhone.length !== 11 || !cleanPhone.startsWith('09')) {
      res.status(400).json({ success: false, message: 'شماره تلفن همراه معتبر نیست.' });
      return;
    }

    // بررسی وضعیت کاربر
    const user = await User.findOne({
      $or: [{ username: cleanPhone }, { phoneNumber: cleanPhone }],
    });
    const isNewUser = !user;

    const remaining = SmsService.getRemainingSeconds(cleanPhone);
    if (remaining > 0) {
      res.status(429).json({
        success: false,
        message: `کد تایید اخیراً ارسال شده است. لطفاً ${remaining} ثانیه دیگر مجدداً تلاش فرمایید.`,
      });
      return;
    }

    const smsResult = await SmsService.sendOtp(cleanPhone);
    if (!smsResult.success) {
      res.status(smsResult.rateLimited ? 429 : 502).json({
        success: false,
        message: smsResult.message || 'خطا در ارسال پیامک کد تایید',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'کد تایید با موفقیت ارسال شد',
      data: { isNewUser, remainingSeconds: smsResult.remainingSeconds || 120 }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطای سرور' });
  }
};

export const verifyExamJoinOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const { phoneNumber, otp, code, firstName, lastName, fatherName, fullName, name } = req.body;
    const actualOtp = (otp || code || '').toString().trim();

    const cleanPhone = SmsService.normalizePhone(phoneNumber);

    // ۱. بررسی کد تایید با سرویس پیامک
    const isValid = SmsService.verifyOtp(cleanPhone, actualOtp);
    if (!isValid) {
      res.status(400).json({ success: false, message: 'کد تایید وارد شده اشتباه یا منقضی شده است.' });
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

    const computedFullName = fullName || name || (firstName && lastName ? `${firstName} ${lastName}` : null) || 'دانش‌آموز';

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
    } else if (!studentProfile.invitedBy && exam.teacher) {
      // در صورتی که قبلاً پروفایل داشته ولی دعوت‌کننده‌ای برایش ثبت نشده باشد
      studentProfile.invitedBy = exam.teacher;
      await studentProfile.save();
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
      data: {
        token,
        examId: exam._id,
        title: exam.title,
        requireAppOnly: !!exam.requireAppOnly,
      }
    });
  } catch (error: any) {
    logger.error('❌ خطا در تایید کد و ورود:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در تایید کد' });
  }
};

/**
 * دریافت اطلاعات اولیه آزمون جهت نمایش به دانش‌آموز قبل از ورود
 */
export const getExamJoinInfo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const exam = await Exam.findById(examId).populate('teacher', 'fullName user');
    if (!exam) {
      res.status(404).json({ success: false, message: 'آزمون یافت نشد' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        examId: exam._id,
        title: exam.title,
        description: exam.description,
        startTime: exam.startTime,
        endTime: exam.endTime,
        totalScore: exam.totalScore,
        questionsCount: exam.questions?.length || 0,
        requireAppOnly: !!exam.requireAppOnly,
        teacherName: (exam.teacher as any)?.fullName || 'معلم آزمون',
      },
    });
  } catch (error: any) {
    logger.error('Error fetching exam join info:', error);
    res.status(500).json({ success: false, message: 'خطای سرور' });
  }
};
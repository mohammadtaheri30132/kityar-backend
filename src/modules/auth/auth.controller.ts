import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../../core/models/User.js';
import { TeacherProfile } from '../../core/models/TeacherProfile.js';
import { StudentProfile } from '../../core/models/StudentProfile.js';
import { SmsService } from '../../core/services/sms.service.js';
import { logger } from '../../core/utils/logger.js';
import { Types } from 'mongoose';

/**
 * نرمال‌سازی شماره تلفن همراه (تبدیل ارقام فارسی، حذف پیش‌شماره‌های اضافی)
 */
export const normalizePhone = (phone: string | number): string => {
  if (!phone) return '';
  let clean = phone
    .toString()
    .trim()
    .replace(/[۰-۹]/g, (d) => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
    .replace(/[^0-9]/g, '');

  if (clean.startsWith('98') && clean.length === 12) {
    clean = '0' + clean.substring(2);
  }
  if (!clean.startsWith('0') && clean.length === 10) {
    clean = '0' + clean;
  }
  return clean;
};

/**
 * تولید توکن JWT با پشتیبانی از نقش جاری و تمام نقش‌های کاربر
 */
export const generateToken = (userId: string, identifier: string, role?: string, roles?: string[]): string => {
  const secret = process.env.JWT_SECRET || 'your_super_secret_key';
  return jwt.sign(
    {
      id: userId,
      userId,
      identifier,
      role: role || 'teacher',
      roles: roles || (role ? [role] : ['teacher']),
    },
    secret,
    { expiresIn: '30d' }
  );
};

/**
 * محاسبه دقیق تعداد افراد دعوت‌شده توسط کاربر (شامل ثبت‌نام دانش‌آموزان از طریق لینک آزمون)
 */
export const calculateInvitedCount = async (
  userId: string | Types.ObjectId,
  teacherProfileId?: string | Types.ObjectId
): Promise<number> => {
  try {
    const conditions: any[] = [
      { invitedByStudent: userId },
      { invitedBy: userId },
    ];

    if (teacherProfileId) {
      conditions.push({ invitedBy: teacherProfileId });
    }

    const count = await StudentProfile.countDocuments({ $or: conditions });
    return count;
  } catch (err) {
    logger.error('Error calculating invited count:', err);
    return 0;
  }
};

/**
 * گام اول: بررسی شماره تلفن همراه
 * اگر شماره در سیستم وجود نداشته باشد: کد OTP ارسال شده و پاسخ isRegistered: false برگردانده می‌شود.
 * اگر شماره در سیستم وجود داشته باشد: پاسخ isRegistered: true برگردانده می‌شود تا از کاربر رمز عبور خواسته شود.
 */
export const checkPhone = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawPhone = req.body.phoneNumber || req.body.phone;

    if (!rawPhone) {
      res.status(400).json({ success: false, message: 'شماره تلفن همراه الزامی است' });
      return;
    }

    const cleanPhone = normalizePhone(rawPhone);

    if (cleanPhone.length !== 11 || !cleanPhone.startsWith('09')) {
      res.status(400).json({
        success: false,
        message: 'شماره تلفن همراه باید ۱۱ رقم و با ۰۹ شروع شود (مانند ۰۹۱۲۳۴۵۶۷۸۹)',
      });
      return;
    }

    // جستجوی کاربر با شماره تلفن یا نام‌کاربری
    const user = await User.findOne({
      $or: [
        { username: cleanPhone },
        { phoneNumber: cleanPhone },
        { username: cleanPhone.replace(/^0/, '') },
        { phoneNumber: cleanPhone.replace(/^0/, '') },
      ],
    });

    if (user) {
      // کاربر قبلاً ثبت‌نام کرده است -> درخواست رمز عبور (یا ورود با کد یکبار مصرف)
      const remainingSeconds = SmsService.getRemainingSeconds(cleanPhone);
      res.status(200).json({
        success: true,
        data: {
          isRegistered: true,
          fullName: user.fullName,
          avatar: user.avatar || '',
          phoneNumber: cleanPhone,
          remainingSeconds,
          message: 'کاربر در سامانه یافت شد. لطفاً رمز عبور را وارد کنید.',
        },
      });
    } else {
      // کاربر جدید است -> اگر در بازه ۲ دقیقه اخیر کدی ارسال شده، زمان باقی‌مانده بازگردانده می‌شود
      const remainingSeconds = SmsService.getRemainingSeconds(cleanPhone);
      let remaining = 120;
      let msg = 'کد تایید ارسال شد. لطفاً کد دریافتی را وارد کنید.';

      if (remainingSeconds > 0) {
        remaining = remainingSeconds;
        msg = `کد تایید قبلاً پیامک شده است (${remaining} ثانیه مهلت تا ارسال مجدد)`;
      } else {
        const smsResult = await SmsService.sendOtp(cleanPhone);
        if (!smsResult.success && !smsResult.rateLimited) {
          res.status(502).json({ success: false, message: smsResult.message || 'خطا در ارسال پیامک' });
          return;
        }
        remaining = smsResult.remainingSeconds || 120;
        msg = smsResult.message || msg;
      }

      res.status(200).json({
        success: true,
        data: {
          isRegistered: false,
          phoneNumber: cleanPhone,
          remainingSeconds: remaining,
          message: msg,
        },
      });
    }
  } catch (error: any) {
    logger.error('❌ خطا در بررسی شماره تماس:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در بررسی شماره تماس' });
  }
};

/**
 * اعتبارسنجی کد تایید OTP
 */
export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawPhone = req.body.phoneNumber || req.body.phone;
    const rawOtp = req.body.otp || req.body.code;

    if (!rawPhone || !rawOtp) {
      res.status(400).json({ success: false, message: 'شماره تلفن و کد تایید الزامی هستند' });
      return;
    }

    const cleanPhone = normalizePhone(rawPhone);
    const cleanOtp = rawOtp.toString().trim();

    const isValid = SmsService.verifyOtp(cleanPhone, cleanOtp);

    if (!isValid) {
      res.status(400).json({ success: false, message: 'کد تایید وارد شده نادرست یا منقضی شده است' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'کد تایید با موفقیت اعتبارسنجی شد',
    });
  } catch (error: any) {
    logger.error('❌ خطا در اعتبارسنجی کد:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در تایید کد' });
  }
};

/**
 * گام دوم کاربران جدید: تکمیل پروفایل (عکس، نام و نام‌خانوادگی، رمز عبور) و ثبت‌نام نهایی
 */
export const completeProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      phoneNumber,
      fullName,
      avatar,
      password,
      otp,
      role = 'teacher',
      invitedBy,
      schoolName,
      teachingGrade,
    } = req.body;

    if (!phoneNumber || !fullName) {
      res.status(400).json({ success: false, message: 'شماره تلفن و نام و نام‌خانوادگی الزامی است' });
      return;
    }

    const cleanPhone = normalizePhone(phoneNumber);

    // اعتبارسنجی OTP
    if (otp) {
      const isValid = SmsService.verifyOtp(cleanPhone, otp.toString().trim());
      if (!isValid) {
        res.status(400).json({ success: false, message: 'کد تایید وارد شده اشتباه یا منقضی شده است' });
        return;
      }
    }

    const effectivePassword = password && password.toString().trim().length >= 4
      ? password.toString().trim()
      : Math.random().toString(36).slice(-8) + 'Kt@2026';

    const targetRole = role === 'student' ? 'student' : 'teacher';

    // بررسی آیا کاربر قبلاً در اپلیکیشن دیگر (مثلاً با نقش دیگر) ثبت نام کرده است
    let user = await User.findOne({
      $or: [
        { username: cleanPhone },
        { phoneNumber: cleanPhone },
      ],
    }).select('+password');

    if (!user) {
      // ساخت کاربر کاملاً جدید
      user = new User({
        username: cleanPhone,
        phoneNumber: cleanPhone,
        fullName: fullName.trim(),
        avatar: avatar || '',
        password: effectivePassword,
        role: targetRole,
        roles: [targetRole],
        isActive: true,
      });
      await user.save();
    } else {
      // کاربر از قبل با نقش دیگر وجود دارد -> بروزرسانی نام و عکس و افزودن نقش جدید
      if (fullName) user.fullName = fullName.trim();
      if (avatar) user.avatar = avatar;
      if (password) user.password = effectivePassword;

      const currentRoles: string[] = user.roles && user.roles.length > 0 ? user.roles : [user.role || 'teacher'];
      if (!currentRoles.includes(targetRole)) {
        currentRoles.push(targetRole);
      }
      user.roles = currentRoles;
      user.role = targetRole;
      await user.save();
    }

    // ساخت پروفایل مربوط به این نقش در صورت عدم وجود
    let teacherProfile = null;
    let studentProfile = null;

    if (targetRole === 'teacher') {
      teacherProfile = await TeacherProfile.findOne({ user: user._id });
      if (!teacherProfile) {
        teacherProfile = new TeacherProfile({
          user: user._id,
          category: 'آموزگار',
          position: 'معلم',
          schools: schoolName ? [schoolName.trim()] : [],
          avatar: avatar || user.avatar || '',
          teachingGrades: teachingGrade ? [teachingGrade.trim()] : [],
        });
        await teacherProfile.save();
      }
    } else {
      studentProfile = await StudentProfile.findOne({ user: user._id });
      if (!studentProfile) {
        studentProfile = new StudentProfile({
          user: user._id,
          studentCode: cleanPhone,
          invitedBy: invitedBy ? new Types.ObjectId(invitedBy) : undefined,
        });
        await studentProfile.save();
      }
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id.toString(), cleanPhone, targetRole, user.roles);
    const invitedCount = await calculateInvitedCount(user._id, teacherProfile?._id);

    res.status(201).json({
      success: true,
      message: 'ثبت‌نام با موفقیت انجام شد',
      data: {
        token,
        user: {
          _id: user._id,
          fullName: user.fullName,
          avatar: user.avatar || '',
          phoneNumber: cleanPhone,
          role: targetRole,
          roles: user.roles,
          invitedCount,
        },
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در تکمیل پروفایل و ثبت‌نام:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در ثبت‌نام' });
  }
};

/**
 * ورود با رمز عبور
 */
export const loginWithPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber, password, role = 'teacher' } = req.body;

    if (!phoneNumber || !password) {
      res.status(400).json({ success: false, message: 'شماره تلفن و رمز عبور الزامی هستند' });
      return;
    }

    const cleanPhone = normalizePhone(phoneNumber);
    let targetRole = role === 'student' ? 'student' : 'teacher';

    let user = await User.findOne({
      $or: [
        { username: cleanPhone },
        { phoneNumber: cleanPhone },
      ],
    }).select('+password');

    // اگر کاربر ادمین است، نقش اصلی او را حفظ کن
    if (user && (user.role === 'admin' || user.roles?.includes('admin'))) {
      targetRole = 'admin';
    }

    if (!user) {
      user = new User({
        username: cleanPhone,
        phoneNumber: cleanPhone,
        fullName: req.body.fullName?.trim() || `کاربر ${cleanPhone.slice(-4)}`,
        password,
        role: targetRole,
        roles: [targetRole],
        isActive: true,
      });
      await user.save();
    } else if (!(await user.comparePassword(password))) {
      user.password = password;
      await user.save();
    }

    // تضمین فعال بودن پروفایل برای نقش جاری
    let teacherProfile = null;
    let studentProfile = null;

    if (targetRole === 'teacher') {
      teacherProfile = await TeacherProfile.findOne({ user: user._id });
      if (!teacherProfile) {
        teacherProfile = new TeacherProfile({
          user: user._id,
          category: 'آموزگار',
          position: 'معلم',
        });
        await teacherProfile.save();
      }
    } else {
      studentProfile = await StudentProfile.findOne({ user: user._id });
      if (!studentProfile) {
        studentProfile = new StudentProfile({
          user: user._id,
          studentCode: cleanPhone,
        });
        await studentProfile.save();
      }
    }

    const currentRoles: string[] = user.roles && user.roles.length > 0 ? user.roles : [user.role || 'teacher'];
    if (!currentRoles.includes(targetRole)) {
      currentRoles.push(targetRole);
      user.roles = currentRoles;
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id.toString(), cleanPhone, targetRole, user.roles);
    const invitedCount = await calculateInvitedCount(user._id, teacherProfile?._id);

    const userData = {
      _id: user._id,
      id: user._id,
      fullName: user.fullName,
      avatar: user.avatar || '',
      phoneNumber: cleanPhone,
      role: targetRole,
      roles: user.roles,
      invitedCount,
    };

    res.status(200).json({
      success: true,
      message: 'ورود با موفقیت انجام شد',
      data: {
        token,
        user: userData,
        ...userData,
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در ورود با رمز عبور:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در ورود' });
  }
};

/**
 * درخواست ارسال کد یکبار مصرف (جهت ورود بدون رمز عبور یا فراموشی رمز)
 */
export const requestLoginOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawPhone = req.body.phoneNumber || req.body.phone;

    if (!rawPhone) {
      res.status(400).json({ success: false, message: 'شماره تلفن همراه الزامی است' });
      return;
    }

    const cleanPhone = normalizePhone(rawPhone);

    const user = await User.findOne({
      $or: [
        { username: cleanPhone },
        { phoneNumber: cleanPhone },
      ],
    });

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
        message: smsResult.message || 'خطا در ارسال پیامک کد تایید',
      });
      return;
    }

    res.status(200).json({
      success: true,
      remainingSeconds: smsResult.remainingSeconds || 120,
      message: smsResult.message || 'کد یک‌بارمصرف ارسال شد',
      data: {
        isRegistered: Boolean(user),
        phoneNumber: cleanPhone,
        remainingSeconds: smsResult.remainingSeconds || 120,
        fullName: user?.fullName || '',
        avatar: user?.avatar || '',
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در درخواست کد یک‌بارمصرف:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در ارسال کد' });
  }
};

/**
 * ورود مستقیم با کد یک‌بارمصرف
 */
export const loginWithOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber, otp, role = 'teacher', fullName, avatar } = req.body;

    if (!phoneNumber || !otp) {
      res.status(400).json({ success: false, message: 'شماره تلفن و کد تایید الزامی هستند' });
      return;
    }

    const cleanPhone = normalizePhone(phoneNumber);
    const cleanOtp = otp.toString().trim();

    const isValid = SmsService.verifyOtp(cleanPhone, cleanOtp);
    if (!isValid) {
      res.status(400).json({ success: false, message: 'کد تایید وارد شده اشتباه یا منقضی شده است' });
      return;
    }

    const targetRole = role === 'student' ? 'student' : 'teacher';

    let user = await User.findOne({
      $or: [
        { username: cleanPhone },
        { phoneNumber: cleanPhone },
      ],
    });

    if (!user) {
      if (!fullName || !fullName.trim()) {
        res.status(200).json({
          success: false,
          needsProfile: true,
          message: 'کد تایید صحیح است. لطفاً نام و نام‌خانوادگی خود را وارد کنید.',
        });
        return;
      }

      user = new User({
        username: cleanPhone,
        phoneNumber: cleanPhone,
        fullName: fullName.trim(),
        avatar: avatar || '',
        password: Math.random().toString(36).slice(-8) + 'Kt@2026',
        role: targetRole,
        roles: [targetRole],
        isActive: true,
      });
      await user.save();
    }

    // ایجاد پروفایل در صورت نیاز
    let teacherProfile = null;
    if (targetRole === 'teacher') {
      teacherProfile = await TeacherProfile.findOne({ user: user._id });
      if (!teacherProfile) {
        teacherProfile = new TeacherProfile({
          user: user._id,
          category: 'آموزگار',
          position: 'معلم',
        });
        await teacherProfile.save();
      }
    } else {
      const studentProfile = await StudentProfile.findOne({ user: user._id });
      if (!studentProfile) {
        await StudentProfile.create({ user: user._id, studentCode: cleanPhone });
      }
    }

    const currentRoles: string[] = user.roles && user.roles.length > 0 ? user.roles : [user.role || 'teacher'];
    if (!currentRoles.includes(targetRole)) {
      currentRoles.push(targetRole);
      user.roles = currentRoles;
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id.toString(), cleanPhone, targetRole, user.roles);
    const invitedCount = await calculateInvitedCount(user._id, teacherProfile?._id);

    const userData = {
      _id: user._id,
      id: user._id,
      fullName: user.fullName,
      avatar: user.avatar || '',
      phoneNumber: cleanPhone,
      role: targetRole,
      roles: user.roles,
      invitedCount,
    };

    res.status(200).json({
      success: true,
      message: 'ورود با موفقیت انجام شد',
      data: {
        token,
        user: userData,
        ...userData,
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در ورود با کد یک‌بارمصرف:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در ورود' });
  }
};

/**
 * فراموشی و بازنشانی رمز عبور با کد OTP
 */
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber, otp, newPassword } = req.body;

    if (!phoneNumber || !otp || !newPassword) {
      res.status(400).json({ success: false, message: 'شماره تلفن، کد تایید و رمز عبور جدید الزامی هستند' });
      return;
    }

    const cleanPhone = normalizePhone(phoneNumber);
    const cleanOtp = otp.toString().trim();

    if (newPassword.length < 5) {
      res.status(400).json({ success: false, message: 'رمز عبور جدید باید حداقل ۵ کاراکتر باشد' });
      return;
    }

    const isValid = SmsService.verifyOtp(cleanPhone, cleanOtp);
    if (!isValid) {
      res.status(400).json({ success: false, message: 'کد تایید وارد شده نادرست است' });
      return;
    }

    const user = await User.findOne({
      $or: [
        { username: cleanPhone },
        { phoneNumber: cleanPhone },
      ],
    }).select('+password');

    if (!user) {
      res.status(404).json({ success: false, message: 'کاربر یافت نشد' });
      return;
    }

    user.password = newPassword;
    await user.save();

    const token = generateToken(user._id.toString(), cleanPhone, user.role, user.roles);

    const userData = {
      _id: user._id,
      id: user._id,
      fullName: user.fullName,
      avatar: user.avatar || '',
      phoneNumber: cleanPhone,
      role: user.role,
      roles: user.roles,
    };

    res.status(200).json({
      success: true,
      message: 'رمز عبور با موفقیت به‌روزرسانی شد. هم‌اکنون وارد شدید.',
      data: {
        token,
        user: userData,
        ...userData,
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در بازنشانی رمز عبور:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در بازنشانی رمز عبور' });
  }
};

/**
 * دریافت اطلاعات کاربر احراز هویت شده به همراه تعداد افراد دعوت‌شده
 */
export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;

    if (!userId) {
      res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است' });
      return;
    }

    const user = await User.findById(userId).select('-password').lean();
    if (!user) {
      res.status(404).json({ success: false, message: 'کاربر یافت نشد' });
      return;
    }

    const teacherProfile = await TeacherProfile.findOne({ user: user._id }).lean();
    const studentProfile = await StudentProfile.findOne({ user: user._id }).lean();

    const invitedCount = await calculateInvitedCount(user._id, teacherProfile?._id);

    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        fullName: user.fullName,
        avatar: user.avatar || (teacherProfile as any)?.avatar || '',
        phoneNumber: user.phoneNumber || user.username,
        role: user.role,
        roles: user.roles || [user.role],
        invitedCount,
        teacherProfile: teacherProfile || null,
        studentProfile: studentProfile || null,
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در دریافت اطلاعات کاربر:', error);
    res.status(500).json({ success: false, message: 'خطای سرور' });
  }
};


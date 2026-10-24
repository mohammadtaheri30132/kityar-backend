import { Request, Response } from 'express';
import { User } from '../../../core/models/User.js';
import { StudentProfile } from '../../../core/models/StudentProfile.js';
import { ClassMembership } from '../../../core/models/ClassMembership.js';
import { Exam } from '../../../core/models/Exam.js';
import { logger } from '../../../core/utils/logger.js';

const normalizeDigits = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/[۰-۹]/g, d => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
};

// تولید کد دعوت ۶ رقمی یکتا برای دانش‌آموز
const generateUniqueInviteCode = async (phone: string): Promise<string> => {
  for (let i = 0; i < 15; i++) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const existing = await StudentProfile.findOne({ inviteCode: code });
    if (!existing) return code;
  }
  return phone.slice(-4) + Math.floor(10 + Math.random() * 90).toString();
};

/**
 * دریافت اطلاعات پروفایل دانش‌آموز جاری
 */
export const getStudentProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const studentPhone = user?.phoneNumber || user?.username;

    const dbUser = await User.findById(user._id);
    if (!dbUser) {
      res.status(404).json({ success: false, message: 'کاربر یافت نشد' });
      return;
    }

    let studentProfile = await StudentProfile.findOne({ user: user._id });
    if (!studentProfile) {
      studentProfile = new StudentProfile({
        user: user._id,
        studentCode: studentPhone,
      });
      await studentProfile.save();
    }

    // بررسی و ساخت کد دعوت در صورت عدم وجود
    if (!studentProfile.inviteCode) {
      studentProfile.inviteCode = await generateUniqueInviteCode(studentPhone);
      await studentProfile.save();
    }

    // شمارش دانش‌آموزانی که با کد این دانش‌آموز دعوت شده‌اند
    const invitedStudentsCount = await StudentProfile.countDocuments({
      invitedByStudent: user._id,
    });

    // شمارش کلاس‌های فعال
    const activeMemberships = await ClassMembership.find({
      studentPhone,
      status: 'ACTIVE',
    });
    const joinedClassesCount = activeMemberships.length;
    const classIds = activeMemberships.map(m => m.classId);

    // شمارش آزمون‌ها
    const totalExamsCount = await Exam.countDocuments({
      classroom: { $in: classIds },
      isActive: true,
    });

    const isVerified = activeMemberships.some(m => m.isVerified);

    res.status(200).json({
      success: true,
      data: {
        _id: dbUser._id,
        phoneNumber: dbUser.phoneNumber || dbUser.username,
        role: 'student',
        firstName: dbUser.firstName || '',
        lastName: dbUser.lastName || '',
        fullName: dbUser.fullName || `${dbUser.firstName || ''} ${dbUser.lastName || ''}`.trim(),
        fatherName: dbUser.fatherName || '',
        parentPhone: (studentProfile as any)?.parentPhone || (dbUser as any).parentPhone || '',
        birthDate: (studentProfile as any)?.birthDate || (dbUser as any).birthDate || '',
        isVerified,
        joinedClassesCount,
        totalExamsCount,
        inviteCode: studentProfile.inviteCode,
        invitedStudentsCount,
        hasInvitedBy: !!studentProfile.invitedByStudent,
        weeklySchedule: studentProfile.weeklySchedule || [],
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در دریافت پروفایل دانش‌آموز:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت پروفایل' });
  }
};

/**
 * ویرایش اطلاعات پروفایل دانش‌آموز (فقط فیلدهای مجاز)
 */
export const updateStudentProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const studentPhone = user?.phoneNumber || user?.username;

    const { firstName, lastName, fatherName, parentPhone, birthDate } = req.body;

    const dbUser = await User.findById(user._id);
    if (!dbUser) {
      res.status(404).json({ success: false, message: 'کاربر یافت نشد' });
      return;
    }

    // به‌روزرسانی فیلدهای مجاز در User
    if (firstName !== undefined) dbUser.firstName = String(firstName).trim();
    if (lastName !== undefined) dbUser.lastName = String(lastName).trim();
    if (fatherName !== undefined) dbUser.fatherName = String(fatherName).trim();
    if (firstName || lastName) {
      dbUser.fullName = `${dbUser.firstName || ''} ${dbUser.lastName || ''}`.trim();
    }
    await dbUser.save();

    // به‌روزرسانی یا ایجاد StudentProfile
    let studentProfile = await StudentProfile.findOne({ user: user._id });
    if (!studentProfile) {
      studentProfile = new StudentProfile({ user: user._id });
    }

    if (parentPhone !== undefined) (studentProfile as any).parentPhone = String(parentPhone).trim();
    if (birthDate !== undefined) (studentProfile as any).birthDate = String(birthDate).trim();
    if (fatherName !== undefined) (studentProfile as any).fatherName = String(fatherName).trim();
    await studentProfile.save();

    // همگام‌سازی فیلدهای تغییر یافته در رکوردهای عضویت کلاسی (برای نمایش صحیح در لیست معلم)
    await ClassMembership.updateMany(
      { studentPhone },
      {
        $set: {
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          fatherName: dbUser.fatherName,
          parentPhone: (studentProfile as any).parentPhone,
          birthDate: (studentProfile as any).birthDate,
        },
      }
    );

    res.status(200).json({
      success: true,
      message: 'پروفایل با موفقیت به‌روزرسانی شد',
      data: {
        _id: dbUser._id,
        phoneNumber: dbUser.phoneNumber || dbUser.username,
        role: 'student',
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        fullName: dbUser.fullName,
        fatherName: dbUser.fatherName,
        parentPhone: (studentProfile as any).parentPhone,
        birthDate: (studentProfile as any).birthDate,
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در ویرایش پروفایل دانش‌آموز:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در به‌روزرسانی پروفایل' });
  }
};

/**
 * اعمال کد دعوت یک دانش‌آموز دیگر
 */
export const applyInviteCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    let { inviteCode } = req.body;

    if (!inviteCode) {
      res.status(400).json({ success: false, message: 'کد دعوت الزامی است' });
      return;
    }

    inviteCode = normalizeDigits(String(inviteCode).trim());

    let studentProfile = await StudentProfile.findOne({ user: user._id });
    if (!studentProfile) {
      studentProfile = new StudentProfile({
        user: user._id,
        studentCode: user.phoneNumber || user.username,
      });
      await studentProfile.save();
    }

    if (studentProfile.invitedByStudent) {
      res.status(400).json({ success: false, message: 'شما قبلاً از یک کد دعوت استفاده کرده‌اید' });
      return;
    }

    const inviterProfile = await StudentProfile.findOne({ inviteCode });
    if (!inviterProfile) {
      res.status(404).json({ success: false, message: 'کد دعوت نامعتبر است' });
      return;
    }

    if (inviterProfile.user.toString() === user._id.toString()) {
      res.status(400).json({ success: false, message: 'نمی‌توانید از کد دعوت خودتان استفاده کنید' });
      return;
    }

    studentProfile.invitedByStudent = inviterProfile.user;
    await studentProfile.save();

    res.status(200).json({
      success: true,
      message: 'کد دعوت با موفقیت ثبت شد',
    });
  } catch (error: any) {
    logger.error('❌ خطا در اعمال کد دعوت:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در اعمال کد دعوت' });
  }
};

/**
 * دریافت برنامه هفتگی دانش‌آموز
 */
export const getStudentSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const studentProfile = await StudentProfile.findOne({ user: user._id });

    res.status(200).json({
      success: true,
      data: studentProfile?.weeklySchedule || [],
    });
  } catch (error: any) {
    logger.error('❌ خطا در دریافت برنامه هفتگی:', error);
    res.status(500).json({ success: false, message: 'خطای سرور' });
  }
};

/**
 * ذخیره/به‌روزرسانی برنامه هفتگی دانش‌آموز
 */
export const updateStudentSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { weeklySchedule } = req.body;

    if (!Array.isArray(weeklySchedule)) {
      res.status(400).json({ success: false, message: 'فرمت برنامه هفتگی معتبر نیست' });
      return;
    }

    let studentProfile = await StudentProfile.findOne({ user: user._id });
    if (!studentProfile) {
      studentProfile = new StudentProfile({
        user: user._id,
        studentCode: user.phoneNumber || user.username,
      });
    }

    studentProfile.weeklySchedule = weeklySchedule;
    await studentProfile.save();

    res.status(200).json({
      success: true,
      message: 'برنامه هفتگی با موفقیت ذخیره شد',
      data: studentProfile.weeklySchedule,
    });
  } catch (error: any) {
    logger.error('❌ خطا در ذخیره برنامه هفتگی:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در ذخیره برنامه هفتگی' });
  }
};

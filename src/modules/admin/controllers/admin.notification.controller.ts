import { Request, Response } from 'express';
import { User } from '../../../core/models/User.js';
import { TeacherProfile } from '../../../core/models/TeacherProfile.js';
import { StudentProfile } from '../../../core/models/StudentProfile.js';
import { Notification } from '../../../core/models/Notification.js';
import { SystemSetting } from '../../../core/models/SystemSetting.js';
import { NotificationService } from '../../../core/services/notificationService.js';
import { DeviceToken } from '../../../core/models/DeviceToken.js';
import { logger } from '../../../core/utils/logger.js';

export class AdminNotificationController {
  /**
   * محاسبه تعداد معلمان منطبق با فیلترها قبل از ارسال
   */
  static async getFilteredTeachersCount(req: Request, res: Response) {
    try {
      const { category, position, school } = req.query;

      const hasSpecificFilter = Boolean(
        (category && category !== 'all') ||
        (position && position !== 'all') ||
        (school && typeof school === 'string' && school.trim())
      );

      let userIds: any[] | null = null;
      if (hasSpecificFilter) {
        const profileFilter: any = { isActive: true };
        if (category && category !== 'all') profileFilter.category = category;
        if (position && position !== 'all') profileFilter.position = position;
        if (school && typeof school === 'string' && school.trim()) {
          profileFilter.schools = { $regex: new RegExp(school.trim(), 'i') };
        }
        const matchingProfiles = await TeacherProfile.find(profileFilter).select('user').lean();
        userIds = matchingProfiles.map((p) => p.user);
      }

      const userQuery: any = {
        isActive: true,
        $or: [{ role: 'teacher' }, { roles: 'teacher' }],
      };
      if (userIds !== null) {
        userQuery._id = { $in: userIds };
      }

      const count = await User.countDocuments(userQuery);

      return res.json({
        success: true,
        count,
      });
    } catch (error: any) {
      logger.error('Error calculating filtered teachers count:', error);
      return res.status(500).json({ success: false, message: 'خطا در محاسبه تعداد مخاطبین' });
    }
  }

  /**
   * ارسال نوتیفیکیشن از طرف ادمین به معلمان با انواع فیلترها
   */
  static async sendToTeachers(req: Request, res: Response) {
    try {
      const { title, body, priority = 'normal', category, position, school } = req.body;

      if (!title || !body) {
        return res.status(400).json({ success: false, message: 'عنوان و متن اعلان الزامی است' });
      }

      const hasSpecificFilter = Boolean(
        (category && category !== 'all') ||
        (position && position !== 'all') ||
        (school && typeof school === 'string' && school.trim())
      );

      let userIds: any[] | null = null;
      if (hasSpecificFilter) {
        const profileFilter: any = { isActive: true };
        if (category && category !== 'all') profileFilter.category = category;
        if (position && position !== 'all') profileFilter.position = position;
        if (school && typeof school === 'string' && school.trim()) {
          profileFilter.schools = { $regex: new RegExp(school.trim(), 'i') };
        }
        const matchingProfiles = await TeacherProfile.find(profileFilter).select('user').lean();
        userIds = matchingProfiles.map((p) => p.user);
      }

      const userQuery: any = {
        isActive: true,
        $or: [{ role: 'teacher' }, { roles: 'teacher' }],
      };
      if (userIds !== null) {
        userQuery._id = { $in: userIds };
      }

      const teachers = await User.find(userQuery).select('phoneNumber _id fullName').lean();
      const phones = teachers.map((t) => t.phoneNumber).filter((p): p is string => Boolean(p));

      await NotificationService.send({
        recipientType: 'teacher',
        recipientPhones: phones,
        recipientUserIds: teachers.map((t) => t._id),
        senderId: (req as any).user?._id,
        senderName: (req as any).user?.fullName || 'مدیریت سامانه',
        senderRole: 'admin',
        title: title.trim(),
        body: body.trim(),
        type: 'ADMIN_ANNOUNCEMENT',
        priority,
        filters: hasSpecificFilter
          ? {
              category: category !== 'all' ? category : undefined,
              position: position !== 'all' ? position : undefined,
              school: school?.trim() || undefined,
            }
          : undefined,
      });

      return res.json({
        success: true,
        message: `اعلان با موفقیت برای ${teachers.length} نفر از معلمان ارسال شد.`,
        sentCount: teachers.length,
      });
    } catch (error: any) {
      logger.error('Error sending notification to teachers:', error);
      return res.status(500).json({ success: false, message: 'خطا در ارسال اعلان' });
    }
  }

  /**
   * محاسبه تعداد دانش‌آموزان قبل از ارسال
   */
  static async getFilteredStudentsCount(req: Request, res: Response) {
    try {
      const count = await User.countDocuments({
        isActive: true,
        $or: [{ role: 'student' }, { roles: 'student' }],
      });

      return res.json({
        success: true,
        count,
      });
    } catch (error: any) {
      logger.error('Error calculating filtered students count:', error);
      return res.status(500).json({ success: false, message: 'خطا در محاسبه تعداد مخاطبین' });
    }
  }

  /**
   * ارسال نوتیفیکیشن از طرف ادمین به دانش‌آموزان
   */
  static async sendToStudents(req: Request, res: Response) {
    try {
      const { title, body, priority = 'normal' } = req.body;

      if (!title || !body) {
        return res.status(400).json({ success: false, message: 'عنوان و متن اعلان الزامی است' });
      }

      const students = await User.find({
        isActive: true,
        $or: [{ role: 'student' }, { roles: 'student' }],
      }).select('phoneNumber _id fullName').lean();

      const phones = students.map((s) => s.phoneNumber).filter((p): p is string => Boolean(p));

      await NotificationService.send({
        recipientType: 'student',
        recipientPhones: phones,
        recipientUserIds: students.map((s) => s._id),
        senderId: (req as any).user?._id,
        senderName: (req as any).user?.fullName || 'مدیریت سامانه',
        senderRole: 'admin',
        title: title.trim(),
        body: body.trim(),
        type: 'ADMIN_ANNOUNCEMENT',
        priority,
      });

      return res.json({
        success: true,
        message: `اعلان با موفقیت برای ${students.length} نفر از دانش‌آموزان ارسال شد.`,
        sentCount: students.length,
      });
    } catch (error: any) {
      logger.error('Error sending notification to students:', error);
      return res.status(500).json({ success: false, message: 'خطا در ارسال اعلان به دانش‌آموزان' });
    }
  }

  /**
   * ارسال همگانی به همه کاربران (معلمان و دانش‌آموزان)
   */
  static async sendToAll(req: Request, res: Response) {
    try {
      const { title, body, priority = 'normal' } = req.body;

      if (!title || !body) {
        return res.status(400).json({ success: false, message: 'عنوان و متن اعلان الزامی است' });
      }

      const users = await User.find({
        isActive: true,
        $or: [
          { role: { $in: ['teacher', 'student'] } },
          { roles: { $in: ['teacher', 'student'] } },
        ],
      }).select('phoneNumber _id role').lean();

      const phones = users.map((u) => u.phoneNumber).filter((p): p is string => Boolean(p));

      await NotificationService.send({
        recipientType: 'all',
        recipientPhones: phones,
        recipientUserIds: users.map((u) => u._id),
        senderId: (req as any).user?._id,
        senderName: (req as any).user?.fullName || 'مدیریت سامانه',
        senderRole: 'admin',
        title: title.trim(),
        body: body.trim(),
        type: 'ADMIN_ANNOUNCEMENT',
        priority,
      });

      return res.json({
        success: true,
        message: `اعلان با موفقیت برای تمامی ${users.length} کاربر ارسال شد.`,
        sentCount: users.length,
      });
    } catch (error: any) {
      logger.error('Error sending notification to all:', error);
      return res.status(500).json({ success: false, message: 'خطا در ارسال اعلان همگانی' });
    }
  }

  /**
   * ارسال هدفمند به شماره‌های تلفن خاص
   */
  static async sendTargeted(req: Request, res: Response) {
    try {
      const { phones, title, body, priority = 'normal', recipientType = 'all' } = req.body;

      if (!Array.isArray(phones) || phones.length === 0 || !title || !body) {
        return res.status(400).json({ success: false, message: 'شماره‌های مخاطبین، عنوان و متن الزامی است' });
      }

      const cleanPhones = phones.map((p: string) => p.trim()).filter(Boolean);

      const targetUsers = await User.find({
        phoneNumber: { $in: cleanPhones },
      }).select('_id phoneNumber').lean();

      await NotificationService.send({
        recipientType,
        recipientPhones: cleanPhones,
        recipientUserIds: targetUsers.map((u) => u._id),
        senderId: (req as any).user?._id,
        senderName: (req as any).user?.fullName || 'مدیریت سامانه',
        senderRole: 'admin',
        title: title.trim(),
        body: body.trim(),
        type: 'ADMIN_ANNOUNCEMENT',
        priority,
      });

      return res.json({
        success: true,
        message: `اعلان با موفقیت برای ${cleanPhones.length} شماره ارسال شد.`,
        sentCount: cleanPhones.length,
      });
    } catch (error: any) {
      logger.error('Error sending targeted notification:', error);
      return res.status(500).json({ success: false, message: 'خطا در ارسال اعلان اختصاصی' });
    }
  }

  /**
   * دریافت تاریخچه نوتیفیکیشن‌های ارسالی توسط ادمین
   */
  static async getNotificationHistory(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const [notifications, total] = await Promise.all([
        Notification.find({ senderRole: 'admin' })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Notification.countDocuments({ senderRole: 'admin' }),
      ]);

      return res.json({
        success: true,
        data: notifications,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      logger.error('Error fetching notification history:', error);
      return res.status(500).json({ success: false, message: 'خطا در دریافت تاریخچه اعلان‌ها' });
    }
  }

  /**
   * دریافت تنظیمات فعلی FCM
   */
  static async getFcmSettings(req: Request, res: Response) {
    try {
      const setting = await SystemSetting.findOne({ key: 'fcm_config' }).lean();
      const enabled = setting?.value?.enabled !== false;
      const activeTokensCount = await DeviceToken.countDocuments({ isActive: true });
      const teachersTokenCount = await DeviceToken.countDocuments({ isActive: true, userRole: 'teacher' });
      const studentsTokenCount = await DeviceToken.countDocuments({ isActive: true, userRole: 'student' });

      return res.json({
        success: true,
        data: {
          enabled,
          activeTokensCount,
          teachersTokenCount,
          studentsTokenCount,
          serviceAccountConfigured: true,
        },
      });
    } catch (error: any) {
      logger.error('Error getting FCM settings:', error);
      return res.status(500).json({ success: false, message: 'خطا در دریافت تنظیمات FCM' });
    }
  }

  /**
   * فعال یا غیرفعال‌سازی ارسال پوش نوتیفیکیشن توسط ادمین
   */
  static async updateFcmSettings(req: Request, res: Response) {
    try {
      const { enabled = true } = req.body;

      await SystemSetting.findOneAndUpdate(
        { key: 'fcm_config' },
        {
          key: 'fcm_config',
          category: 'fcm',
          description: 'تنظیمات ارسال پوش نوتیفیکیشن از طریق Firebase Cloud Messaging',
          value: {
            enabled: Boolean(enabled),
          },
          updatedBy: (req as any).user?.username || 'admin',
        },
        { upsert: true, new: true }
      );

      return res.json({
        success: true,
        message: 'تنظیمات FCM با موفقیت ذخیره شد.',
      });
    } catch (error: any) {
      logger.error('Error updating FCM settings:', error);
      return res.status(500).json({ success: false, message: 'خطا در ذخیره تنظیمات FCM' });
    }
  }

  /**
   * ارسال نوتیفیکیشن آزمایشی (تست سریع اتصال و دریافت روی گوشی)
   */
  static async sendTestNotification(req: Request, res: Response) {
    try {
      const { phone, targetRole = 'teacher', title, body } = req.body;
      const callerPhone = (req as any).user?.phoneNumber;

      const targetPhone = phone?.trim() || callerPhone;
      const notificationTitle = title?.trim() || '🔔 تست اعلان کیتایار';
      const notificationBody =
        body?.trim() ||
        `این یک پیام آزمایشی جهت بررسی اتصال سرویس اعلان است. زمان: ${new Date().toLocaleTimeString('fa-IR')}`;

      let targetUser = null;
      if (targetPhone) {
        targetUser = await User.findOne({
          $or: [{ phoneNumber: targetPhone }, { username: targetPhone }],
        }).select('_id phoneNumber fullName').lean();
      }

      // بررسی توکن‌های موجود برای این شماره یا نقش
      const phones = targetPhone ? [targetPhone] : [];
      const userIds = targetUser ? [targetUser._id] : [];

      const pushResult = await NotificationService.sendPushNotification({
        phones,
        userIds,
        recipientType: targetRole as any,
        title: notificationTitle,
        body: notificationBody,
        data: {
          type: 'TEST_NOTIFICATION',
          timestamp: String(Date.now()),
        },
      });

      // ذخیره در جدول اعلان‌ها برای ثبت تاریخچه و نمایش درون اپ
      await Notification.create({
        recipientType: targetRole || 'all',
        recipientPhone: targetPhone || undefined,
        recipientUserId: targetUser?._id,
        senderId: (req as any).user?._id,
        senderName: (req as any).user?.fullName || 'مدیریت سامانه (تست)',
        senderRole: 'admin',
        title: notificationTitle,
        body: notificationBody,
        type: 'ADMIN_ANNOUNCEMENT',
        priority: 'urgent',
        isRead: false,
      });

      return res.json({
        success: pushResult.successCount > 0 || pushResult.tokensFound > 0,
        message:
          pushResult.successCount > 0
            ? `پوش نوتیفیکیشن تستی با موفقیت به ${pushResult.successCount} دستگاه ارسال شد.`
            : pushResult.tokensFound === 0
            ? `هیچ دستگاه فعالی برای شماره ${targetPhone || 'انتخابی'} ثبت نشده است. ابتدا با اپلیکیشن کیتایار وارد شوید تا توکن دستگاه متصل شود.`
            : `خطا در ارسال به سرویس گوگل: ${pushResult.errors.join(', ')}`,
        data: {
          targetPhone,
          tokensFound: pushResult.tokensFound,
          successCount: pushResult.successCount,
          failureCount: pushResult.failureCount,
          errors: pushResult.errors,
        },
      });
    } catch (error: any) {
      logger.error('Error sending test notification:', error);
      return res.status(500).json({
        success: false,
        message: 'خطا در ارسال نوتیفیکیشن آزمایشی',
        error: error.message,
      });
    }
  }
}

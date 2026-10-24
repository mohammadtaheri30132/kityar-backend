import { Request, Response } from 'express';
import { User } from '../../../core/models/User.js';
import { TeacherProfile } from '../../../core/models/TeacherProfile.js';
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

      const profileFilter: any = { isActive: true };
      if (category && category !== 'all') {
        profileFilter.category = category;
      }
      if (position && position !== 'all') {
        profileFilter.position = position;
      }
      if (school && typeof school === 'string' && school.trim()) {
        profileFilter.schools = { $regex: new RegExp(school.trim(), 'i') };
      }

      const matchingProfiles = await TeacherProfile.find(profileFilter).select('user').lean();
      const userIds = matchingProfiles.map((p) => p.user);

      const count = await User.countDocuments({
        _id: { $in: userIds },
        role: 'teacher',
        isActive: true,
      });

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

      const profileFilter: any = { isActive: true };
      if (category && category !== 'all') profileFilter.category = category;
      if (position && position !== 'all') profileFilter.position = position;
      if (school && typeof school === 'string' && school.trim()) {
        profileFilter.schools = { $regex: new RegExp(school.trim(), 'i') };
      }

      const matchingProfiles = await TeacherProfile.find(profileFilter).select('user').lean();
      const userIds = matchingProfiles.map((p) => p.user);

      const teachers = await User.find({
        _id: { $in: userIds },
        role: 'teacher',
        isActive: true,
      }).select('phoneNumber _id fullName').lean();

      const phones = teachers.map((t) => t.phoneNumber).filter((p): p is string => Boolean(p));

      // ذخیره و ارسال از طریق NotificationService
      await NotificationService.send({
        recipientType: 'teacher',
        recipientPhones: phones,
        senderId: (req as any).user?._id,
        senderName: (req as any).user?.fullName || 'مدیریت سامانه',
        senderRole: 'admin',
        title: title.trim(),
        body: body.trim(),
        type: 'ADMIN_ANNOUNCEMENT',
        priority,
        filters: {
          category: category !== 'all' ? category : undefined,
          position: position !== 'all' ? position : undefined,
          school: school?.trim() || undefined,
        },
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
      const serverKey = setting?.value?.serverKey || process.env.FCM_SERVER_KEY || '';
      const enabled = setting?.value?.enabled !== false;
      const activeTokensCount = await DeviceToken.countDocuments({ isActive: true });

      return res.json({
        success: true,
        data: {
          serverKeyMasked: serverKey ? `${serverKey.slice(0, 6)}...${serverKey.slice(-4)}` : '',
          hasServerKey: !!serverKey,
          serverKey, // ارسال کامل جهت نمایش و ویرایش در فیلد تنظیمات ادمین
          enabled,
          activeTokensCount,
        },
      });
    } catch (error: any) {
      logger.error('Error getting FCM settings:', error);
      return res.status(500).json({ success: false, message: 'خطا در دریافت تنظیمات FCM' });
    }
  }

  /**
   * ویرایش و ذخیره کلید سرور و تنظیمات FCM توسط ادمین
   */
  static async updateFcmSettings(req: Request, res: Response) {
    try {
      const { serverKey, enabled = true } = req.body;

      await SystemSetting.findOneAndUpdate(
        { key: 'fcm_config' },
        {
          key: 'fcm_config',
          category: 'fcm',
          description: 'تنظیمات کلید سرور Firebase Cloud Messaging جهت ارسال نوتیفیکیشن',
          value: {
            serverKey: serverKey?.trim() || '',
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
}

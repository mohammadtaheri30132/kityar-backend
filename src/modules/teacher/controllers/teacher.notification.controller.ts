import { Request, Response } from 'express';
import { Notification } from '../../../core/models/Notification.js';
import { DeviceToken } from '../../../core/models/DeviceToken.js';
import { logger } from '../../../core/utils/logger.js';

export class TeacherNotificationController {
  /**
   * دریافت نوتیفیکیشن‌های معلم (اعلانات ارسالی ادمین یا رویدادهای سیستم)
   */
  static async getNotifications(req: Request, res: Response) {
    try {
      const teacherPhone = (req as any).user?.phoneNumber;
      const teacherId = (req as any).user?._id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 30;
      const skip = (page - 1) * limit;

      const query: any = {
        $or: [
          { recipientType: 'teacher', recipientPhone: teacherPhone },
          { recipientType: 'teacher', recipientUserId: teacherId },
          { recipientType: 'all' },
        ],
      };

      const [notifications, total, unreadCount] = await Promise.all([
        Notification.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Notification.countDocuments(query),
        Notification.countDocuments({ ...query, isRead: false }),
      ]);

      return res.json({
        success: true,
        data: notifications,
        unreadCount,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      logger.error('Error fetching teacher notifications:', error);
      return res.status(500).json({ success: false, message: 'خطا در دریافت اعلان‌ها' });
    }
  }

  /**
   * تعداد اعلان‌های خوانده‌نشده معلم
   */
  static async getUnreadCount(req: Request, res: Response) {
    try {
      const teacherPhone = (req as any).user?.phoneNumber;
      const teacherId = (req as any).user?._id;
      const count = await Notification.countDocuments({
        $or: [
          { recipientType: 'teacher', recipientPhone: teacherPhone },
          { recipientType: 'teacher', recipientUserId: teacherId },
          { recipientType: 'all' },
        ],
        isRead: false,
      });

      return res.json({
        success: true,
        unreadCount: count,
      });
    } catch (error: any) {
      logger.error('Error getting teacher unread count:', error);
      return res.status(500).json({ success: false, message: 'خطا در شمارش اعلان‌های خوانده نشده' });
    }
  }

  /**
   * علامت‌گذاری به عنوان خوانده شده
   */
  static async markAsRead(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await Notification.findByIdAndUpdate(id, {
        isRead: true,
        readAt: new Date(),
      });

      return res.json({
        success: true,
        message: 'اعلان خوانده شد',
      });
    } catch (error: any) {
      logger.error('Error marking notification as read:', error);
      return res.status(500).json({ success: false, message: 'خطا در ثبت وضعیت اعلان' });
    }
  }

  /**
   * خوانده شده کردن تمامی اعلان‌ها
   */
  static async markAllAsRead(req: Request, res: Response) {
    try {
      const teacherPhone = (req as any).user?.phoneNumber;
      const teacherId = (req as any).user?._id;
      await Notification.updateMany(
        {
          $or: [
            { recipientType: 'teacher', recipientPhone: teacherPhone },
            { recipientType: 'teacher', recipientUserId: teacherId },
            { recipientType: 'all' },
          ],
          isRead: false,
        },
        {
          isRead: true,
          readAt: new Date(),
        }
      );

      return res.json({
        success: true,
        message: 'تمام اعلان‌ها خوانده شدند',
      });
    } catch (error: any) {
      logger.error('Error marking all notifications as read:', error);
      return res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی اعلان‌ها' });
    }
  }

  /**
   * ثبت توکن FCM دستگاه معلم
   */
  static async registerDeviceToken(req: Request, res: Response) {
    try {
      const { token, platform = 'android', deviceName } = req.body;
      const teacherPhone = (req as any).user?.phoneNumber;
      const teacherId = (req as any).user?._id;

      if (!token || !teacherPhone) {
        return res.status(400).json({ success: false, message: 'توکن و شماره تلفن الزامی است' });
      }

      await DeviceToken.findOneAndUpdate(
        { token },
        {
          userId: teacherId,
          userPhone: teacherPhone,
          userRole: 'teacher',
          token,
          platform,
          deviceName,
          isActive: true,
          lastActiveAt: new Date(),
        },
        { upsert: true, new: true }
      );

      return res.json({
        success: true,
        message: 'توکن دستگاه با موفقیت ثبت شد',
      });
    } catch (error: any) {
      logger.error('Error registering teacher device token:', error);
      return res.status(500).json({ success: false, message: 'خطا در ثبت توکن دستگاه' });
    }
  }
}

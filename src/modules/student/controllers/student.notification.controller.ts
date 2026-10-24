import { Request, Response } from 'express';
import { Notification } from '../../../core/models/Notification.js';
import { DeviceToken } from '../../../core/models/DeviceToken.js';
import { logger } from '../../../core/utils/logger.js';

export class StudentNotificationController {
  /**
   * دریافت نوتیفیکیشن‌های دانش‌آموز
   */
  static async getNotifications(req: Request, res: Response) {
    try {
      const studentPhone = (req as any).student?.phoneNumber || (req as any).user?.phoneNumber;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 30;
      const skip = (page - 1) * limit;

      const query: any = {
        $or: [
          { recipientType: 'student', recipientPhone: studentPhone },
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
      logger.error('Error fetching student notifications:', error);
      return res.status(500).json({ success: false, message: 'خطا در دریافت اعلان‌ها' });
    }
  }

  /**
   * دریافت تعداد نوتیفیکیشن‌های خوانده نشده
   */
  static async getUnreadCount(req: Request, res: Response) {
    try {
      const studentPhone = (req as any).student?.phoneNumber || (req as any).user?.phoneNumber;
      const count = await Notification.countDocuments({
        $or: [
          { recipientType: 'student', recipientPhone: studentPhone },
          { recipientType: 'all' },
        ],
        isRead: false,
      });

      return res.json({
        success: true,
        unreadCount: count,
      });
    } catch (error: any) {
      logger.error('Error getting unread count:', error);
      return res.status(500).json({ success: false, message: 'خطا در شمارش اعلان‌های خوانده نشده' });
    }
  }

  /**
   * خوانده شده کردن یک نوتیفیکیشن
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
        message: 'اعلان به عنوان خوانده شده ثبت شد',
      });
    } catch (error: any) {
      logger.error('Error marking notification as read:', error);
      return res.status(500).json({ success: false, message: 'خطا در ثبت وضعیت اعلان' });
    }
  }

  /**
   * خوانده شده کردن همه نوتیفیکیشن‌های دانش‌آموز
   */
  static async markAllAsRead(req: Request, res: Response) {
    try {
      const studentPhone = (req as any).student?.phoneNumber || (req as any).user?.phoneNumber;
      await Notification.updateMany(
        {
          $or: [
            { recipientType: 'student', recipientPhone: studentPhone },
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
        message: 'تمامی اعلان‌ها خوانده شدند',
      });
    } catch (error: any) {
      logger.error('Error marking all notifications as read:', error);
      return res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی اعلان‌ها' });
    }
  }

  /**
   * ثبت یا به‌روزرسانی توکن FCM دستگاه دانش‌آموز
   */
  static async registerDeviceToken(req: Request, res: Response) {
    try {
      const { token, platform = 'android', deviceName } = req.body;
      const studentPhone = (req as any).student?.phoneNumber || (req as any).user?.phoneNumber;
      const userId = (req as any).student?._id || (req as any).user?._id;

      if (!token || !studentPhone) {
        return res.status(400).json({ success: false, message: 'توکن و شماره کاربر الزامی است' });
      }

      await DeviceToken.findOneAndUpdate(
        { token },
        {
          userId,
          userPhone: studentPhone,
          userRole: 'student',
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
      logger.error('Error registering student device token:', error);
      return res.status(500).json({ success: false, message: 'خطا در ثبت توکن دستگاه' });
    }
  }
}

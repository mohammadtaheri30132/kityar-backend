import { Notification, INotification, NotificationType, NotificationPriority, RecipientType } from '../models/Notification.js';
import { DeviceToken } from '../models/DeviceToken.js';
import { SystemSetting } from '../models/SystemSetting.js';
import { logger } from '../utils/logger.js';

export interface SendNotificationPayload {
  recipientType: RecipientType;
  recipientUserId?: any;
  recipientPhone?: string;
  recipientPhones?: string[]; // برای ارسال دسته‌جمعی
  senderId?: any;
  senderName?: string;
  senderRole?: 'admin' | 'teacher' | 'student' | 'system';
  title: string;
  body: string;
  type: NotificationType;
  priority?: NotificationPriority;
  targetId?: string;
  data?: Record<string, any>;
  filters?: {
    category?: string;
    position?: string;
    school?: string;
  };
}

export class NotificationService {
  /**
   * دریافت تنظیمات FCM ذخیره شده از پنل ادمین
   */
  static async getFcmConfig(): Promise<{ serverKey?: string; enabled: boolean }> {
    try {
      const setting = await SystemSetting.findOne({ key: 'fcm_config' });
      if (setting && setting.value) {
        return {
          serverKey: setting.value.serverKey || process.env.FCM_SERVER_KEY,
          enabled: setting.value.enabled !== false,
        };
      }
    } catch (e) {
      logger.warn('Could not read fcm_config from SystemSetting:', e);
    }
    return {
      serverKey: process.env.FCM_SERVER_KEY,
      enabled: !!process.env.FCM_SERVER_KEY,
    };
  }

  /**
   * ارسال نوتیفیکیشن به یک یا چند کاربر (ذخیره در دیتابیس + ارسال پوش نوتیفیکیشن در صورت فعال بودن FCM)
   */
  static async send(payload: SendNotificationPayload): Promise<any[]> {
    const {
      recipientType,
      recipientUserId,
      recipientPhone,
      recipientPhones,
      senderId,
      senderName,
      senderRole = 'system',
      title,
      body,
      type,
      priority = 'normal',
      targetId,
      data = {},
      filters,
    } = payload;

    const phones = recipientPhones && recipientPhones.length > 0
      ? recipientPhones
      : recipientPhone
      ? [recipientPhone]
      : [];

    const notificationsToCreate: any[] = [];

    if (phones.length > 0) {
      for (const phone of phones) {
        notificationsToCreate.push({
          recipientType,
          recipientUserId,
          recipientPhone: phone,
          senderId,
          senderName,
          senderRole,
          title,
          body,
          type,
          priority,
          targetId,
          data,
          filters,
          isRead: false,
        });
      }
    } else {
      // Broadcast بدون شماره مشخص
      notificationsToCreate.push({
        recipientType,
        recipientUserId,
        senderId,
        senderName,
        senderRole,
        title,
        body,
        type,
        priority,
        targetId,
        data,
        filters,
        isRead: false,
      });
    }

    const savedNotifications = await Notification.insertMany(notificationsToCreate);

    // ارسال Push Notification در صورت فعال بودن FCM
    this.sendPushNotification(phones, title, body, {
      type,
      targetId: targetId || '',
      ...data,
    }).catch((err) => {
      logger.warn('Push notification delivery error:', err);
    });

    return savedNotifications;
  }

  /**
   * ارسال پوش نوتیفیکیشن با FCM به توکن‌های دستگاه‌های کاربران
   */
  static async sendPushNotification(
    phones: string[],
    title: string,
    body: string,
    customData: Record<string, any> = {}
  ): Promise<void> {
    const fcmConfig = await this.getFcmConfig();
    if (!fcmConfig.enabled || !fcmConfig.serverKey) {
      logger.info('FCM is not configured yet. Notification saved to database successfully.');
      return;
    }

    try {
      const query: any = { isActive: true };
      if (phones.length > 0) {
        query.userPhone = { $in: phones };
      }

      const deviceTokens = await DeviceToken.find(query).select('token').lean();
      const tokens = deviceTokens.map((d) => d.token).filter(Boolean);

      if (tokens.length === 0) {
        logger.info('No active device tokens found for recipients.');
        return;
      }

      // ارسال به صورت دسته‌ای (Batch تا ۵۰۰ توکن)
      const batches: string[][] = [];
      for (let i = 0; i < tokens.length; i += 500) {
        batches.push(tokens.slice(i, i + 500));
      }

      for (const batch of batches) {
        const postData = {
          registration_ids: batch,
          notification: {
            title,
            body,
            sound: 'default',
            icon: 'ic_launcher',
          },
          data: customData,
          priority: 'high',
        };

        const response = await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `key=${fcmConfig.serverKey}`,
          },
          body: JSON.stringify(postData),
        });

        const data: any = await response.json();
        logger.info(`FCM response: success=${data?.success}, failure=${data?.failure}`);
      }
    } catch (error: any) {
      logger.warn('Error sending FCM push:', error?.message || error);
    }
  }
}

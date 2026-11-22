import path from 'path';
import fs from 'fs';
import mongoose, { Types } from 'mongoose';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { Notification, INotification, NotificationType, NotificationPriority, RecipientType } from '../models/Notification.js';
import { DeviceToken } from '../models/DeviceToken.js';
import { SystemSetting } from '../models/SystemSetting.js';
import { logger } from '../utils/logger.js';

export interface SendNotificationPayload {
  recipientType: RecipientType;
  recipientUserId?: any;
  recipientUserIds?: any[];
  recipientPhone?: string;
  recipientPhones?: string[];
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
  private static isFirebaseInitialized = false;

  /**
   * راه‌اندازی Firebase Admin SDK با Service Account اختصاصی
   */
  private static initFirebaseAdmin(): boolean {
    if (this.isFirebaseInitialized) return true;
    if (getApps().length > 0) {
      this.isFirebaseInitialized = true;
      return true;
    }

    try {
      const candidates = [
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
        path.join(process.cwd(), 'src', 'secrets', 'kitayar-1921c-firebase-adminsdk-fbsvc-8d4ad66222.json'),
        path.join(process.cwd(), 'dist', 'secrets', 'kitayar-1921c-firebase-adminsdk-fbsvc-8d4ad66222.json'),
        path.join(process.cwd(), 'secrets', 'kitayar-1921c-firebase-adminsdk-fbsvc-8d4ad66222.json'),
      ].filter((p): p is string => Boolean(p));

      let serviceAccountPath: string | null = null;
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          serviceAccountPath = p;
          break;
        }
      }

      if (serviceAccountPath) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        initializeApp({
          credential: cert(serviceAccount),
        });
        this.isFirebaseInitialized = true;
        logger.info(`✅ Firebase Admin SDK initialized successfully from ${serviceAccountPath}`);
        return true;
      } else {
        logger.warn('⚠️ Firebase service account file not found. Push notifications will be queued in DB only.');
        return false;
      }
    } catch (err: any) {
      logger.error('Failed to initialize Firebase Admin SDK:', err);
      return false;
    }
  }

  /**
   * دریافت تنظیمات FCM
   */
  static async getFcmConfig(): Promise<{ enabled: boolean }> {
    try {
      const setting = await SystemSetting.findOne({ key: 'fcm_config' });
      if (setting && setting.value) {
        return {
          enabled: setting.value.enabled !== false,
        };
      }
    } catch (e) {
      logger.warn('Could not read fcm_config from SystemSetting:', e);
    }
    return { enabled: true };
  }

  /**
   * ارسال نوتیفیکیشن به یک یا چند کاربر (ذخیره در دیتابیس + ارسال پوش نوتیفیکیشن FCM)
   */
  static async send(payload: SendNotificationPayload): Promise<any[]> {
    const {
      recipientType,
      recipientUserId,
      recipientUserIds,
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

    const userIds = recipientUserIds && recipientUserIds.length > 0
      ? recipientUserIds
      : recipientUserId
      ? [recipientUserId]
      : [];

    const notificationsToCreate: any[] = [];

    if (phones.length > 0) {
      for (let i = 0; i < phones.length; i++) {
        notificationsToCreate.push({
          recipientType,
          recipientUserId: userIds[i] || userIds[0] || undefined,
          recipientPhone: phones[i],
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
    } else if (userIds.length > 0) {
      for (const uid of userIds) {
        notificationsToCreate.push({
          recipientType,
          recipientUserId: uid,
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
      // حالت برودکست برای همه
      notificationsToCreate.push({
        recipientType,
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

    // ارسال فوری پوش نوتیفیکیشن FCM
    this.sendPushNotification({
      phones,
      userIds,
      recipientType,
      title,
      body,
      data: {
        type: String(type),
        targetId: targetId ? String(targetId) : '',
        priority: String(priority),
        ...data,
      },
    }).catch((err) => {
      logger.warn('[NotificationService] Push notification delivery error:', err);
    });

    return savedNotifications;
  }

  /**
   * تولید فرمت‌های مختلف شماره تلفن همراه در ایران جهت تطبیق کامل با دیتابیس
   */
  static expandPhoneVariants(phones: string[]): string[] {
    const set = new Set<string>();
    for (const p of phones) {
      if (!p || typeof p !== 'string') continue;
      const clean = p.replace(/\s+/g, '').replace(/^(\+98|0098)/, '0');
      set.add(clean);
      if (clean.startsWith('09')) {
        set.add(clean.substring(1)); // 912...
        set.add('+98' + clean.substring(1)); // +98912...
        set.add('98' + clean.substring(1)); // 98912...
      } else if (clean.startsWith('9') && clean.length === 10) {
        set.add('0' + clean);
        set.add('+98' + clean);
        set.add('98' + clean);
      }
    }
    return Array.from(set);
  }

  /**
   * ارسال پوش نوتیفیکیشن FCM به دیوایس‌های فعال کاربران
   */
  static async sendPushNotification(params: {
    phones?: string[];
    userIds?: any[];
    recipientType?: RecipientType;
    title: string;
    body: string;
    data?: Record<string, any>;
  }): Promise<{ successCount: number; failureCount: number; errors: any[]; tokensFound: number }> {
    const { phones = [], userIds = [], recipientType, title, body, data = {} } = params;

    const fcmConfig = await this.getFcmConfig();
    if (!fcmConfig.enabled) {
      logger.info('[NotificationService] FCM is disabled in settings. Notification stored in DB.');
      return { successCount: 0, failureCount: 0, errors: ['FCM is disabled in settings'], tokensFound: 0 };
    }

    const isReady = this.initFirebaseAdmin();
    if (!isReady) {
      return { successCount: 0, failureCount: 0, errors: ['Firebase Admin SDK not initialized'], tokensFound: 0 };
    }

    let overallSuccess = 0;
    let overallFailure = 0;
    const errors: any[] = [];

    try {
      const query: any = { isActive: true };
      const orConditions: any[] = [];

      if (phones.length > 0) {
        const expandedPhones = this.expandPhoneVariants(phones);
        orConditions.push({ userPhone: { $in: expandedPhones } });
      }
      if (userIds.length > 0) {
        const formattedUserIds = userIds.map((uid) => {
          if (uid instanceof Types.ObjectId) return uid;
          if (typeof uid === 'string' && Types.ObjectId.isValid(uid)) {
            return new Types.ObjectId(uid);
          }
          return uid;
        });
        orConditions.push({ userId: { $in: formattedUserIds } });
      }

      if (orConditions.length > 0) {
        query.$or = orConditions;
      } else if (recipientType && recipientType !== 'all') {
        query.userRole = recipientType;
      }

      let deviceTokens = await DeviceToken.find(query).select('token userRole userPhone').lean();

      // اگر برای ارسال گروهی با فیلتر تلفن توکنی یافت نشد، از توکن‌های فعال نقش به عنوان فال‌بک استفاده کن
      if (deviceTokens.length === 0 && recipientType && recipientType !== 'all') {
        deviceTokens = await DeviceToken.find({ isActive: true, userRole: recipientType }).select('token userRole userPhone').lean();
      }

      const tokens = Array.from(new Set(deviceTokens.map((d) => d.token).filter(Boolean)));

      if (tokens.length === 0) {
        logger.info('[NotificationService] No active device tokens found for target.');
        return { successCount: 0, failureCount: 0, errors: ['هیچ توکن فعال ثبت‌شده‌ای برای مخاطب پیدا نشد.'], tokensFound: 0 };
      }

      // ساخت Payload سازگار با FCM Data (تمام مقادیر باید String باشند)
      const stringifiedData: Record<string, string> = {};
      for (const [k, v] of Object.entries(data)) {
        stringifiedData[k] = typeof v === 'string' ? v : JSON.stringify(v);
      }

      // دسته‌بندی توکن‌ها تا سقف ۵۰۰ تایی برای ارسال امن
      const chunkSize = 500;
      const messaging = getMessaging();

      for (let i = 0; i < tokens.length; i += chunkSize) {
        const chunk = tokens.slice(i, i + chunkSize);

        const response = await messaging.sendEachForMulticast({
          tokens: chunk,
          notification: {
            title,
            body,
          },
          data: stringifiedData,
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              channelId: 'kitayar_default_channel',
              icon: 'ic_launcher',
              priority: 'high',
            },
          },
        });

        overallSuccess += response.successCount;
        overallFailure += response.failureCount;

        logger.info(
          `[NotificationService] FCM Multicast batch sent: ${response.successCount} success, ${response.failureCount} failure`
        );

        // تمیزکاری توکن‌های منقضی یا نامعتبر
        if (response.failureCount > 0) {
          const invalidTokens: string[] = [];
          response.responses.forEach((resp: any, idx: number) => {
            if (!resp.success && resp.error) {
              errors.push(resp.error.message || resp.error.code);
              const code = resp.error.code;
              if (
                code === 'messaging/registration-token-not-registered' ||
                code === 'messaging/invalid-registration-token' ||
                code === 'messaging/invalid-argument'
              ) {
                invalidTokens.push(chunk[idx]);
              }
            }
          });

          if (invalidTokens.length > 0) {
            await DeviceToken.updateMany(
              { token: { $in: invalidTokens } },
              { $set: { isActive: false } }
            );
            logger.info(`[NotificationService] Deactivated ${invalidTokens.length} stale FCM tokens`);
          }
        }
      }

      return {
        successCount: overallSuccess,
        failureCount: overallFailure,
        errors,
        tokensFound: tokens.length,
      };
    } catch (error: any) {
      logger.warn('[NotificationService] Error sending FCM push:', error?.message || error);
      return {
        successCount: overallSuccess,
        failureCount: overallFailure,
        errors: [error?.message || String(error)],
        tokensFound: 0,
      };
    }
  }
}

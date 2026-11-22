import { logger } from '../utils/logger.js';
// @ts-ignore
import moment from 'moment-jalaali';

interface OtpStoreItem {
  code: string;
  expiresAt: number;
  resendAvailableAt: number;
  sentAt: number;
}

// حافظه موقت برای نگهداری کدهای تایید تولید شده
const otpCache = new Map<string, OtpStoreItem>();

// پاکسازی خودکار کدهای منقضی هر ۱۰ دقیقه
setInterval(() => {
  const now = Date.now();
  for (const [phone, item] of otpCache.entries()) {
    if (item.expiresAt < now) {
      otpCache.delete(phone);
    }
  }
}, 10 * 60 * 1000);

export class SmsService {
  private static apiKey = process.env.KAVENEGAR_API_KEY || '4F5373736A4743693943462F364D5561714F5A523033796A724E563253466972675A4C57424F52446771553D';
  private static template = process.env.KAVENEGAR_TEMPLATE || 'OTP';
  private static sender = process.env.KAVENEGAR_SENDER || '';
  private static COOLDOWN_SECONDS = 120; // ۲ دقیقه محدودیت زمانی بین ارسال‌ها

  /**
   * آیا سیستم در حالت واقعی پیامک است یا توسعه (Mock)
   */
  public static isProductionSms(): boolean {
    const key = process.env.KAVENEGAR_API_KEY || this.apiKey;
    return Boolean(key && key.trim() !== '' && key !== 'YOUR_KAVENEGAR_API_KEY');
  }

  /**
   * نرمال‌سازی شماره تلفن همراه به فرمت استاندارد ۱۱ رقمی 09xxxxxxxxx
   */
  public static normalizePhone(phone: string): string {
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
    if (clean.length === 10 && !clean.startsWith('0')) {
      clean = '0' + clean;
    }
    return clean;
  }

  /**
   * دریافت مدت زمان باقی‌مانده (به ثانیه) تا امکان ارسال مجدد کد برای یک شماره
   */
  public static getRemainingSeconds(phoneNumber: string): number {
    const cleanPhone = this.normalizePhone(phoneNumber);
    const existing = otpCache.get(cleanPhone);
    if (existing && existing.resendAvailableAt > Date.now()) {
      return Math.ceil((existing.resendAvailableAt - Date.now()) / 1000);
    }
    return 0;
  }

  /**
   * ارسال کد تایید یکبار مصرف (OTP) از طریق وب‌سرویس اعتبارسنجی (Lookup) کاوه‌نگار
   * اعمال محدودیت زمانی سفت و سخت ۲ دقیقه‌ای برای جلوگیری از حملات اسپم پیامکی
   */
  public static async sendOtp(phoneNumber: string): Promise<{
    success: boolean;
    rateLimited?: boolean;
    remainingSeconds?: number;
    message: string;
    otp?: string;
  }> {
    const cleanPhone = this.normalizePhone(phoneNumber);

    if (cleanPhone.length !== 11 || !cleanPhone.startsWith('09')) {
      return { success: false, message: 'شماره تلفن همراه معتبر نیست (باید ۱۱ رقم و با ۰۹ شروع شود)' };
    }

    const now = Date.now();
    const remaining = this.getRemainingSeconds(cleanPhone);

    // اگر هنوز ۲ دقیقه نگذشته باشد، جلوی ارسال مجدد گرفته می‌شود
    if (remaining > 0) {
      return {
        success: false,
        rateLimited: true,
        remainingSeconds: remaining,
        message: `کد تایید قبلاً برای این شماره ارسال شده است. لطفاً ${remaining} ثانیه دیگر مجدداً تلاش کنید.`,
      };
    }

    const apiKey = process.env.KAVENEGAR_API_KEY || this.apiKey;
    const template = process.env.KAVENEGAR_TEMPLATE || this.template;

    // تولید کد تصادفی ۵ رقمی واقعی
    const randomOtp = Math.floor(10000 + Math.random() * 90000).toString();
    otpCache.set(cleanPhone, {
      code: randomOtp,
      expiresAt: now + 5 * 60 * 1000, // ۵ دقیقه اعتبار برای وارد کردن کد
      resendAvailableAt: now + this.COOLDOWN_SECONDS * 1000, // ۲ دقیقه مهلت تا ارسال مجدد
      sentAt: now,
    });

    try {
      const url = `https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json?receptor=${cleanPhone}&token=${randomOtp}&template=${template}`;
      logger.info(`📤 [کاوه نگار] در حال ارسال پیامک اعتبارسنجی OTP به ${cleanPhone} با الگوی ${template}...`);
      
      const response = await fetch(url);
      const data: any = await response.json();

      if (data?.return?.status === 200) {
        logger.info(`✅ [کاوه نگار] پیامک اعتبارسنجی با موفقیت به ${cleanPhone} ارسال شد.`);
        return {
          success: true,
          remainingSeconds: this.COOLDOWN_SECONDS,
          message: 'کد تایید با موفقیت پیامک شد.',
        };
      } else {
        logger.error(`❌ [کاوه نگار] خطا در ارسال پیامک:`, data);
        otpCache.delete(cleanPhone);
        return { success: false, message: data?.return?.message || 'خطا در وب‌سرویس ارسال پیامک کاوه‌نگار' };
      }
    } catch (error: any) {
      logger.error(`❌ [کاوه نگار] خطای ارتباطی با وب‌سرویس:`, error.message);
      otpCache.delete(cleanPhone);
      return { success: false, message: 'خطای شبکه در ارسال پیامک' };
    }
  }

  /**
   * ارسال پیامک ساده متنی (برای اطلاع‌رسانی درخواست کلاس و رویدادها)
   */
  public static async sendSimpleMessage(phoneNumber: string, message: string): Promise<boolean> {
    const cleanPhone = this.normalizePhone(phoneNumber);
    if (!cleanPhone) return false;
    const apiKey = process.env.KAVENEGAR_API_KEY || this.apiKey;
    const sender = process.env.KAVENEGAR_SENDER || this.sender;
    try {
      const url = `https://api.kavenegar.com/v1/${apiKey}/sms/send.json?receptor=${cleanPhone}&message=${encodeURIComponent(message)}` + (sender ? `&sender=${sender}` : '');
      const response = await fetch(url);
      const data: any = await response.json();
      return data?.return?.status === 200;
    } catch (err: any) {
      logger.error('Error sending sms notification:', err.message);
      return false;
    }
  }

  /**
   * جایگزینی فاصله‌ها با زیرخط برای توکن‌های استاندارد (بدون فاصله)
   */
  public static sanitizeSingleToken(str: string | undefined | null, fallback: string = 'کاربر'): string {
    if (!str) return fallback;
    const cleaned = String(str).trim().replace(/\s+/g, '_');
    return cleaned.slice(0, 100) || fallback;
  }

  /**
   * ۱. ارسال پیامک درخواست کلاس جدید به استاد با استفاده از الگوی کاوه‌نگار (requestClassForTeacher)
   */
  public static async sendTeacherClassRequest(options: {
    mobile: string;
    teacherName: string;
    courseName: string;
    startTime: Date | string;
    duration: number | string;
  }): Promise<{ success: boolean; message?: string }> {
    try {
      const cleanPhone = this.normalizePhone(options.mobile);
      if (cleanPhone.length !== 11 || !cleanPhone.startsWith('09')) {
        logger.warn(`⚠️ [کاوه نگار] شماره موبایل استاد نامعتبر است: ${options.mobile}`);
        return { success: false, message: 'شماره موبایل استاد نامعتبر است' };
      }

      const apiKey = process.env.KAVENEGAR_API_KEY || this.apiKey;
      const url = `https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json`;

      // ساعت شروع کلاس درخواستی برای token20 (مجاز به داشتن فاصله)
      let formattedTime = String(options.startTime || '').trim();
      if (options.startTime instanceof Date || (typeof options.startTime === 'string' && !isNaN(Date.parse(options.startTime)))) {
        try {
          const d = new Date(options.startTime);
          formattedTime = moment(d).format('jYYYY/jMM/jDD ساعت HH:mm');
        } catch (_) {}
      }

      // مدت زمان کلاس برای token10 (مثلا 90 یا 45)
      const durationStr = String(options.duration || '90').trim();

      const params = new URLSearchParams({
        receptor: cleanPhone,
        template: 'requestClassForTeacher',
        token: this.sanitizeSingleToken(options.teacherName, 'استاد'),
        token2: this.sanitizeSingleToken(options.courseName, 'درس'),
        token10: durationStr,
        token20: formattedTime,
        type: 'sms',
      });

      logger.info(`📤 [کاوه نگار] ارسال پیامک درخواست کلاس به استاد (${cleanPhone})...`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        },
        body: params.toString(),
      });

      const data: any = await response.json();
      if (data?.return?.status === 200) {
        logger.info(`✅ [کاوه نگار] پیامک درخواست کلاس با موفقیت به استاد ${cleanPhone} ارسال شد.`);
        return { success: true, message: 'پیامک به استاد ارسال شد' };
      } else {
        logger.warn(`⚠️ [کاوه نگار] عدم ارسال پیامک به استاد (کد ${data?.return?.status}): ${data?.return?.message}`);
        return { success: false, message: data?.return?.message };
      }
    } catch (err: any) {
      // عدم ایجاد وقفه یا خطا در فرآیند سیستم در صورت قطع اینترنت، اعتبار ناکافی یا خطای سرویس‌دهنده
      logger.warn(`⚠️ [کاوه نگار] خطای ارتباطی در ارسال پیامک استاد: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  /**
   * ۲. ارسال پیامک تایید کلاس به دانش‌آموز با استفاده از الگوی کاوه‌نگار (Requestaccepted)
   */
  public static async sendStudentRequestAccepted(options: {
    mobile: string;
    studentName: string;
    classTime: Date | string;
  }): Promise<{ success: boolean; message?: string }> {
    try {
      const cleanPhone = this.normalizePhone(options.mobile);
      if (cleanPhone.length !== 11 || !cleanPhone.startsWith('09')) {
        logger.warn(`⚠️ [کاوه نگار] شماره موبایل دانش‌آموز نامعتبر است: ${options.mobile}`);
        return { success: false, message: 'شماره موبایل دانش‌آموز نامعتبر است' };
      }

      const apiKey = process.env.KAVENEGAR_API_KEY || this.apiKey;
      const url = `https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json`;

      // زمان برگزاری کلاس برای token (طبق مستندات: حتماً بدون فاصله!)
      let timeToken = 'ساعت_مقرر';
      if (options.classTime instanceof Date || (typeof options.classTime === 'string' && !isNaN(Date.parse(options.classTime)))) {
        try {
          const d = new Date(options.classTime);
          timeToken = moment(d).format('jYYYY/jMM/jDD_HH:mm');
        } catch (_) {}
      } else if (options.classTime) {
        timeToken = this.sanitizeSingleToken(String(options.classTime), 'ساعت_مقرر');
      }

      timeToken = this.sanitizeSingleToken(timeToken, 'ساعت_مقرر');

      const params = new URLSearchParams({
        receptor: cleanPhone,
        template: 'Requestaccepted',
        token: timeToken, // زمان کلاس بدون فاصله
        token2: this.sanitizeSingleToken(options.studentName, 'دانش‌آموز'), // نام دانش‌آموز بدون فاصله
        type: 'sms',
      });

      logger.info(`📤 [کاوه نگار] ارسال پیامک تایید کلاس به دانش‌آموز (${cleanPhone})...`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        },
        body: params.toString(),
      });

      const data: any = await response.json();
      if (data?.return?.status === 200) {
        logger.info(`✅ [کاوه نگار] پیامک تایید کلاس با موفقیت به دانش‌آموز ${cleanPhone} ارسال شد.`);
        return { success: true, message: 'پیامک به دانش‌آموز ارسال شد' };
      } else {
        logger.warn(`⚠️ [کاوه نگار] عدم ارسال پیامک به دانش‌آموز (کد ${data?.return?.status}): ${data?.return?.message}`);
        return { success: false, message: data?.return?.message };
      }
    } catch (err: any) {
      // عدم ایجاد وقفه یا خطا در فرآیند سیستم در صورت قطع اینترنت، اعتبار ناکافی یا خطای سرویس‌دهنده
      logger.warn(`⚠️ [کاوه نگار] خطای ارتباطی در ارسال پیامک دانش‌آموز: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  /**
   * اعتبارسنجی کد وارد شده توسط کاربر
   */
  public static verifyOtp(phoneNumber: string, enteredOtp: string): boolean {
    if (!enteredOtp) return false;
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const cleanOtp = enteredOtp.toString().trim();

    // بررسی دقیق در کش OTP معتبر ارسال‌شده با کاوه‌نگار
    const cached = otpCache.get(cleanPhone);
    if (cached) {
      if (Date.now() > cached.expiresAt) {
        otpCache.delete(cleanPhone);
        return false;
      }
      if (cached.code === cleanOtp) {
        otpCache.delete(cleanPhone); // یکبار مصرف
        return true;
      }
    }

    return false;
  }
}


import { logger } from '../utils/logger.js';

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
    let clean = (phone || '').toString().replace(/[^0-9]/g, '');
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

    // حالت توسعه بدون کلید کاوه‌نگار
    if (!this.isProductionSms()) {
      const mockOtp = '12345';
      otpCache.set(cleanPhone, {
        code: mockOtp,
        expiresAt: now + 5 * 60 * 1000,
        resendAvailableAt: now + this.COOLDOWN_SECONDS * 1000,
        sentAt: now,
      });

      logger.info(`📲 [کاوه نگار - حالت توسعه] ارسال کد تایید به ${cleanPhone}: ${mockOtp}`);
      return {
        success: true,
        remainingSeconds: this.COOLDOWN_SECONDS,
        message: 'کد تایید ارسال شد (کد تستی: ۱۲۳۴۵)',
        otp: mockOtp,
      };
    }

    // تولید کد تصادفی ۵ رقمی
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
        otpCache.delete(cleanPhone); // در صورت بروز خطای وب‌سرویس، قفل آزاد شود تا کاربر گیر نکند
        return { success: false, message: data?.return?.message || 'خطا در وب‌سرویس ارسال پیامک کاوه‌نگار' };
      }
    } catch (error: any) {
      logger.error(`❌ [کاوه نگار] خطای ارتباطی با وب‌سرویس:`, error.message);
      otpCache.delete(cleanPhone);
      return { success: false, message: 'خطای شبکه در ارسال پیامک' };
    }
  }

  /**
   * اعتبارسنجی کد وارد شده توسط کاربر
   */
  public static verifyOtp(phoneNumber: string, enteredOtp: string): boolean {
    if (!enteredOtp) return false;
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const cleanOtp = enteredOtp.toString().trim();

    // ۱. کد ثابت ۱۲۳۴۵ تا زمانی که کاربر در مرحله تست و استقرار است همیشه معتبر است
    if (cleanOtp === '12345') {
      return true;
    }

    // ۲. بررسی در کش اگر کد دیگری فرستاده شده باشد
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


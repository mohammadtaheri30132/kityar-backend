import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

// این کلید رو تو محیط واقعی حتماً ببر داخل فایل .env
const HMAC_SECRET =  'aksdmaskdmsdmadk@#$@#$FDFDgdfgifhsdhj9ne23nn2j3neifoinf2noifen9n';

export const verifyHMAC = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const clientSignature = req.headers['x-signature'] as string;
    const timestamp = req.headers['x-timestamp'] as string;

    if (!clientSignature || !timestamp) {
      res.status(401).json({ success: false, message: 'امضای درخواست نامعتبر است' });
      return;
    }

    // بررسی انقضای زمان
    const now = Date.now();
    if (now - parseInt(timestamp) > 60000) {
      res.status(401).json({ success: false, message: 'درخواست منقضی شده است' });
      return;
    }

    // محافظت در برابر خالی بودن body
    const bodyString = (req.body && Object.keys(req.body).length) ? JSON.stringify(req.body) : '';
    const endpoint = req.originalUrl.split('?')[0]; 
    const message = `${timestamp}:${endpoint}:${bodyString}`;

    const serverSignature = crypto
      .createHmac('sha256', HMAC_SECRET)
      .update(message)
      .digest('hex');

    // 👈 جلوگیری از کرش کردن تابع timingSafeEqual به خاطر اختلاف طول امضا
    if (clientSignature.length !== serverSignature.length) {
      res.status(401).json({ success: false, message: 'طول امضا نامعتبر است' });
      return;
    }

    if (crypto.timingSafeEqual(Buffer.from(clientSignature), Buffer.from(serverSignature))) {
      next(); 
    } else {
      res.status(401).json({ success: false, message: 'امضا تطابق ندارد' });
    }
  } catch (error) {
    // 👈 اگر هر اتفاق غیرمنتظره‌ای افتاد، لاگ بنداز تا دقیقاً بفهمیم مشکل کجاست
    console.error('❌ HMAC Verification Error:', error);
    res.status(500).json({ success: false, message: 'خطای داخلی در اعتبارسنجی امضا' });
  }
};
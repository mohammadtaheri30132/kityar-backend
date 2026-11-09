import { Request, Response } from 'express';
import { NokitaSiteSettings } from '../../../core/models/NokitaSiteSettings.js';
import { logger } from '../../../core/utils/logger.js';

async function ensureNokitaSettings() {
  let settings = await NokitaSiteSettings.findOne({ key: 'default' });
  if (!settings) {
    settings = await NokitaSiteSettings.create({ key: 'default' });
  }
  return settings;
}

/**
 * دریافت تنظیمات کامل سایت نوکیتا برای پنل ادمین
 */
export const getAdminNokitaSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = await ensureNokitaSettings();
    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error: any) {
    logger.error('❌ خطا در دریافت تنظیمات ادمین نوکیتا:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت تنظیمات' });
  }
};

/**
 * به‌روزرسانی تنظیمات سایت نوکیتا از طریق پنل ادمین
 */
export const updateAdminNokitaSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = await ensureNokitaSettings();
    const body = req.body || {};

    if (body.homeHero) settings.homeHero = { ...settings.homeHero, ...body.homeHero };
    if (body.appDownload) settings.appDownload = { ...settings.appDownload, ...body.appDownload };
    if (body.features) settings.features = body.features;
    if (body.faqList) settings.faqList = body.faqList;
    if (body.pages) settings.pages = { ...settings.pages, ...body.pages };
    if (body.seo) settings.seo = { ...settings.seo, ...body.seo };

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'تنظیمات سایت نوکیتا با موفقیت ذخیره شد.',
      data: settings,
    });
  } catch (error: any) {
    logger.error('❌ خطا در ذخیره تنظیمات ادمین نوکیتا:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در ذخیره تنظیمات' });
  }
};


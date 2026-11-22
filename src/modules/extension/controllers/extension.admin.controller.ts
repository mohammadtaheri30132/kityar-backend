import { Request, Response } from 'express';
import { ExtensionShortcut } from '../models/ExtensionShortcut.js';
import { ExtensionCalendarEvent } from '../models/ExtensionCalendarEvent.js';
import { ExtensionNotification } from '../models/ExtensionNotification.js';
import { ExtensionTeacher } from '../models/ExtensionTeacher.js';
import { ExtensionChatMessage } from '../models/ExtensionChatMessage.js';
import { ExtensionNews } from '../models/ExtensionNews.js';
import { ExtensionSettings } from '../models/ExtensionSettings.js';

export class ExtensionAdminController {
  /**
   * خلاصه آمار و وضعیت افزونه فرهنگیان
   */
  public static async getOverview(req: Request, res: Response): Promise<void> {
    try {
      const [teachersCount, shortcutsCount, eventsCount, notificationsCount, messagesCount, newsCount] = await Promise.all([
        ExtensionTeacher.countDocuments(),
        ExtensionShortcut.countDocuments({ isActive: true }),
        ExtensionCalendarEvent.countDocuments({ isActive: true }),
        ExtensionNotification.countDocuments({ isActive: true }),
        ExtensionChatMessage.countDocuments(),
        ExtensionNews.countDocuments({ isPublished: true }),
      ]);

      const recentTeachers = await ExtensionTeacher.find()
        .sort({ createdAt: -1 })
        .limit(5);

      res.json({
        success: true,
        data: {
          teachersCount,
          shortcutsCount,
          eventsCount,
          notificationsCount,
          messagesCount,
          newsCount,
          recentTeachers,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در دریافت آمار افزونه', error: error.message });
    }
  }

  // ==================== بخش وب‌سایت‌ها و دسته‌بندی‌ها ====================

  public static async getShortcuts(req: Request, res: Response): Promise<void> {
    try {
      const shortcuts = await ExtensionShortcut.find().sort({ order: 1, createdAt: 1 });
      res.json({ success: true, shortcuts });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در دریافت وب‌سایت‌ها', error: error.message });
    }
  }

  public static async createShortcut(req: Request, res: Response): Promise<void> {
    try {
      const { title, url, icon, description, category, isPinned, order } = req.body;
      if (!title || !url) {
        res.status(400).json({ success: false, message: 'عنوان و آدرس وب‌سایت الزامی است' });
        return;
      }

      let finalOrder = typeof order === 'number' ? order : 0;
      if (isPinned) {
        const minOrderDoc = await ExtensionShortcut.findOne().sort({ order: 1 });
        if (minOrderDoc && minOrderDoc.order <= finalOrder) {
          finalOrder = minOrderDoc.order - 1;
        }
      }

      const shortcut = new ExtensionShortcut({
        title: title.trim(),
        url: url.trim(),
        icon: icon || '🌐',
        description: description || '',
        category: category?.trim() || 'سامانه‌های رسمی',
        isPinned: isPinned ?? true,
        order: finalOrder,
        isActive: true,
      });

      await shortcut.save();
      res.status(201).json({ success: true, message: 'وب‌سایت با موفقیت افزوده شد', shortcut });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در ثبت وب‌سایت', error: error.message });
    }
  }

  public static async updateShortcut(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updated = await ExtensionShortcut.findByIdAndUpdate(id, req.body, { new: true });
      if (!updated) {
        res.status(404).json({ success: false, message: 'وب‌سایت یافت نشد' });
        return;
      }
      res.json({ success: true, message: 'وب‌سایت با موفقیت ویرایش شد', shortcut: updated });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در ویرایش وب‌سایت', error: error.message });
    }
  }

  public static async deleteShortcut(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await ExtensionShortcut.findByIdAndDelete(id);
      res.json({ success: true, message: 'وب‌سایت با موفقیت حذف شد' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در حذف وب‌سایت', error: error.message });
    }
  }

  // ==================== ماژول اخبار آموزش و پرورش ====================

  public static async getNews(req: Request, res: Response): Promise<void> {
    try {
      const news = await ExtensionNews.find().sort({ order: 1, publishedAt: -1, createdAt: -1 });
      res.json({ success: true, news });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در دریافت اخبار', error: error.message });
    }
  }

  public static async createNews(req: Request, res: Response): Promise<void> {
    try {
      const { title, summary, content, category, imageUrl, externalUrl, isPublished, publishedAt, order } = req.body;
      if (!title) {
        res.status(400).json({ success: false, message: 'عنوان خبر الزامی است' });
        return;
      }

      const item = new ExtensionNews({
        title: title.trim(),
        summary: summary?.trim() || '',
        content: content?.trim() || '',
        category: category?.trim() || 'اخبار مهم',
        imageUrl: imageUrl?.trim() || '',
        externalUrl: externalUrl?.trim() || '',
        isPublished: isPublished ?? true,
        publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
        order: typeof order === 'number' ? order : 0,
      });

      await item.save();
      res.status(201).json({ success: true, message: 'خبر با موفقیت ثبت شد', news: item });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در ثبت خبر', error: error.message });
    }
  }

  public static async updateNews(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updated = await ExtensionNews.findByIdAndUpdate(id, req.body, { new: true });
      if (!updated) {
        res.status(404).json({ success: false, message: 'خبر یافت نشد' });
        return;
      }
      res.json({ success: true, message: 'خبر با موفقیت بروزرسانی شد', news: updated });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در ویرایش خبر', error: error.message });
    }
  }

  public static async deleteNews(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await ExtensionNews.findByIdAndDelete(id);
      res.json({ success: true, message: 'خبر با موفقیت حذف شد' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در حذف خبر', error: error.message });
    }
  }

  // ==================== تنظیمات عمومی و دروس و دسته‌ها ====================

  public static async getSettings(req: Request, res: Response): Promise<void> {
    try {
      let settings = await ExtensionSettings.findOne();
      if (!settings) {
        settings = await ExtensionSettings.create({});
      }
      res.json({ success: true, settings });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در دریافت تنظیمات', error: error.message });
    }
  }

  public static async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      const { newsArchiveUrl, shortcutCategories, subjects } = req.body;
      let settings = await ExtensionSettings.findOne();
      if (!settings) {
        settings = new ExtensionSettings();
      }

      if (newsArchiveUrl !== undefined) settings.newsArchiveUrl = String(newsArchiveUrl).trim();
      if (Array.isArray(shortcutCategories)) {
        settings.shortcutCategories = shortcutCategories.map((s: string) => s.trim()).filter(Boolean);
      }
      if (subjects) {
        if (Array.isArray(subjects.elementary)) settings.subjects.elementary = subjects.elementary;
        if (Array.isArray(subjects.highschool)) settings.subjects.highschool = subjects.highschool;
      }

      await settings.save();
      res.json({ success: true, message: 'تنظیمات با موفقیت ذخیره شد', settings });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در ذخیره تنظیمات', error: error.message });
    }
  }

  // ==================== بخش تقویم و روزهای خاص / امتحانات ====================

  public static async getCalendarEvents(req: Request, res: Response): Promise<void> {
    try {
      const events = await ExtensionCalendarEvent.find().sort({ month: 1, day: 1 });
      res.json({ success: true, events });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در دریافت روزهای تقویم', error: error.message });
    }
  }

  public static async createCalendarEvent(req: Request, res: Response): Promise<void> {
    try {
      const { day, month, year, title, description, isExam, hasBlueDot, badgeText } = req.body;
      if (!day || !month || !title) {
        res.status(400).json({ success: false, message: 'روز، ماه و عنوان رویداد الزامی است' });
        return;
      }

      const jalaliDate = `${month}-${day}`;
      const event = new ExtensionCalendarEvent({
        jalaliDate,
        day: Number(day),
        month: Number(month),
        year: year ? Number(year) : undefined,
        title: title.trim(),
        description: description || '',
        isExam: isExam ?? true,
        hasBlueDot: hasBlueDot ?? true,
        badgeText: badgeText || (isExam ? 'امتحانات' : 'رویداد'),
        isActive: true,
      });

      await event.save();
      res.status(201).json({ success: true, message: 'روز خاص با موفقیت در تقویم ثبت شد', event });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در ایجاد روز خاص تقویم', error: error.message });
    }
  }

  public static async deleteCalendarEvent(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await ExtensionCalendarEvent.findByIdAndDelete(id);
      res.json({ success: true, message: 'رویداد تقویم حذف شد' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در حذف رویداد تقویم', error: error.message });
    }
  }

  // ==================== بخش ارسال خبر و اعلان به افزونه ====================

  public static async getNotifications(req: Request, res: Response): Promise<void> {
    try {
      const notifications = await ExtensionNotification.find().sort({ createdAt: -1 });
      res.json({ success: true, notifications });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در دریافت اعلانات', error: error.message });
    }
  }

  public static async broadcastNotification(req: Request, res: Response): Promise<void> {
    try {
      const { title, message, tag, linkUrl } = req.body;
      if (!title || !message) {
        res.status(400).json({ success: false, message: 'عنوان و متن اعلان الزامی است' });
        return;
      }

      const notif = new ExtensionNotification({
        title: title.trim(),
        message: message.trim(),
        tag: tag || 'خبر مهم',
        linkUrl: linkUrl || '',
        sentAt: new Date(),
        isActive: true,
      });

      await notif.save();
      res.status(201).json({ success: true, message: 'اعلان با موفقیت برای تمامی کاربران ارسال شد', notification: notif });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در ارسال اعلان', error: error.message });
    }
  }

  public static async deleteNotification(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await ExtensionNotification.findByIdAndDelete(id);
      res.json({ success: true, message: 'اعلان حذف شد' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در حذف اعلان', error: error.message });
    }
  }

  // ==================== بخش همکاران و معلمان ثبت‌نام‌شده ====================

  public static async getTeachers(req: Request, res: Response): Promise<void> {
    try {
      const search = String(req.query.search || '').trim();
      const query: any = {};
      if (search) {
        query.$or = [
          { fullName: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { schoolName: { $regex: search, $options: 'i' } },
          { districtName: { $regex: search, $options: 'i' } },
          { role: { $regex: search, $options: 'i' } },
        ];
      }

      const teachers = await ExtensionTeacher.find(query).sort({ createdAt: -1 });
      res.json({ success: true, teachers });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در دریافت فهرست همکاران', error: error.message });
    }
  }
}

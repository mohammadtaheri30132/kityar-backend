import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { SmsService } from '../../../core/services/sms.service.js';
import { ExtensionShortcut } from '../models/ExtensionShortcut.js';
import { ExtensionCalendarEvent } from '../models/ExtensionCalendarEvent.js';
import { ExtensionNotification } from '../models/ExtensionNotification.js';
import { ExtensionTeacher } from '../models/ExtensionTeacher.js';
import { ExtensionChatMessage } from '../models/ExtensionChatMessage.js';
import { ExtensionNews } from '../models/ExtensionNews.js';
import { ExtensionSettings } from '../models/ExtensionSettings.js';
import { User } from '../../../core/models/User.js';

// پیش‌فرض‌های اولیه وب‌سایت‌های کاربردی فرهنگیان
const DEFAULT_SHORTCUTS = [
  { title: 'سامانه مای مدیو', url: 'https://my.medu.ir', icon: '🏛️', description: 'پنجره واحد خدمات الکترونیک آموزش و پرورش', category: 'سامانه‌های رسمی', isPinned: true, order: 1 },
  { title: 'سامانه شاد (تحت وب)', url: 'https://web.shad.ir', icon: '💬', description: 'شبکه آموزش دانش‌آموزی', category: 'سامانه‌های رسمی', isPinned: true, order: 2 },
  { title: 'سامانه ضمن خدمت (LTMS)', url: 'https://ltms.cfu.ac.ir', icon: '🎓', description: 'دوره‌های آموزش و ارتقای مهارت معلمان', category: 'سامانه‌های رسمی', isPinned: true, order: 3 },
  { title: 'سامانه فیش حقوقی فرهنگیان', url: 'https://my.medu.ir', icon: '💳', description: 'مشاهده و چاپ فیش و احکام کارگزینی', category: 'خدمات اداری', isPinned: true, order: 4 },
  { title: 'اتوماسیون اداری مدارس', url: 'https://my.medu.ir', icon: '📂', description: 'نامه‌نگاری و بخشنامه‌های اداری آموزش و پرورش', category: 'خدمات اداری', isPinned: true, order: 5 },
];

// پیش‌فرض‌های اولیه رویدادهای تقویم و امتحانات
const DEFAULT_CALENDAR_EVENTS = [
  { jalaliDate: '9-24', day: 24, month: 9, title: 'آغاز امتحانات نوبت اول', description: 'شروع امتحانات دی‌ماه مدارس', isExam: true, hasBlueDot: true, badgeText: 'امتحانات' },
  { jalaliDate: '10-24', day: 24, month: 10, title: 'ارزیابی مستمر عملکرد دانش‌آموزان', description: 'ثبت نمرات پایانی نوبت اول در سیدا', isExam: true, hasBlueDot: true, badgeText: 'ثبت نمرات' },
  { jalaliDate: '2-12', day: 12, month: 2, title: 'روز معلم و بزرگداشت مقام معلم', description: 'مراسم تکریم معلمان نمونه', isExam: false, hasBlueDot: true, badgeText: 'روز معلم' },
];

export class ExtensionPublicController {
  /**
   * دریافت تنظیمات داینامیک، وب‌سایت‌ها، رویدادها، اعلانات، اخبار و دروس
   */
  public static async getConfig(req: Request, res: Response): Promise<void> {
    try {
      // 1. بررسی و بارگذاری وب‌سایت‌ها
      let shortcuts = await ExtensionShortcut.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
      if (shortcuts.length === 0) {
        await ExtensionShortcut.insertMany(DEFAULT_SHORTCUTS);
        shortcuts = await ExtensionShortcut.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
      }

      // 2. تنظیمات عمومی افزونه (دسته‌بندی‌ها، آرشیو اخبار، لیست دروس)
      let settings = await ExtensionSettings.findOne();
      if (!settings) {
        settings = await ExtensionSettings.create({});
      }

      // 3. اخبار منتشرشده آموزش و پرورش
      const news = await ExtensionNews.find({ isPublished: true })
        .sort({ order: 1, publishedAt: -1, createdAt: -1 })
        .limit(10);

      // 4. رویدادهای تقویم و روزهای امتحانات با نقطه آبی
      let calendarEvents = await ExtensionCalendarEvent.find({ isActive: true }).sort({ month: 1, day: 1 });
      if (calendarEvents.length === 0) {
        await ExtensionCalendarEvent.insertMany(DEFAULT_CALENDAR_EVENTS);
        calendarEvents = await ExtensionCalendarEvent.find({ isActive: true }).sort({ month: 1, day: 1 });
      }

      // 5. اعلانات فوری
      const notifications = await ExtensionNotification.find({ isActive: true })
        .sort({ sentAt: -1, createdAt: -1 })
        .limit(10);

      const upcomingEvents = calendarEvents.map((e) => ({
        id: e._id,
        date: `${e.month}/${e.day}`,
        title: e.title,
        description: e.description,
        isExam: e.isExam,
        hasBlueDot: e.hasBlueDot,
        badgeText: e.badgeText,
      }));

      res.json({
        success: true,
        data: {
          appName: 'فرهنگیان',
          shortcuts,
          shortcutCategories: settings.shortcutCategories,
          calendarEvents,
          upcomingEvents,
          notifications,
          news,
          newsArchiveUrl: settings.newsArchiveUrl,
          subjects: settings.subjects,
          syncedAt: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در دریافت اطلاعات سرور', error: error.message });
    }
  }

  /**
   * ارسال کد تایید پیامکی به شماره تلفن همراه معلم
   */
  public static async sendOtp(req: Request, res: Response): Promise<void> {
    try {
      const { phone } = req.body;
      const cleanPhone = SmsService.normalizePhone(phone);

      if (!cleanPhone || cleanPhone.length !== 11 || !cleanPhone.startsWith('09')) {
        res.status(400).json({ success: false, message: 'شماره تلفن همراه معتبر نیست (باید ۱۱ رقمی با ۰۹ باشد)' });
        return;
      }

      const result = await SmsService.sendOtp(cleanPhone);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در ارسال کد تایید پیامکی', error: error.message });
    }
  }

  /**
   * تایید کد پیامکی، ثبت‌نام یا ورود معلم همراه ذخیره پروفایل، سمت و محیط کاری
   */
  public static async verifyOtp(req: Request, res: Response): Promise<void> {
    try {
      const { phone, code, fullName, workMode, schoolName, districtName, role, city, fileUrl, fileName } = req.body;
      const cleanPhone = SmsService.normalizePhone(phone);

      if (!cleanPhone || !code) {
        res.status(400).json({ success: false, message: 'شماره تلفن همراه و کد تایید پیامکی الزامی است' });
        return;
      }

      const isValid = SmsService.verifyOtp(cleanPhone, code);
      if (!isValid) {
        res.status(400).json({ success: false, message: 'کد تایید پیامکی وارد شده اشتباه است یا منقضی شده است' });
        return;
      }

      const mode: 'school' | 'office' = workMode === 'office' ? 'office' : 'school';

      // بروزرسانی یا ثبت معلم در سیستم
      let teacher = await ExtensionTeacher.findOne({ phone: cleanPhone });
      if (!teacher) {
        teacher = new ExtensionTeacher({
          phone: cleanPhone,
          fullName: fullName?.trim() || 'همکار فرهنگی',
          workMode: mode,
          schoolName: schoolName?.trim() || '',
          districtName: districtName?.trim() || '',
          role: role?.trim() || (mode === 'office' ? 'کارشناس اداره' : 'معلم'),
          city: city?.trim() || 'تهران',
          fileUrl: fileUrl || '',
          fileName: fileName || '',
          isVerified: true,
          lastActive: new Date(),
        });
      } else {
        if (fullName) teacher.fullName = fullName.trim();
        if (workMode) teacher.workMode = mode;
        if (schoolName !== undefined) teacher.schoolName = schoolName.trim();
        if (districtName !== undefined) teacher.districtName = districtName.trim();
        if (role) teacher.role = role.trim();
        if (city) teacher.city = city.trim();
        if (fileUrl) teacher.fileUrl = fileUrl;
        if (fileName) teacher.fileName = fileName;
        teacher.lastActive = new Date();
      }

      // همگام‌سازی کاربر در صورت نیاز
      let user = await User.findOne({ username: cleanPhone });
      if (!user) {
        user = new User({
          username: cleanPhone,
          phoneNumber: cleanPhone,
          fullName: teacher.fullName,
          role: 'teacher',
          password: 'Teacher@' + Math.random().toString(36).slice(-6),
          isActive: true,
        });
        await user.save();
      }
      teacher.userId = user._id as any;
      await teacher.save();

      // صدور توکن JWT
      const secret = process.env.JWT_SECRET || 'your_super_secret_key';
      const token = jwt.sign(
        {
          id: user._id,
          userId: user._id,
          phone: cleanPhone,
          role: 'teacher',
          fullName: teacher.fullName,
        },
        secret,
        { expiresIn: '60d' }
      );

      res.json({
        success: true,
        message: 'ورود موفقیت‌آمیز بود',
        token,
        teacher: {
          id: teacher._id,
          phone: teacher.phone,
          fullName: teacher.fullName,
          workMode: teacher.workMode,
          schoolName: teacher.schoolName,
          districtName: teacher.districtName,
          role: teacher.role,
          city: teacher.city,
          fileUrl: teacher.fileUrl,
          fileName: teacher.fileName,
          isVerified: teacher.isVerified,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در احراز هویت همکار', error: error.message });
    }
  }

  /**
   * بررسی وجود همکار با شماره تلفن برای شروع چت
   */
  public static async checkColleague(req: Request, res: Response): Promise<void> {
    try {
      const { phone } = req.body;
      const cleanPhone = SmsService.normalizePhone(phone);

      if (!cleanPhone || cleanPhone.length !== 11) {
        res.status(400).json({ success: false, message: 'شماره تلفن همراه معتبر نیست' });
        return;
      }

      const colleague = await ExtensionTeacher.findOne({ phone: cleanPhone });

      if (colleague) {
        res.json({
          success: true,
          exists: true,
          colleague: {
            phone: colleague.phone,
            fullName: colleague.fullName,
            schoolName: colleague.schoolName,
            districtName: colleague.districtName,
            role: colleague.role,
            avatarUrl: colleague.avatarUrl || '',
          },
        });
      } else {
        const inviteMessage = `همکار گرامی سلام؛\nجهت ارتباط کاری، گفتگوی مستقیم و اشتراک فایل‌های آموزشی در «میز کار فرهنگیان»، لطفاً افزونه فرهنگیان را نصب بفرمایید:\nhttps://my.medu.ir`;
        res.json({
          success: true,
          exists: false,
          phone: cleanPhone,
          inviteMessage,
        });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در بررسی شماره همکار', error: error.message });
    }
  }

  /**
   * دریافت تعداد کل پیام‌های خوانده‌نشده کاربر
   */
  public static async getUnreadCount(req: Request, res: Response): Promise<void> {
    try {
      const phone = SmsService.normalizePhone(String(req.query.phone || ''));
      if (!phone) {
        res.status(400).json({ success: false, message: 'شماره کاربر الزامی است' });
        return;
      }

      const unreadCount = await ExtensionChatMessage.countDocuments({
        receiverPhone: phone,
        isRead: false,
      });

      res.json({ success: true, unreadCount });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در شمارش پیام‌های خوانده‌نشده', error: error.message });
    }
  }

  /**
   * دریافت فهرست گفتگوها همراه با آخرین پیام و تعداد خوانده‌نشده
   */
  public static async getConversations(req: Request, res: Response): Promise<void> {
    try {
      const phone = SmsService.normalizePhone(String(req.query.phone || (req as any).user?.phoneNumber || ''));
      if (!phone) {
        res.status(400).json({ success: false, message: 'شماره کاربر الزامی است' });
        return;
      }

      const messages = await ExtensionChatMessage.find({
        $or: [{ senderPhone: phone }, { receiverPhone: phone }],
      }).sort({ createdAt: -1 });

      const colleaguesMap = new Map<string, { lastMessage: any; unreadCount: number }>();

      for (const m of messages) {
        const otherPhone = m.senderPhone === phone ? m.receiverPhone : m.senderPhone;
        if (!colleaguesMap.has(otherPhone)) {
          colleaguesMap.set(otherPhone, {
            lastMessage: m,
            unreadCount: 0,
          });
        }
        if (m.receiverPhone === phone && !m.isRead) {
          colleaguesMap.get(otherPhone)!.unreadCount++;
        }
      }

      const conversationList = [];
      for (const [colleaguePhone, info] of colleaguesMap.entries()) {
        const teacher = await ExtensionTeacher.findOne({ phone: colleaguePhone });
        const name = teacher?.fullName || `همکار (${colleaguePhone})`;
        conversationList.push({
          phone: colleaguePhone,
          colleaguePhone,
          fullName: name,
          colleagueName: name,
          schoolName: teacher?.schoolName || '',
          districtName: teacher?.districtName || '',
          role: teacher?.role || 'معلم',
          lastMessage: info.lastMessage.text || (info.lastMessage.fileUrl ? '📎 فایل پیوست' : ''),
          lastMessageText: info.lastMessage.text || (info.lastMessage.fileUrl ? '📎 فایل پیوست' : ''),
          lastMessageAt: info.lastMessage.createdAt,
          lastMessageTime: info.lastMessage.createdAt,
          unreadCount: info.unreadCount,
        });
      }

      res.json({ success: true, conversations: conversationList });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در دریافت لیست گفتگوها', error: error.message });
    }
  }

  /**
   * علامت‌گذاری پیام‌های دریافتی از یک همکار به عنوان خوانده‌شده
   */
  public static async markChatRead(req: Request, res: Response): Promise<void> {
    try {
      const { phone, colleaguePhone } = req.body;
      const cleanPhone = SmsService.normalizePhone(phone);
      const cleanColleaguePhone = SmsService.normalizePhone(colleaguePhone);

      if (!cleanPhone || !cleanColleaguePhone) {
        res.status(400).json({ success: false, message: 'شماره تلفن‌ها الزامی است' });
        return;
      }

      await ExtensionChatMessage.updateMany(
        { senderPhone: cleanColleaguePhone, receiverPhone: cleanPhone, isRead: false },
        { isRead: true }
      );

      res.json({ success: true, message: 'پیام‌ها به عنوان خوانده‌شده علامت‌گذاری شدند' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در علامت‌گذاری پیام‌ها', error: error.message });
    }
  }

  /**
   * تاریخچه پیام‌های ردوبدل شده بین دو همکار
   */
  public static async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const phone = SmsService.normalizePhone(String(req.query.phone || ''));
      const colleaguePhone = SmsService.normalizePhone(String(req.query.colleaguePhone || ''));

      if (!phone || !colleaguePhone) {
        res.status(400).json({ success: false, message: 'شماره‌های گفتگو الزامی است' });
        return;
      }

      const messages = await ExtensionChatMessage.find({
        $or: [
          { senderPhone: phone, receiverPhone: colleaguePhone },
          { senderPhone: colleaguePhone, receiverPhone: phone },
        ],
      }).sort({ createdAt: 1 });

      await ExtensionChatMessage.updateMany(
        { senderPhone: colleaguePhone, receiverPhone: phone, isRead: false },
        { isRead: true }
      );

      res.json({ success: true, messages });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در دریافت پیام‌ها', error: error.message });
    }
  }

  /**
   * ارسال پیام متنی یا فایلی به همکار
   */
  public static async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { senderPhone, receiverPhone, senderName, text, fileUrl, fileName, fileSize, fileType } = req.body;
      const cleanSender = SmsService.normalizePhone(senderPhone);
      const cleanReceiver = SmsService.normalizePhone(receiverPhone);

      if (!cleanSender || !cleanReceiver) {
        res.status(400).json({ success: false, message: 'شماره فرستنده و گیرنده الزامی است' });
        return;
      }

      if (!text && !fileUrl) {
        res.status(400).json({ success: false, message: 'متن پیام یا فایل الزامی است' });
        return;
      }

      const msg = new ExtensionChatMessage({
        senderPhone: cleanSender,
        receiverPhone: cleanReceiver,
        senderName: senderName || 'همکار',
        text: text || '',
        fileUrl: fileUrl || '',
        fileName: fileName || '',
        fileSize: fileSize || '',
        fileType: fileType || 'file',
        isRead: false,
      });

      await msg.save();
      res.json({ success: true, message: msg });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در ارسال پیام', error: error.message });
    }
  }

  /**
   * دریافت لیست دروس مدرسه بر اساس مقطع تحصیلی (elementary | highschool)
   */
  public static async getSubjects(req: Request, res: Response): Promise<void> {
    try {
      const gradeLevel = String(req.query.gradeLevel || 'elementary') as 'elementary' | 'highschool';
      let settings = await ExtensionSettings.findOne();
      if (!settings) {
        settings = await ExtensionSettings.create({});
      }

      const subjects = settings.subjects?.[gradeLevel] || [];
      res.json({ success: true, subjects });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در دریافت لیست دروس', error: error.message });
    }
  }

  /**
   * دریافت برنامه هفتگی مدرسه معلم
   */
  public static async getSchedule(req: Request, res: Response): Promise<void> {
    try {
      const phone = SmsService.normalizePhone(String(req.query.phone || ''));
      if (!phone) {
        res.status(400).json({ success: false, message: 'شماره تلفن همراه الزامی است' });
        return;
      }

      const teacher = await ExtensionTeacher.findOne({ phone });
      res.json({ success: true, schedule: teacher?.schedule || {} });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در دریافت برنامه مدرسه', error: error.message });
    }
  }

  /**
   * ذخیره یا به‌روزرسانی برنامه هفتگی مدرسه معلم
   */
  public static async saveSchedule(req: Request, res: Response): Promise<void> {
    try {
      const { phone, schedule } = req.body;
      const cleanPhone = SmsService.normalizePhone(phone);
      if (!cleanPhone) {
        res.status(400).json({ success: false, message: 'شماره تلفن همراه الزامی است' });
        return;
      }

      let teacher = await ExtensionTeacher.findOne({ phone: cleanPhone });
      if (!teacher) {
        teacher = new ExtensionTeacher({
          phone: cleanPhone,
          fullName: 'همکار فرهنگی',
          schedule: schedule || {},
        });
      } else {
        teacher.schedule = schedule || {};
      }
      await teacher.save();

      res.json({ success: true, message: 'برنامه مدرسه با موفقیت ذخیره شد' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در ذخیره برنامه مدرسه', error: error.message });
    }
  }

  /**
   * دریافت اعلان‌های جدیدتر از یک زمان مشخص
   */
  public static async pollNotifications(req: Request, res: Response): Promise<void> {
    try {
      const since = req.query.since ? new Date(String(req.query.since)) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const notifications = await ExtensionNotification.find({
        isActive: true,
        sentAt: { $gt: since },
      }).sort({ sentAt: -1 });

      res.json({ success: true, notifications });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'خطا در دریافت اعلان‌ها', error: error.message });
    }
  }
}

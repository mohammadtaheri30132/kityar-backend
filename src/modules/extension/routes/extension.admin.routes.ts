import { Router } from 'express';
import { ExtensionAdminController } from '../controllers/extension.admin.controller.js';
import { protect, adminOnly } from '../../../core/middleware/auth.js';

const router = Router();

// احراز هویت برای تمام عملیات ادمین
router.use(protect);
router.use(adminOnly);

// آمار و داشبورد کلی افزونه
router.get('/overview', ExtensionAdminController.getOverview);

// تنظیمات عمومی، دسته‌ها و لیست دروس
router.get('/settings', ExtensionAdminController.getSettings);
router.put('/settings', ExtensionAdminController.updateSettings);

// مدیریت وب‌سایت‌های پین‌شده
router.get('/shortcuts', ExtensionAdminController.getShortcuts);
router.post('/shortcuts', ExtensionAdminController.createShortcut);
router.put('/shortcuts/:id', ExtensionAdminController.updateShortcut);
router.delete('/shortcuts/:id', ExtensionAdminController.deleteShortcut);

// ماژول وبلاگ و آخرین اخبار آموزش و پرورش
router.get('/news', ExtensionAdminController.getNews);
router.post('/news', ExtensionAdminController.createNews);
router.put('/news/:id', ExtensionAdminController.updateNews);
router.delete('/news/:id', ExtensionAdminController.deleteNews);

// مدیریت تقویم و روزهای خاص / امتحانات با نقطه آبی
router.get('/calendar-events', ExtensionAdminController.getCalendarEvents);
router.post('/calendar-events', ExtensionAdminController.createCalendarEvent);
router.delete('/calendar-events/:id', ExtensionAdminController.deleteCalendarEvent);

// ارسال اعلانات و خبر فوری به افزونه
router.get('/notifications', ExtensionAdminController.getNotifications);
router.post('/notifications/broadcast', ExtensionAdminController.broadcastNotification);
router.delete('/notifications/:id', ExtensionAdminController.deleteNotification);

// مشاهده همکاران ثبت‌نام‌شده
router.get('/teachers', ExtensionAdminController.getTeachers);

export default router;

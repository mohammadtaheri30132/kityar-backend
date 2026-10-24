import { Request, Response } from 'express';
import { SupportTicket } from '../../../core/models/SupportTicket.js';
import { Notification } from '../../../core/models/Notification.js';
import { logger } from '../../../core/utils/logger.js';

export class AdminSupportController {
  /**
   * دریافت تمام تیکت‌های معلمان با فیلتر وضعیت
   */
  static async getTickets(req: Request, res: Response) {
    try {
      const { status, search } = req.query;
      const query: any = {};

      if (status && status !== 'all') {
        query.status = status;
      }

      if (search && typeof search === 'string') {
        query.$or = [
          { subject: { $regex: search, $options: 'i' } },
          { teacherName: { $regex: search, $options: 'i' } },
          { teacherPhone: { $regex: search, $options: 'i' } },
        ];
      }

      const tickets = await SupportTicket.find(query)
        .sort({ updatedAt: -1 })
        .lean();

      return res.json({
        success: true,
        data: tickets,
      });
    } catch (error: any) {
      logger.error('Error fetching admin support tickets:', error);
      return res.status(500).json({ success: false, message: 'خطا در دریافت تیکت‌های پشتیبانی' });
    }
  }

  /**
   * دریافت جزئیات یک تیکت
   */
  static async getTicketById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const ticket = await SupportTicket.findById(id).lean();

      if (!ticket) {
        return res.status(404).json({ success: false, message: 'تیکت یافت نشد' });
      }

      return res.json({
        success: true,
        data: ticket,
      });
    } catch (error: any) {
      logger.error('Error fetching admin ticket details:', error);
      return res.status(500).json({ success: false, message: 'خطا در دریافت اطلاعات تیکت' });
    }
  }

  /**
   * پاسخ ادمین به تیکت و ایجاد نوتیفیکیشن برای معلم
   */
  static async replyToTicket(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { message, status } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({ success: false, message: 'متن پاسخ الزامی است' });
      }

      const ticket = await SupportTicket.findById(id);
      if (!ticket) {
        return res.status(404).json({ success: false, message: 'تیکت مورد نظر پیدا نشد' });
      }

      ticket.messages.push({
        sender: 'admin',
        senderName: 'پشتیبانی کیتایار',
        text: message.trim(),
        createdAt: new Date(),
      });

      ticket.status = status || 'answered';
      ticket.lastReplyAt = new Date();
      await ticket.save();

      // ایجاد نوتیفیکیشن برای معلم
      try {
        await Notification.create({
          recipientType: 'teacher',
          recipientUserId: ticket.teacherId,
          recipientPhone: ticket.teacherPhone,
          senderName: 'پشتیبانی کیتایار',
          senderRole: 'admin',
          title: `پاسخ پشتیبانی به پیام شما`,
          body: message.trim().substring(0, 140),
          type: 'SYSTEM',
          priority: 'high',
          targetId: ticket._id.toString(),
          data: {
            screen: 'SupportTicketsScreen',
            ticketId: ticket._id.toString(),
            subject: ticket.subject,
          },
          isRead: false,
        });
      } catch (notifErr) {
        logger.warn('Failed to send notification for support reply:', notifErr);
      }

      return res.json({
        success: true,
        data: ticket,
        message: 'پاسخ شما با موفقیت ثبت و نوتیفیکیشن برای معلم ارسال شد',
      });
    } catch (error: any) {
      logger.error('Error replying to support ticket (admin):', error);
      return res.status(500).json({ success: false, message: 'خطا در ثبت پاسخ تیکت' });
    }
  }

  /**
   * تغییر وضعیت تیکت (باز، پاسخ‌داده‌شده، بسته)
   */
  static async updateStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['open', 'answered', 'closed'].includes(status)) {
        return res.status(400).json({ success: false, message: 'وضعیت نامعتبر است' });
      }

      const ticket = await SupportTicket.findByIdAndUpdate(
        id,
        { status },
        { new: true }
      );

      if (!ticket) {
        return res.status(404).json({ success: false, message: 'تیکت یافت نشد' });
      }

      return res.json({
        success: true,
        data: ticket,
        message: 'وضعیت تیکت بروزرسانی شد',
      });
    } catch (error: any) {
      logger.error('Error updating ticket status:', error);
      return res.status(500).json({ success: false, message: 'خطا در تغییر وضعیت تیکت' });
    }
  }
}

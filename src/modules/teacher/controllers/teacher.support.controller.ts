import { Request, Response } from 'express';
import { SupportTicket } from '../../../core/models/SupportTicket.js';
import { logger } from '../../../core/utils/logger.js';

export class TeacherSupportController {
  /**
   * دریافت تیکت‌های معلم جاری
   */
  static async getTickets(req: Request, res: Response) {
    try {
      const teacherId = (req as any).user?._id;
      const tickets = await SupportTicket.find({ teacherId })
        .sort({ updatedAt: -1 })
        .lean();

      return res.json({
        success: true,
        data: tickets,
      });
    } catch (error: any) {
      logger.error('Error fetching teacher support tickets:', error);
      return res.status(500).json({ success: false, message: 'خطا در دریافت تیکت‌های پشتیبانی' });
    }
  }

  /**
   * دریافت جزئیات یک تیکت
   */
  static async getTicketById(req: Request, res: Response) {
    try {
      const teacherId = (req as any).user?._id;
      const { id } = req.params;

      const ticket = await SupportTicket.findOne({ _id: id, teacherId }).lean();
      if (!ticket) {
        return res.status(404).json({ success: false, message: 'تیکت مورد نظر یافت نشد' });
      }

      return res.json({
        success: true,
        data: ticket,
      });
    } catch (error: any) {
      logger.error('Error fetching ticket by id:', error);
      return res.status(500).json({ success: false, message: 'خطا در دریافت اطلاعات تیکت' });
    }
  }

  /**
   * ایجاد تیکت جدید به ادمین
   */
  static async createTicket(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const { subject, message } = req.body;

      if (!subject || !message) {
        return res.status(400).json({
          success: false,
          message: 'عنوان و متن پیام الزامی است',
        });
      }

      const teacherName = user?.fullName || user?.name || 'همکار گرامی';
      const teacherPhone = user?.phoneNumber || user?.phone || '';

      const newTicket = await SupportTicket.create({
        teacherId: user._id,
        teacherName,
        teacherPhone,
        subject: subject.trim(),
        status: 'open',
        messages: [
          {
            sender: 'teacher',
            senderName: teacherName,
            senderId: user._id,
            text: message.trim(),
            createdAt: new Date(),
          },
        ],
        lastReplyAt: new Date(),
      });

      return res.status(201).json({
        success: true,
        data: newTicket,
        message: 'پیام شما به پشتیبانی ارسال شد',
      });
    } catch (error: any) {
      logger.error('Error creating support ticket:', error);
      return res.status(500).json({ success: false, message: 'خطا در ارسال پیام پشتیبانی' });
    }
  }

  /**
   * ارسال پاسخ جدید در تیکت موجود
   */
  static async replyToTicket(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      const { message } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({
          success: false,
          message: 'متن پاسخ الزامی است',
        });
      }

      const ticket = await SupportTicket.findOne({ _id: id, teacherId: user._id });
      if (!ticket) {
        return res.status(404).json({ success: false, message: 'تیکت یافت نشد' });
      }

      const teacherName = user?.fullName || user?.name || 'همکار گرامی';

      ticket.messages.push({
        sender: 'teacher',
        senderName: teacherName,
        senderId: user._id,
        text: message.trim(),
        createdAt: new Date(),
      });

      ticket.status = 'open';
      ticket.lastReplyAt = new Date();
      await ticket.save();

      return res.json({
        success: true,
        data: ticket,
        message: 'پاسخ شما ارسال شد',
      });
    } catch (error: any) {
      logger.error('Error replying to support ticket:', error);
      return res.status(500).json({ success: false, message: 'خطا در ارسال پاسخ' });
    }
  }
}

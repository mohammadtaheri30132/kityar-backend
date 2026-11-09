import { Request, Response } from 'express';
import { ClassMessage, MessageType, RecipientScope } from '../../core/models/ClassMessage.js';
import { Classroom } from '../../core/models/Classroom.js';
import { ClassMembership } from '../../core/models/ClassMembership.js';
import { Conversation } from '../../core/models/Conversation.js';
import { Message } from '../../core/models/Message.js';
import { NotificationService } from '../../core/services/notificationService.js';
import { logger } from '../../core/utils/logger.js';

export class ChatController {
  /**
   * آپلود مدیا (صوت یا تصویر webp)
   */
  static async uploadMedia(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'هیچ فایلی ارسال نشده است' });
      }

      const fileUrl = `/uploads/chat/${req.file.filename}`;
      return res.json({
        success: true,
        data: {
          url: fileUrl,
          filename: req.file.filename,
          size: req.file.size,
          mimetype: req.file.mimetype,
        },
      });
    } catch (error: any) {
      logger.error('Error in chat uploadMedia:', error);
      return res.status(500).json({ success: false, message: 'خطا در بارگذاری فایل' });
    }
  }

  /**
   * دریافت پیام‌های یک کلاس
   */
  static async getMessages(req: Request, res: Response) {
    try {
      const { classId } = req.params;
      const { targetStudentPhone } = req.query;
      const user = (req as any).user;
      const student = (req as any).student;

      const isStudent = student || user?.role === 'student';
      const studentPhone = student?.phoneNumber || user?.phoneNumber;

      let query: any = { classId };

      if (isStudent && studentPhone) {
        // دانش‌آموز فقط پیام‌های عمومی کل کلاس یا پیام‌های اختصاصی خودش را می‌بیند
        query.$or = [
          { recipientScope: 'ALL' },
          { recipientScope: 'STUDENT', targetStudentPhone: studentPhone },
          { senderPhone: studentPhone },
        ];
      } else if (targetStudentPhone && typeof targetStudentPhone === 'string') {
        // اگر معلم روی چت یک دانش‌آموز خاص فیلتر کرده باشد
        query.$or = [
          { recipientScope: 'STUDENT', targetStudentPhone },
          { senderPhone: targetStudentPhone },
          { recipientScope: 'ALL' },
        ];
      }

      const messages = await ClassMessage.find(query)
        .sort({ createdAt: 1 })
        .limit(150)
        .lean();

      return res.json({
        success: true,
        data: messages,
      });
    } catch (error: any) {
      logger.error('Error in getMessages:', error);
      return res.status(500).json({ success: false, message: 'خطا در دریافت پیام‌ها' });
    }
  }

  /**
   * ارسال پیام جدید (صوت یا عکس webp)
   */
  static async sendMessage(req: Request, res: Response) {
    try {
      const { classId } = req.params;
      const {
        messageType,
        mediaUrl,
        voiceDuration = 0,
        recipientScope = 'ALL',
        targetStudentPhone,
        targetStudentName,
        caption = '',
        fileSize = 0,
      } = req.body;

      if (!messageType) {
        return res.status(400).json({
          success: false,
          message: 'نوع پیام الزامی است',
        });
      }

      if (messageType !== 'VOICE' && messageType !== 'IMAGE' && messageType !== 'TEXT') {
        return res.status(400).json({
          success: false,
          message: 'تنها ارسال پیام صوتی (Voice)، تصویر (Image) و متنی مجاز است',
        });
      }

      if ((messageType === 'VOICE' || messageType === 'IMAGE') && !mediaUrl) {
        return res.status(400).json({
          success: false,
          message: 'آدرس فایل برای پیام‌های صوتی و تصویری الزامی است',
        });
      }

      if (messageType === 'TEXT' && !caption?.trim()) {
        return res.status(400).json({
          success: false,
          message: 'متن پیام نمی‌تواند خالی باشد',
        });
      }

      const classroom = await Classroom.findById(classId).select('name teacher students').lean();
      if (!classroom) {
        return res.status(404).json({ success: false, message: 'کلاس یافت نشد' });
      }

      const user = (req as any).user;
      const student = (req as any).student;
      const isTeacher = user && user.role !== 'student';

      const senderRole: 'teacher' | 'student' = isTeacher ? 'teacher' : 'student';
      const senderName = isTeacher
        ? user?.fullName || 'معلم کلاس'
        : student?.firstName
        ? `${student.firstName} ${student.lastName || ''}`.trim()
        : user?.fullName || 'دانش‌آموز';

      const senderPhone = (
        req.body.senderPhone ||
        user?.phoneNumber ||
        (user?.username && /^09\d{9}$/.test(user.username) ? user.username : '') ||
        student?.phoneNumber ||
        user?.username ||
        '09000000000'
      ).trim();

      const message = new ClassMessage({
        classId,
        senderId: user?._id || student?._id,
        senderRole,
        senderName,
        senderPhone: senderPhone || '09000000000',
        recipientScope: isTeacher ? recipientScope : 'ALL',
        targetStudentPhone: isTeacher && recipientScope === 'STUDENT' ? targetStudentPhone : undefined,
        targetStudentName: isTeacher && recipientScope === 'STUDENT' ? targetStudentName : undefined,
        messageType,
        mediaUrl: mediaUrl || '',
        voiceDuration: Number(voiceDuration) || 0,
        fileSize: Number(fileSize) || 0,
        caption: caption?.trim() || '',
        isDelivered: true,
      });

      await message.save();

      // ارسال نوتیفیکیشن در صورتی که فرستنده معلم باشد
      if (isTeacher) {
        try {
          if (recipientScope === 'ALL') {
            // دریافت تمام شماره‌های دانش‌آموزان کلاس
            const memberships = await ClassMembership.find({
              classId,
              status: { $ne: 'ARCHIVED' },
            }).select('studentPhone').lean();

            const studentPhones = Array.from(
              new Set([
                ...memberships.map((m) => m.studentPhone),
                ...(classroom.students || []),
              ])
            ).filter(Boolean);

            if (studentPhones.length > 0) {
              NotificationService.send({
                recipientType: 'student',
                recipientPhones: studentPhones,
                senderId: user._id,
                senderName,
                senderRole: 'teacher',
                title: `پیام جدید در کلاس «${classroom.name}»`,
                body: `${senderName}: ${messageType === 'VOICE' ? 'یک پیام صوتی جدید 🎙' : 'یک تصویر جدید 📷'} برای کل کلاس ارسال کرد.`,
                type: 'CLASS_MESSAGE',
                priority: 'normal',
                targetId: classId.toString(),
                data: {
                  classId: classId.toString(),
                  className: classroom.name,
                  messageId: (message._id as any).toString(),
                  messageType,
                  scope: 'ALL',
                },
              }).catch((err) => logger.warn('Error sending broadcast chat notification:', err));
            }
          } else if (recipientScope === 'STUDENT' && targetStudentPhone) {
            // ارسال نوتیفیکیشن فقط به همان دانش‌آموز
            NotificationService.send({
              recipientType: 'student',
              recipientPhone: targetStudentPhone,
              senderId: user._id,
              senderName,
              senderRole: 'teacher',
              title: `پیام اختصاصی از طرف ${senderName}`,
              body: `استاد در کلاس «${classroom.name}» برای شما ${messageType === 'VOICE' ? 'یک پیام صوتی 🎙' : 'یک تصویر 📷'} ارسال کرد.`,
              type: 'CLASS_MESSAGE',
              priority: 'high',
              targetId: classId.toString(),
              data: {
                classId: classId.toString(),
                className: classroom.name,
                messageId: (message._id as any).toString(),
                messageType,
                scope: 'STUDENT',
              },
            }).catch((err) => logger.warn('Error sending direct chat notification:', err));
          }
        } catch (notifError) {
          logger.warn('Failed to dispatch chat notification:', notifError);
        }
      }

      return res.status(201).json({
        success: true,
        data: message,
      });
    } catch (error: any) {
      logger.error('Error in sendMessage:', error);
      return res.status(500).json({ success: false, message: 'خطا در ارسال پیام' });
    }
  }

  /**
   * حذف پیام توسط معلم
   */
  static async deleteMessage(req: Request, res: Response) {
    try {
      const { messageId } = req.params;
      await ClassMessage.findByIdAndDelete(messageId);
      return res.json({ success: true, message: 'پیام حذف شد' });
    } catch (error: any) {
      logger.error('Error in deleteMessage:', error);
      return res.status(500).json({ success: false, message: 'خطا در حذف پیام' });
    }
  }

  /**
   * لیست گفتگوهای کاربر (معلم یا دانش‌آموز)
   */
  static async getConversations(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id;
      const conversations = await Conversation.find({
        participants: userId,
        isActive: true,
      })
        .populate('participants', 'fullName phoneNumber avatar role')
        .populate('questionRequestId', 'title status price')
        .sort({ lastMessageAt: -1 });

      return res.json({ success: true, data: conversations });
    } catch (error: any) {
      logger.error('Error in getConversations:', error);
      return res.status(500).json({ success: false, message: 'خطا در دریافت گفتگوها' });
    }
  }

  /**
   * دریافت پیام‌های یک گفتگوی اختصاصی یا سوال
   */
  static async getConversationMessages(req: Request, res: Response) {
    try {
      const { conversationId } = req.params;
      const userId = (req as any).user?._id;

      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: userId,
      });

      if (!conversation) {
        return res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });
      }

      const messages = await Message.find({ conversationId })
        .populate('senderId', 'fullName avatar role')
        .sort({ createdAt: 1 });

      return res.json({ success: true, data: messages });
    } catch (error: any) {
      logger.error('Error in getConversationMessages:', error);
      return res.status(500).json({ success: false, message: 'خطا در دریافت پیام‌ها' });
    }
  }

  /**
   * ارسال پیام در گفتگوی اختصاصی
   */
  static async sendConversationMessage(req: Request, res: Response) {
    try {
      const { conversationId } = req.params;
      const userId = (req as any).user?._id;
      const { content, type, mediaUrl, mediaDuration, fileSize, fileName } = req.body;

      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: userId,
      });

      if (!conversation) {
        return res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });
      }

      const message = await Message.create({
        conversationId,
        senderId: userId,
        content: content || '',
        type: type || 'text',
        mediaUrl: mediaUrl || '',
        mediaDuration: Number(mediaDuration) || 0,
        fileSize: Number(fileSize) || 0,
        fileName: fileName || '',
        status: 'sent',
      });

      // Update conversation last message preview
      let previewText = content;
      if (type === 'voice') previewText = '🎙 پیام صوتی';
      else if (type === 'image') previewText = '📷 تصویر';
      else if (type === 'file') previewText = '📎 فایل پیوست';

      conversation.lastMessage = previewText;
      conversation.lastMessageAt = new Date();
      conversation.lastMessageSender = userId;
      await conversation.save();

      return res.status(201).json({ success: true, data: message });
    } catch (error: any) {
      logger.error('Error in sendConversationMessage:', error);
      return res.status(500).json({ success: false, message: 'خطا در ارسال پیام' });
    }
  }
}


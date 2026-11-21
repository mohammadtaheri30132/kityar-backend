import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { ClassMessage, MessageType, RecipientScope } from '../../core/models/ClassMessage.js';
import { Classroom } from '../../core/models/Classroom.js';
import { ClassMembership } from '../../core/models/ClassMembership.js';
import { Conversation } from '../../core/models/Conversation.js';
import { Message } from '../../core/models/Message.js';
import { OnlineClassBooking } from '../../core/models/OnlineClassBooking.js';
import { OnlineClassService } from '../../core/services/onlineClass.service.js';
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
      const user = (req as any).user;
      const userId = user?._id?.toString();

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });
      }

      const isParticipant =
        user?.role === 'admin' ||
        conversation.participants.some((p: any) => p.toString() === userId);

      if (!isParticipant) {
        if (conversation.type === 'online_class' && conversation.onlineClassBookingId) {
          const booking = await OnlineClassBooking.findById(conversation.onlineClassBookingId);
          if (booking) {
            const tId = (booking.teacherId as any)?._id?.toString() || booking.teacherId?.toString();
            const sId = (booking.studentId as any)?._id?.toString() || booking.studentId?.toString();
            const invs = (booking.invitedStudents || []).map((s: any) => s.studentId?.toString());
            if (tId === userId || sId === userId || invs.includes(userId)) {
              conversation.participants.push((req as any).user?._id);
              await conversation.save();
            } else {
              return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز به این گفتگو' });
            }
          } else {
            return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز به این گفتگو' });
          }
        } else {
          return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز به این گفتگو' });
        }
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
   * دریافت یا ایجاد گفتگوی اختصاصی میان معلم و دانش‌آموز برای کلاس تایید شده
   * چت تا ۲۴ ساعت پس از پایان کلاس فعال است و سپس قفل می‌شود
   */
  static async getOnlineClassConversation(req: Request, res: Response) {
    try {
      const { bookingId } = req.params;
      const user = (req as any).user;
      const currentUserId = user?._id?.toString();

      const booking = await OnlineClassBooking.findById(bookingId)
        .populate('teacherId', 'fullName avatar phoneNumber role')
        .populate('studentId', 'fullName avatar phoneNumber role');

      if (!booking) {
        return res.status(404).json({ success: false, message: 'کلاس آنلاین یافت نشد' });
      }

      // Check access permission
      const teacherUserId = (booking.teacherId as any)?._id?.toString() || booking.teacherId?.toString();
      const studentUserId = (booking.studentId as any)?._id?.toString() || booking.studentId?.toString();
      const invitedIds = (booking.invitedStudents || []).map((s: any) => s.studentId?.toString());

      const hasAccess =
        user?.role === 'admin' ||
        currentUserId === teacherUserId ||
        currentUserId === studentUserId ||
        invitedIds.includes(currentUserId);

      if (!hasAccess) {
        return res.status(403).json({ success: false, message: 'شما مجاز به دسترسی به این چت نیستید' });
      }

      // Check if class is valid for chatting
      const allowedStatuses = ['paid_pending_teacher', 'confirmed', 'in_progress', 'completed'];
      if (!allowedStatuses.includes(booking.status)) {
        return res.status(400).json({
          success: false,
          message: 'امکان گفتگو در این کلاس به دلیل لغو یا رد درخواست وجود ندارد.',
        });
      }

      // Check 24-hour expiration rule after class ends
      const policy = await OnlineClassService.getSessionPolicy();
      const hoursAfterEnd = policy.chatOpenHoursAfterEnd ?? 24;
      const baseEnd =
        booking.endsAt ||
        booking.endTime ||
        new Date(new Date(booking.scheduledAt).getTime() + (booking.durationMinutes || 90) * 60000);
      const chatCloseAt = new Date(new Date(baseEnd).getTime() + hoursAfterEnd * 3600 * 1000);
      const isLocked = Date.now() > chatCloseAt.getTime();

      let conversation = await Conversation.findOne({
        type: 'online_class',
        onlineClassBookingId: booking._id,
      });

      const participantIds = Array.from(new Set([teacherUserId, studentUserId, ...invitedIds].filter(Boolean)));

      if (!conversation) {
        conversation = await Conversation.create({
          type: 'online_class',
          onlineClassBookingId: booking._id,
          participants: participantIds,
          isActive: !isLocked,
        });
      } else {
        let updated = false;
        participantIds.forEach((pid) => {
          if (!conversation!.participants.some((p: any) => p.toString() === pid)) {
            conversation!.participants.push(new Types.ObjectId(pid));
            updated = true;
          }
        });
        if (isLocked && conversation.isActive) {
          conversation.isActive = false;
          updated = true;
        }
        if (updated) {
          await conversation.save();
        }
      }

      const isCurrentStudent = currentUserId === studentUserId;
      const partnerUser = isCurrentStudent ? (booking.teacherId as any) : (booking.studentId as any);

      return res.json({
        success: true,
        data: {
          conversationId: conversation._id,
          conversation: conversation,
          isLocked,
          chatCloseAt,
          partnerName:
            partnerUser?.fullName || (isCurrentStudent ? 'دبیر محترم کلاس' : 'دانش‌آموز'),
          partnerAvatar: partnerUser?.avatar || '',
          partnerRole: isCurrentStudent ? 'teacher' : 'student',
          booking: {
            id: booking._id,
            bookingCode: booking.bookingCode,
            topic: booking.topic,
            subjectName: booking.subjectName,
            status: booking.status,
            scheduledAt: booking.scheduledAt,
            effectiveStartAt: booking.effectiveStartAt,
            endsAt: booking.endsAt,
          },
        },
      });
    } catch (error: any) {
      logger.error('Error in getOnlineClassConversation:', error);
      return res.status(500).json({ success: false, message: 'خطا در بارگذاری گفتگوی کلاس' });
    }
  }

  /**
   * ارسال پیام در گفتگوی اختصاصی
   */
  static async sendConversationMessage(req: Request, res: Response) {
    try {
      const { conversationId } = req.params;
      const user = (req as any).user;
      const userId = user?._id?.toString();
      const { content, type, mediaUrl, mediaDuration, fileSize, fileName } = req.body;

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });
      }

      const isParticipant =
        user?.role === 'admin' ||
        conversation.participants.some((p: any) => p.toString() === userId);

      if (!isParticipant) {
        if (conversation.type === 'online_class' && conversation.onlineClassBookingId) {
          const booking = await OnlineClassBooking.findById(conversation.onlineClassBookingId);
          if (booking) {
            const tId = (booking.teacherId as any)?._id?.toString() || booking.teacherId?.toString();
            const sId = (booking.studentId as any)?._id?.toString() || booking.studentId?.toString();
            const invs = (booking.invitedStudents || []).map((s: any) => s.studentId?.toString());
            if (tId === userId || sId === userId || invs.includes(userId)) {
              conversation.participants.push(user._id);
              await conversation.save();
            } else {
              return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز برای ارسال پیام' });
            }
          } else {
            return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز برای ارسال پیام' });
          }
        } else {
          return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز برای ارسال پیام' });
        }
      }

      if (!conversation) {
        return res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });
      }

      // Check if conversation is tied to an online class and enforce 24-hour expiration
      if (conversation.type === 'online_class' && conversation.onlineClassBookingId) {
        const booking = await OnlineClassBooking.findById(conversation.onlineClassBookingId);
        if (booking) {
          const policy = await OnlineClassService.getSessionPolicy();
          const hoursAfterEnd = policy.chatOpenHoursAfterEnd ?? 24;
          const baseEnd =
            booking.endsAt ||
            booking.endTime ||
            new Date(new Date(booking.scheduledAt).getTime() + (booking.durationMinutes || 90) * 60000);
          const chatCloseAt = new Date(new Date(baseEnd).getTime() + hoursAfterEnd * 3600 * 1000);

          if (Date.now() > chatCloseAt.getTime()) {
            conversation.isActive = false;
            await conversation.save();
            return res.status(403).json({
              success: false,
              message:
                'مهلت گفتگوی این کلاس (۲۴ ساعت پس از پایان کلاس) به اتمام رسیده است و امکان ارسال پیام جدید وجود ندارد.',
            });
          }
        }
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
      else if (type === 'video') previewText = '🎥 ویدیو';
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


import { Request, Response } from 'express';
import { Homework } from '../../../core/models/Homework.js';
import { ClassMembership } from '../../../core/models/ClassMembership.js';
import { Classroom } from '../../../core/models/Classroom.js';
import { GradebookRecord } from '../../../core/models/GradebookRecord.js';
import { NotificationService } from '../../../core/services/notificationService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * دریافت لیست تکالیف معلم
 * امکان فیلتر بر اساس کلاس، تاریخ موعد یا شماره دانش‌آموز
 */
export const getHomeworks = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { classId, dueDate, dueDateJalali, studentPhone } = req.query;

    const query: any = { teacherId: userId };

    if (classId) {
      query.classId = classId;
    }
    if (dueDate) {
      query.dueDate = dueDate;
    }
    if (dueDateJalali) {
      query.dueDateJalali = dueDateJalali;
    }
    if (studentPhone) {
      query.$or = [
        { isForAllStudents: true },
        { targetStudentPhones: studentPhone },
        { 'studentSubmissions.studentPhone': studentPhone },
      ];
    }

    const homeworks = await Homework.find(query)
      .populate('classId', 'name code subjectName gradeName')
      .sort({ dueDate: 1, createdAt: -1 });

    res.json({ success: true, data: homeworks });
  } catch (error) {
    logger.error('Error in getHomeworks:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت لیست تکالیف' });
  }
};

/**
 * دریافت جزئیات یک تکلیف
 */
export const getHomeworkById = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;

    const homework = await Homework.findOne({ _id: id, teacherId: userId })
      .populate('classId', 'name code subjectName gradeName');

    if (!homework) {
      res.status(404).json({ success: false, message: 'تکلیف یافت نشد' });
      return;
    }

    res.json({ success: true, data: homework });
  } catch (error) {
    logger.error('Error in getHomeworkById:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت اطلاعات تکلیف' });
  }
};

/**
 * ثبت تکلیف جدید
 */
export const createHomework = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const {
      classId,
      subject,
      title,
      description,
      items,
      assignedDate,
      dueDate,
      dueDateJalali,
      isForAllStudents = true,
      targetStudentPhones = [],
      color,
    } = req.body;

    if (!classId || !title || !dueDate) {
      res.status(400).json({ success: false, message: 'کلاس، عنوان تکلیف و تاریخ موعد الزامی است' });
      return;
    }

    // واکشی دانش‌آموزان کلاس جهت مقداردهی اولیه وضعیت تحویل تکالیف
    const memberships = await ClassMembership.find({
      classId,
      status: { $ne: 'ARCHIVED' },
    });

    const studentSubmissions = memberships
      .filter((m) => {
        if (isForAllStudents) return true;
        return targetStudentPhones.includes(m.studentPhone);
      })
      .map((m) => {
        const studentName = `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.studentPhone;
        return {
          studentPhone: m.studentPhone,
          studentName,
          status: 'PENDING' as const,
          note: '',
          updatedAt: new Date(),
        };
      });

    const homework = new Homework({
      teacherId: userId,
      classId,
      subject: subject || 'عمومی',
      title: title.trim(),
      description: description?.trim() || '',
      items: Array.isArray(items) ? items : [],
      assignedDate: assignedDate || new Date().toISOString().split('T')[0],
      dueDate,
      dueDateJalali: dueDateJalali || dueDate,
      isForAllStudents,
      targetStudentPhones: isForAllStudents ? [] : targetStudentPhones,
      studentSubmissions,
      color: color || '#3b82f6',
    });

    await homework.save();

    // ارسال خودکار نوتیفیکیشن به دانش‌آموزان کلاس
    try {
      const classroom = await Classroom.findById(classId).select('name').lean();
      const targetPhones = studentSubmissions.map((s) => s.studentPhone).filter(Boolean);
      if (targetPhones.length > 0) {
        NotificationService.send({
          recipientType: 'student',
          recipientPhones: targetPhones,
          senderId: userId,
          senderName: (req as any).user?.fullName || 'معلم شما',
          senderRole: 'teacher',
          title: `تکلیف جدید: ${homework.title}`,
          body: `تکلیف جدیدی برای درس «${homework.subject}» در کلاس «${classroom?.name || 'کلاس'}» ثبت شد (موعد تحویل: ${homework.dueDateJalali}).`,
          type: 'HOMEWORK',
          priority: 'high',
          targetId: (homework._id as any).toString(),
          data: {
            homeworkId: (homework._id as any).toString(),
            classId: classId.toString(),
            subject: homework.subject,
            dueDateJalali: homework.dueDateJalali,
          },
        }).catch((err) => logger.warn('Error sending homework notification to students:', err));
      }
    } catch (notifErr) {
      logger.warn('Failed to dispatch homework notification:', notifErr);
    }

    res.status(201).json({ success: true, data: homework });
  } catch (error) {
    logger.error('Error in createHomework:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در ذخیره تکلیف جدید' });
  }
};

/**
 * ویرایش اطلاعات تکلیف
 */
export const updateHomework = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;
    const updates = req.body;

    const homework = await Homework.findOne({ _id: id, teacherId: userId });
    if (!homework) {
      res.status(404).json({ success: false, message: 'تکلیف یافت نشد' });
      return;
    }

    if (updates.title !== undefined) homework.title = updates.title.trim();
    if (updates.subject !== undefined) homework.subject = updates.subject.trim();
    if (updates.description !== undefined) homework.description = updates.description.trim();
    if (updates.items !== undefined) homework.items = updates.items;
    if (updates.dueDate !== undefined) homework.dueDate = updates.dueDate;
    if (updates.dueDateJalali !== undefined) homework.dueDateJalali = updates.dueDateJalali;
    if (updates.color !== undefined) homework.color = updates.color;

    // اگر لیست دانش‌آموزان تغییر کرد
    if (updates.isForAllStudents !== undefined || updates.targetStudentPhones !== undefined) {
      const isForAll = updates.isForAllStudents ?? homework.isForAllStudents;
      const targetPhones: string[] = updates.targetStudentPhones ?? homework.targetStudentPhones;

      homework.isForAllStudents = isForAll;
      homework.targetStudentPhones = isForAll ? [] : targetPhones;

      const memberships = await ClassMembership.find({
        classId: homework.classId,
        status: { $ne: 'ARCHIVED' },
      });

      const currentSubmissionsMap = new Map(
        homework.studentSubmissions.map((s) => [s.studentPhone, s])
      );

      const newSubmissions = memberships
        .filter((m) => {
          if (isForAll) return true;
          return targetPhones.includes(m.studentPhone);
        })
        .map((m) => {
          const existing = currentSubmissionsMap.get(m.studentPhone);
          if (existing) return existing;
          const studentName = `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.studentPhone;
          return {
            studentPhone: m.studentPhone,
            studentName,
            status: 'PENDING' as const,
            note: '',
            updatedAt: new Date(),
          };
        });

      homework.studentSubmissions = newSubmissions as any;
    }

    await homework.save();

    res.json({ success: true, data: homework });
  } catch (error) {
    logger.error('Error in updateHomework:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در به‌روزرسانی تکلیف' });
  }
};

/**
 * حذف تکلیف
 */
export const deleteHomework = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;

    const result = await Homework.findOneAndDelete({ _id: id, teacherId: userId });
    if (!result) {
      res.status(404).json({ success: false, message: 'تکلیف یافت نشد' });
      return;
    }

    res.json({ success: true, message: 'تکلیف با موفقیت حذف شد' });
  } catch (error) {
    logger.error('Error in deleteHomework:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در حذف تکلیف' });
  }
};

/**
 * تغییر وضعیت تکلیف یک دانش‌آموز خاص (انجام شده، انجام نشده، در انتظار بررسی)
 */
export const updateStudentHomeworkStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { id, phone } = req.params;
    const { status, note } = req.body;

    if (!['PENDING', 'DONE', 'NOT_DONE'].includes(status)) {
      res.status(400).json({ success: false, message: 'وضعیت نامعتبر است' });
      return;
    }

    const homework = await Homework.findOne({ _id: id, teacherId: userId });
    if (!homework) {
      res.status(404).json({ success: false, message: 'تکلیف یافت نشد' });
      return;
    }

    const submissionIndex = homework.studentSubmissions.findIndex(
      (s) => s.studentPhone === phone
    );

    if (submissionIndex >= 0) {
      homework.studentSubmissions[submissionIndex].status = status;
      if (note !== undefined) homework.studentSubmissions[submissionIndex].note = note;
      homework.studentSubmissions[submissionIndex].updatedAt = new Date();
    } else {
      homework.studentSubmissions.push({
        studentPhone: phone,
        status,
        note: note || '',
        updatedAt: new Date(),
      } as any);
    }

    await homework.save();

    res.json({
      success: true,
      data: homework,
      message: 'وضعیت تکلیف دانش‌آموز با موفقیت به‌روز شد',
    });
  } catch (error) {
    logger.error('Error in updateStudentHomeworkStatus:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در ثبت وضعیت تکلیف دانش‌آموز' });
  }
};

/**
 * بررسی، ثبت نظر و نمره‌دهی تکلیف دانش‌آموز توسط معلم
 * (با امکان ثبت در کارنامه به عنوان فعالیت کلاسی و ارسال نوتیفیکیشن به دانش‌آموز)
 */
export const reviewStudentHomework = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { id, phone } = req.params;
    const {
      status = 'APPROVED',
      teacherFeedback = '',
      score,
      recordInGradebook = false,
    } = req.body;

    const homework = await Homework.findOne({ _id: id, teacherId: userId });
    if (!homework) {
      res.status(404).json({ success: false, message: 'تکلیف یافت نشد' });
      return;
    }

    let submissionIndex = homework.studentSubmissions.findIndex(
      (s) => s.studentPhone === phone
    );

    const submissionUpdate: any = {
      status,
      teacherFeedback: typeof teacherFeedback === 'string' ? teacherFeedback.trim() : '',
      note: typeof teacherFeedback === 'string' ? teacherFeedback.trim() : '',
      score: score !== undefined && score !== null && score !== '' ? Number(score) : undefined,
      recordInGradebook: Boolean(recordInGradebook),
      reviewedAt: new Date(),
      updatedAt: new Date(),
    };

    if (submissionIndex >= 0) {
      Object.assign(homework.studentSubmissions[submissionIndex], submissionUpdate);
    } else {
      homework.studentSubmissions.push({
        studentPhone: phone,
        ...submissionUpdate,
      });
      submissionIndex = homework.studentSubmissions.length - 1;
    }

    await homework.save();

    // اگر ثبت در کارنامه تیک خورده باشد و نمره وارد شده باشد، در GradebookRecord ثبت می‌شود
    if (recordInGradebook && submissionUpdate.score !== undefined) {
      try {
        const dateStr = new Date().toISOString().slice(0, 10);
        const scoreNum = submissionUpdate.score;
        const color = scoreNum >= 16 ? 'good' : scoreNum >= 10 ? 'warning' : 'danger';

        await GradebookRecord.findOneAndUpdate(
          {
            teacher: userId,
            classroom: homework.classId,
            student: phone,
            title: { $regex: new RegExp(`^تکلیف: ${homework.title}`, 'i') },
          },
          {
            teacher: userId,
            classroom: homework.classId,
            student: phone,
            date: dateStr,
            type: 'activity', // فعالیت کلاسی
            color,
            title: `تکلیف: ${homework.title} (نمره: ${scoreNum})`,
          },
          { upsert: true, new: true }
        );
      } catch (err) {
        logger.warn('Could not record homework grade in GradebookRecord:', err);
      }
    }

    // ارسال نوتیفیکیشن به دانش‌آموز در نوکیتا
    NotificationService.send({
      recipientType: 'student',
      recipientPhone: Array.isArray(phone) ? phone[0] : String(phone),
      senderName: (req as any).user?.fullName || 'معلم کلاس',
      senderRole: 'teacher',
      title: `نتیجه بررسی تکلیف «${homework.title}»`,
      body: `معلم تکلیف شما را ${status === 'APPROVED' ? 'تایید کرد' : status === 'GRADED' ? 'نمره‌دهی کرد' : 'بررسی کرد'}.${teacherFeedback ? ' نظر: ' + teacherFeedback : ''}${submissionUpdate.score !== undefined ? ' | نمره: ' + submissionUpdate.score : ''}`,
      type: 'HOMEWORK',
      targetId: (homework._id as any).toString(),
      data: {
        homeworkId: (homework._id as any).toString(),
        status,
        score: submissionUpdate.score,
        teacherFeedback,
      },
    }).catch((e) => logger.warn('Error sending homework review notification to student:', e));

    res.json({
      success: true,
      message: 'بررسی و نظر شما روی تکلیف با موفقیت ثبت شد و به دانش‌آموز اعلام گردید.',
      data: homework.studentSubmissions[submissionIndex],
    });
  } catch (error) {
    logger.error('Error in reviewStudentHomework:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در ثبت بررسی تکلیف' });
  }
};

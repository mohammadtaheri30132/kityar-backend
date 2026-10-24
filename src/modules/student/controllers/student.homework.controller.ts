import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Homework, HomeworkStatus } from '../../../core/models/Homework.js';
import { ClassMembership } from '../../../core/models/ClassMembership.js';
import { User } from '../../../core/models/User.js';
import { NotificationService } from '../../../core/services/notificationService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * دریافت لیست تکالیف دانش‌آموز (مرتب‌شده بر اساس نزدیک‌ترین موعد تحویل)
 */
export const getStudentHomeworks = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const studentPhone = user?.phoneNumber || user?.username;

    if (!studentPhone) {
      res.status(401).json({ success: false, message: 'اطلاعات دانش‌آموز یافت نشد.' });
      return;
    }

    // ۱. دریافت شناسه‌های کلاس‌های فعال دانش‌آموز
    const memberships = await ClassMembership.find({
      studentPhone,
      status: 'ACTIVE',
    }).select('classId');

    const activeClassIds = memberships.map(m => m.classId).filter(Boolean);

    if (activeClassIds.length === 0) {
      res.status(200).json({ success: true, data: [] });
      return;
    }

    const { classId } = req.query;

    let targetClassIds = activeClassIds;
    if (classId) {
      const match = activeClassIds.find(id => id.toString() === String(classId));
      if (!match) {
        res.status(403).json({ success: false, message: 'شما عضو فعال این کلاس نیستید.' });
        return;
      }
      targetClassIds = [match];
    }

    // ۲. فیلتر کردن تکالیفی که برای کل کلاس یا این دانش‌آموز مشخص شده‌اند
    const query: any = {
      classId: { $in: targetClassIds },
      $or: [
        { isForAllStudents: true },
        { targetStudentPhones: studentPhone },
        { 'studentSubmissions.studentPhone': studentPhone },
      ],
    };

    const homeworks = await Homework.find(query)
      .populate({
        path: 'classId',
        populate: [
          { path: 'teacher', populate: { path: 'user', select: 'fullName phoneNumber' } },
          { path: 'school', select: 'name' },
        ],
      })
      .sort({ dueDate: 1, createdAt: -1 });

    // ۳. شکل‌دهی داده‌ها برای سمت دانش‌آموز
    const formatted = homeworks.map(hw => {
      const classroom = hw.classId as any;
      const teacherUser = classroom?.teacher?.user;
      const teacherName = teacherUser?.fullName || 'دبیر محترم';
      const schoolName = classroom?.school?.name || classroom?.schoolName || '';
      const className = classroom?.name || '';

      const mySubmission = (hw.studentSubmissions || []).find(s => s.studentPhone === studentPhone);
      const myStatus: HomeworkStatus = mySubmission ? mySubmission.status : 'PENDING';
      const teacherNote = mySubmission?.note || '';

      return {
        _id: hw._id,
        classId: classroom?._id || hw.classId,
        className,
        schoolName,
        teacherName,
        subject: hw.subject,
        title: hw.title,
        description: hw.description || '',
        items: hw.items || [],
        assignedDate: hw.assignedDate,
        dueDate: hw.dueDate,
        status: myStatus, // 'PENDING' | 'SUBMITTED' | 'DONE' | 'APPROVED' | ...
        teacherNote,
        studentText: mySubmission?.studentText || '',
        images: mySubmission?.images || [],
        voiceUrl: mySubmission?.voiceUrl || '',
        voiceDuration: mySubmission?.voiceDuration || 0,
        teacherFeedback: mySubmission?.teacherFeedback || mySubmission?.note || '',
        score: mySubmission?.score,
        recordInGradebook: mySubmission?.recordInGradebook || false,
        reviewedAt: mySubmission?.reviewedAt,
        submittedAt: mySubmission?.submittedAt || mySubmission?.updatedAt,
        createdAt: hw.createdAt,
      };
    });

    res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error: any) {
    logger.error('❌ خطا در دریافت تکالیف دانش‌آموز:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت تکالیف دانش‌آموز' });
  }
};

/**
 * دریافت جزئیات یک تکلیف برای دانش‌آموز
 */
export const getStudentHomeworkById = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const studentPhone = user?.phoneNumber || user?.username;
    const id = String(req.params.id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'شناسه تکلیف نامعتبر است.' });
      return;
    }

    const hw = await Homework.findById(id).populate({
      path: 'classId',
      populate: [
        { path: 'teacher', populate: { path: 'user', select: 'fullName phoneNumber' } },
        { path: 'school', select: 'name' },
      ],
    });

    if (!hw) {
      res.status(404).json({ success: false, message: 'تکلیف مورد نظر یافت نشد.' });
      return;
    }

    // بررسی عضویت فعال در کلاس تکلیف
    const membership = await ClassMembership.findOne({
      classId: hw.classId._id,
      studentPhone,
      status: 'ACTIVE',
    });

    if (!membership) {
      res.status(403).json({ success: false, message: 'شما دسترسی به این تکلیف ندارید.' });
      return;
    }

    const classroom = hw.classId as any;
    const teacherUser = classroom?.teacher?.user;
    const teacherName = teacherUser?.fullName || 'دبیر محترم';
    const schoolName = classroom?.school?.name || classroom?.schoolName || '';
    const className = classroom?.name || '';

    const mySubmission = (hw.studentSubmissions || []).find(s => s.studentPhone === studentPhone);
    const myStatus: HomeworkStatus = mySubmission ? mySubmission.status : 'PENDING';
    const teacherNote = mySubmission?.note || '';

    res.status(200).json({
      success: true,
      data: {
        _id: hw._id,
        classId: classroom?._id || hw.classId,
        className,
        schoolName,
        teacherName,
        subject: hw.subject,
        title: hw.title,
        description: hw.description || '',
        items: hw.items || [],
        assignedDate: hw.assignedDate,
        dueDate: hw.dueDate,
        status: myStatus,
        teacherNote,
        studentText: mySubmission?.studentText || '',
        images: mySubmission?.images || [],
        voiceUrl: mySubmission?.voiceUrl || '',
        voiceDuration: mySubmission?.voiceDuration || 0,
        teacherFeedback: mySubmission?.teacherFeedback || mySubmission?.note || '',
        score: mySubmission?.score,
        recordInGradebook: mySubmission?.recordInGradebook || false,
        reviewedAt: mySubmission?.reviewedAt,
        submittedAt: mySubmission?.submittedAt || mySubmission?.updatedAt,
        createdAt: hw.createdAt,
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در دریافت جزئیات تکلیف دانش‌آموز:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت جزئیات تکلیف' });
  }
};

/**
 * تغییر وضعیت تکلیف توسط دانش‌آموز (مثلاً اعلام انجام تکلیف)
 */
export const updateStudentSubmissionStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const studentPhone = user?.phoneNumber || user?.username;
    const { id } = req.params;
    const { status } = req.body; // 'DONE' | 'PENDING'

    if (!status || !['DONE', 'PENDING'].includes(status)) {
      res.status(400).json({
        success: false,
        message: 'وضعیت نامعتبر است. وضعیت باید "DONE" یا "PENDING" باشد.',
      });
      return;
    }

    const hw = await Homework.findById(id);
    if (!hw) {
      res.status(404).json({ success: false, message: 'تکلیف یافت نشد.' });
      return;
    }

    // بررسی عضویت در کلاس
    const membership = await ClassMembership.findOne({
      classId: hw.classId,
      studentPhone,
      status: 'ACTIVE',
    });

    if (!membership) {
      res.status(403).json({ success: false, message: 'شما دسترسی به این کلاس ندارید.' });
      return;
    }

    const subIndex = hw.studentSubmissions.findIndex(s => s.studentPhone === studentPhone);
    if (subIndex >= 0) {
      hw.studentSubmissions[subIndex].status = status;
      hw.studentSubmissions[subIndex].updatedAt = new Date();
    } else {
      const fullName = [membership.firstName, membership.lastName].filter(Boolean).join(' ');
      hw.studentSubmissions.push({
        studentPhone,
        studentName: user?.fullName || fullName || '',
        status,
        updatedAt: new Date(),
      });
    }

    await hw.save();

    res.status(200).json({
      success: true,
      message: status === 'DONE' ? 'تکلیف به عنوان انجام‌شده ثبت شد.' : 'وضعیت تکلیف به در انتظار بررسی تغییر یافت.',
      data: {
        status,
        updatedAt: new Date(),
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در به‌روزرسانی وضعیت تکلیف توسط دانش‌آموز:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در تغییر وضعیت تکلیف' });
  }
};

/**
 * ارسال پاسخ تکلیف توسط دانش‌آموز (شامل متن، عکس‌های پیوست و ویس ضبط‌شده)
 */
export const submitStudentHomework = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const studentPhone = user?.phoneNumber || user?.username;
    const { id } = req.params;
    const { studentText = '', images = [], voiceUrl = '', voiceDuration = 0 } = req.body;

    const hw = await Homework.findById(id).populate('teacherId', 'phoneNumber fullName');
    if (!hw) {
      res.status(404).json({ success: false, message: 'تکلیف یافت نشد.' });
      return;
    }

    // بررسی عضویت فعال در کلاس
    const membership = await ClassMembership.findOne({
      classId: hw.classId,
      studentPhone,
      status: 'ACTIVE',
    });

    if (!membership) {
      res.status(403).json({ success: false, message: 'شما دسترسی به این کلاس را ندارید.' });
      return;
    }

    const studentName = user?.fullName || [membership.firstName, membership.lastName].filter(Boolean).join(' ') || studentPhone;
    const subIndex = hw.studentSubmissions.findIndex(s => s.studentPhone === studentPhone);

    const submissionData = {
      studentPhone,
      studentName,
      status: 'SUBMITTED' as const,
      studentText: typeof studentText === 'string' ? studentText.trim() : '',
      images: Array.isArray(images) ? images : [],
      voiceUrl: typeof voiceUrl === 'string' ? voiceUrl.trim() : '',
      voiceDuration: Number(voiceDuration) || 0,
      submittedAt: new Date(),
      updatedAt: new Date(),
    };

    if (subIndex >= 0) {
      Object.assign(hw.studentSubmissions[subIndex], submissionData);
    } else {
      hw.studentSubmissions.push(submissionData as any);
    }

    await hw.save();

    // ارسال اعلان به معلم کلاس
    const teacherUser = hw.teacherId as any;
    if (teacherUser?.phoneNumber) {
      NotificationService.send({
        recipientType: 'teacher',
        recipientPhone: teacherUser.phoneNumber,
        senderName: studentName,
        senderRole: 'student',
        title: `ارسال پاسخ تکلیف «${hw.title}»`,
        body: `دانش‌آموز ${studentName} پاسخ تکلیف خود را به همراه ${images.length > 0 ? 'عکس و ' : ''}${voiceUrl ? 'ویس و ' : ''}توضیحات ارسال کرد.`,
        type: 'HOMEWORK',
        targetId: (hw._id as any).toString(),
        data: {
          homeworkId: (hw._id as any).toString(),
          studentPhone,
          studentName,
        },
      }).catch((e) => logger.warn('Error sending homework submit notification to teacher:', e));
    }

    res.status(200).json({
      success: true,
      message: 'پاسخ تکلیف شما با موفقیت برای معلم ارسال شد.',
      data: submissionData,
    });
  } catch (error: any) {
    logger.error('❌ خطا در ارسال پاسخ تکلیف توسط دانش‌آموز:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در ارسال تکلیف' });
  }
};

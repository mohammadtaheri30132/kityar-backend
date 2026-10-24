import { Request, Response } from 'express';
import { Classroom } from '../../../core/models/Classroom.js';
import { ClassMembership } from '../../../core/models/ClassMembership.js';
import { AttendanceRecord } from '../../../core/models/AttendanceRecord.js';
import { GradebookRecord } from '../../../core/models/GradebookRecord.js';
import { Exam } from '../../../core/models/Exam.js';
import { ExamSession } from '../../../core/models/ExamSession.js';
import { Homework } from '../../../core/models/Homework.js';
import { logger } from '../../../core/utils/logger.js';
// @ts-ignore
import moment from 'moment-jalaali';

/**
 * دریافت لیست کلاس‌های من (شامل کلاس‌های فعال و در انتظار تایید)
 */
export const getMyClasses = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const studentPhone = user?.phoneNumber || user?.username;

    const memberships = await ClassMembership.find({
      studentPhone,
      status: { $in: ['ACTIVE', 'PENDING'] },
    })
      .populate({
        path: 'classId',
        populate: [
          { path: 'teacher', populate: { path: 'user', select: 'fullName phoneNumber' } },
          { path: 'school', select: 'name' },
        ],
      })
      .sort({ createdAt: -1 });

    const classesList = memberships
      .filter(m => m.classId && (m.classId as any).isActive !== false)
      .map(m => {
        const c = m.classId as any;
        const teacherUser = c.teacher?.user;
        const teacherName = teacherUser?.fullName || 'دبیر محترم';
        const schoolName = c.school?.name || '';

        return {
          _id: c._id,
          name: c.name,
          code: c.code,
          grade: c.gradeName || c.grade || '',
          field: c.subjectName || '',
          schoolName,
          teacherName,
          membershipStatus: m.status,
          joinedAt: m.joinedAt || (m as any).createdAt,
        };
      });

    res.status(200).json({
      success: true,
      data: classesList,
    });
  } catch (error: any) {
    logger.error('❌ خطا در دریافت کلاس‌های دانش‌آموز:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت کلاس‌ها' });
  }
};

/**
 * جستجوی کلاس با شناسه عددی ۶ رقمی
 */
export const searchClassByCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const studentPhone = user?.phoneNumber || user?.username;
    const codeStr = String(req.params.code || '').trim();

    if (!codeStr) {
      res.status(400).json({ success: false, message: 'شناسه کلاس الزامی است' });
      return;
    }

    const classroom = await Classroom.findOne({
      code: codeStr,
      isActive: true,
    })
      .populate({
        path: 'teacher',
        populate: { path: 'user', select: 'fullName' },
      })
      .populate('school', 'name');

    if (!classroom) {
      res.status(404).json({ success: false, message: 'کلاس با این شناسه یافت نشد.' });
      return;
    }

    const membership = await ClassMembership.findOne({
      classId: classroom._id,
      studentPhone,
    });

    const teacherName = (classroom.teacher as any)?.user?.fullName || 'معلم کلاس';
    const schoolName = (classroom.school as any)?.name || '';

    res.status(200).json({
      success: true,
      data: {
        _id: classroom._id,
        name: classroom.name,
        code: classroom.code,
        grade: classroom.gradeName || classroom.grade || '',
        field: classroom.subjectName || '',
        schoolName,
        teacherName,
        membershipStatus: membership ? membership.status : 'NOT_JOINED',
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در جستجوی کلاس:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در جستجوی کلاس' });
  }
};

/**
 * ارسال درخواست عضویت در کلاس از طریق شناسه
 */
export const requestJoinClass = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const studentPhone = user?.phoneNumber || user?.username;
    const rawCode = req.body.code || req.body.classCode;

    if (!rawCode) {
      res.status(400).json({ success: false, message: 'شناسه کلاس الزامی است' });
      return;
    }

    const classroom = await Classroom.findOne({ code: String(rawCode).trim(), isActive: true });
    if (!classroom) {
      res.status(404).json({ success: false, message: 'کلاس با این شناسه یافت نشد.' });
      return;
    }

    let membership = await ClassMembership.findOne({
      classId: classroom._id,
      studentPhone,
    });

    if (membership) {
      if (membership.status === 'ACTIVE') {
        res.status(400).json({
          success: false,
          message: 'شما در حال حاضر عضو فعال این کلاس هستید.',
        });
        return;
      }
      if (membership.status === 'PENDING') {
        res.status(400).json({
          success: false,
          message: 'درخواست عضویت شما قبلاً ارسال شده و در انتظار تایید معلم است.',
        });
        return;
      }
      membership.status = 'PENDING';
    } else {
      membership = new ClassMembership({
        classId: classroom._id,
        studentPhone,
        status: 'PENDING',
        isVerified: false,
        firstName: user?.firstName || '',
        lastName: user?.lastName || '',
        fatherName: user?.fatherName || '',
        joinedAt: new Date(),
      });
    }

    await membership.save();
    logger.info(`📥 دانش‌آموز ${studentPhone} درخواست عضویت در کلاس ${classroom.name} (${classroom.code}) ثبت کرد.`);

    res.status(200).json({
      success: true,
      message: 'درخواست عضویت شما با موفقیت برای معلم کلاس ارسال شد.',
      data: {
        classId: classroom._id,
        name: classroom.name,
        code: classroom.code,
        status: 'PENDING',
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در ارسال درخواست عضویت کلاس:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در ثبت درخواست عضویت' });
  }
};

/**
 * دریافت گزارشات دانش‌آموز در یک کلاس (حضور و غیاب، کارنامه، آزمون‌ها)
 */
export const getClassStudentReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const studentPhone = user?.phoneNumber || user?.username;
    const { classroomId } = req.params;

    const classroom = await Classroom.findOne({ _id: classroomId, isActive: true })
      .populate({
        path: 'teacher',
        populate: { path: 'user', select: 'fullName' },
      })
      .populate('school', 'name');

    if (!classroom) {
      res.status(404).json({ success: false, message: 'کلاس مورد نظر یافت نشد.' });
      return;
    }

    const membership = await ClassMembership.findOne({
      classId: classroom._id,
      studentPhone,
      status: 'ACTIVE',
    });

    if (!membership) {
      res.status(403).json({
        success: false,
        message: 'شما عضو فعال این کلاس نیستید یا درخواست شما هنوز تایید نشده است.',
      });
      return;
    }

    // ۱. سوابق حضور و غیاب
    const attendanceRecords = await AttendanceRecord.find({
      classId: classroomId,
      studentPhone,
    }).populate('sessionId').sort({ createdAt: -1 });

    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;

    const formattedAttendance = attendanceRecords.map((rec, idx) => {
      const session = rec.sessionId as any;
      const st = rec.status;
      if (st === 'PRESENT') present++;
      else if (st === 'ABSENT_UNEXCUSED') absent++;
      else if (st === 'LATE') late++;
      else if (st === 'ABSENT_EXCUSED') excused++;

      let statusLabel = 'حاضر';
      if (st === 'ABSENT_UNEXCUSED') statusLabel = 'غایب';
      else if (st === 'LATE') statusLabel = 'تاخیر';
      else if (st === 'ABSENT_EXCUSED') statusLabel = 'موجه';

      return {
        sessionNumber: idx + 1,
        date: session?.date || '',
        jalaliDate: session?.date || '',
        subject: session?.subject || '',
        status: st,
        statusLabel,
        note: rec.reason || '',
      };
    });

    const totalSessions = attendanceRecords.length;
    const attendancePercentage = totalSessions > 0 ? Math.round(((present + late * 0.5) / totalSessions) * 100) : 100;

    // ۲. ریز نمرات و کارنامه
    const studentIdentifiers = [
      studentPhone,
      user?.fullName,
      `${membership.firstName || ''} ${membership.lastName || ''}`.trim(),
    ].filter(Boolean);

    const gradebookRecords = await GradebookRecord.find({
      classroom: classroomId,
      student: { $in: studentIdentifiers },
    }).sort({ date: -1 });

    const formattedGrades = gradebookRecords.map(g => {
      return {
        title: g.title,
        type: g.type || 'classwork',
        color: g.color || 'neutral',
        date: g.date || '',
        jalaliDate: g.date || '',
      };
    });

    // ۳. آزمون‌های کلاس
    const exams = await Exam.find({ classId: classroomId, isActive: true }).sort({ startTime: -1 });
    const examIds = exams.map(e => e._id);
    const sessions = await ExamSession.find({
      exam: { $in: examIds },
      participantIdentifier: studentPhone,
    });

    const formattedExams = exams.map(exam => {
      const session = sessions.find(s => s.exam.toString() === exam._id.toString());
      let statusLabel = 'برگزار نشده';
      if (session?.status === 'finished') {
        statusLabel = 'به پایان رسیده';
      } else if (session?.status === 'in-progress') {
        statusLabel = 'در حال پاسخگویی';
      }

      const durationMinutes = exam.isUntimed
        ? 0
        : Math.round((new Date(exam.endTime).getTime() - new Date(exam.startTime).getTime()) / 60000);

      return {
        _id: exam._id,
        title: exam.title,
        status: session?.status || 'NOT_STARTED',
        statusLabel,
        duration: durationMinutes,
        questionsCount: exam.questions?.length || 0,
        studentScore: session?.totalEarnedScore !== undefined ? session.totalEarnedScore : null,
        maxScore: exam.totalScore || 20,
      };
    });

    // ۴. تکالیف این کلاس برای دانش‌آموز
    const classHomeworks = await Homework.find({
      classId: classroomId,
      $or: [
        { isForAllStudents: true },
        { targetStudentPhones: studentPhone },
        { 'studentSubmissions.studentPhone': studentPhone },
      ],
    }).sort({ dueDate: 1, createdAt: -1 });

    const formattedHomeworks = classHomeworks.map(hw => {
      const mySubmission = (hw.studentSubmissions || []).find(s => s.studentPhone === studentPhone);
      return {
        _id: hw._id,
        classId: hw.classId,
        subject: hw.subject,
        title: hw.title,
        description: hw.description || '',
        items: hw.items || [],
        assignedDate: hw.assignedDate,
        dueDate: hw.dueDate,
        dueDateJalali: hw.dueDateJalali,
        status: mySubmission ? mySubmission.status : 'PENDING',
        teacherNote: mySubmission?.note || '',
        submittedAt: mySubmission?.updatedAt,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        classroom: {
          _id: classroom._id,
          name: classroom.name,
          code: classroom.code,
          grade: classroom.gradeName || classroom.grade || '',
          field: classroom.subjectName || '',
          schoolName: (classroom.school as any)?.name || '',
          teacherName: (classroom.teacher as any)?.user?.fullName || 'معلم کلاس',
        },
        attendance: {
          summary: {
            present,
            absent,
            late,
            excused,
            totalSessions,
            attendancePercentage,
          },
          records: formattedAttendance,
        },
        gradebook: {
          items: formattedGrades,
        },
        exams: formattedExams,
        homeworks: formattedHomeworks,
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در دریافت گزارشات کلاس دانش‌آموز:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت گزارشات کلاس' });
  }
};

/**
 * دریافت تمامی آزمون‌های اختصاص یافته به دانش‌آموز
 */
export const getMyExams = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const studentPhone = user?.phoneNumber || user?.username;

    const activeMemberships = await ClassMembership.find({
      studentPhone,
      status: 'ACTIVE',
    }).select('classId');

    const classIds = activeMemberships.map(m => m.classId);

    const exams = await Exam.find({ classId: { $in: classIds }, isActive: true })
      .populate('classId', 'name code')
      .sort({ startTime: -1 });

    const examIds = exams.map(e => e._id);
    const sessions = await ExamSession.find({
      exam: { $in: examIds },
      participantIdentifier: studentPhone,
    });

    const result = exams.map(exam => {
      const session = sessions.find(s => s.exam.toString() === exam._id.toString());
      const now = new Date();
      let statusLabel = 'برگزار نشده';
      if (session?.status === 'finished') {
        statusLabel = 'به پایان رسیده';
      } else if (session?.status === 'in-progress') {
        statusLabel = 'در حال برگزاری';
      } else if (exam.startTime && exam.endTime) {
        if (now < new Date(exam.startTime)) {
          statusLabel = 'پیش رو';
        } else if (now > new Date(exam.endTime)) {
          statusLabel = 'منقضی شده';
        } else {
          statusLabel = 'در حال برگزاری';
        }
      }

      const durationMinutes = exam.isUntimed
        ? 0
        : Math.round((new Date(exam.endTime).getTime() - new Date(exam.startTime).getTime()) / 60000);

      return {
        id: exam._id,
        title: exam.title,
        classroomName: (exam.classId as any)?.name || 'کلاس نامشخص',
        classCode: (exam.classId as any)?.code || '',
        startTime: exam.startTime,
        endTime: exam.endTime,
        duration: durationMinutes,
        questionsCount: exam.questions?.length || 0,
        totalScore: exam.totalScore || 20,
        status: session?.status || 'NOT_STARTED',
        statusLabel,
        score: session?.totalEarnedScore !== undefined ? session.totalEarnedScore : null,
      };
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error('❌ خطا در دریافت آزمون‌های دانش‌آموز:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت آزمون‌ها' });
  }
};

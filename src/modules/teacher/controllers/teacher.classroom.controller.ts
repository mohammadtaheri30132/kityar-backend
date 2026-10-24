import { Request, Response } from 'express'
import { Classroom, generateUniqueClassCode } from '../../../core/models/Classroom.js'
import { ClassMembership } from '../../../core/models/ClassMembership.js'
import { WeeklySchedule } from '../../../core/models/WeeklySchedule.js'
import { ClassSession } from '../../../core/models/ClassSession.js'
import { AttendanceRecord } from '../../../core/models/AttendanceRecord.js'
import { StudentProfile } from '../../../core/models/StudentProfile.js'
import { TeacherProfile } from '../../../core/models/TeacherProfile.js'
import { Exam } from '../../../core/models/Exam.js'
import { ExamSession } from '../../../core/models/ExamSession.js'
import { GradebookRecord } from '../../../core/models/GradebookRecord.js'
import { logger } from '../../../core/utils/logger.js'
import { checkStudentNameSimilarity } from '../../../core/utils/studentMatcher.js'

// دریافت پروفایل معلم (تابع کمکی برای استفاده در کنترلرها)
const getTeacherProfile = async (userId: string) => {
  return await TeacherProfile.findOne({ user: userId })
}

/**
 * ایجاد کلاس جدید
 */
export const createClassroom = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { name, course, grade, subjectName, gradeName, description, academicYear, schoolId } = req.body

    if (!name) {
      res.status(400).json({ success: false, message: 'نام کلاس الزامی است' })
      return
    }

    const teacher = await getTeacherProfile(userId)
    if (!teacher) {
      res.status(403).json({ success: false, message: 'پروفایل معلم یافت نشد' })
      return
    }

    const code = await generateUniqueClassCode()

    const newClassroom = new Classroom({
      teacher: teacher._id,
      school: schoolId || undefined,
      name,
      code,
      course: course || undefined,
      grade: grade || undefined,
      subjectName,
      gradeName,
      description,
      academicYear,
      students: [], 
    })

    await newClassroom.save()

    res.status(201).json({
      success: true,
      message: 'کلاس با موفقیت ایجاد شد',
      data: newClassroom,
    })
  } catch (error: any) {
    logger.error('❌ خطا در ایجاد کلاس:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در ایجاد کلاس' })
  }
}

/**
 * ویرایش کلاس
 */
export const updateClassroom = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { classroomId } = req.params
    const { name, courseId, gradeId, note, academicYear, schoolId } = req.body

    const teacher = await getTeacherProfile(userId)
    if (!teacher) {
      res.status(403).json({ success: false, message: 'پروفایل معلم یافت نشد' })
      return
    }

    const updated = await Classroom.findOneAndUpdate(
      { _id: classroomId, teacher: teacher._id },
      { 
        $set: {
          ...(schoolId && { school: schoolId }),
          ...(name && { name }),
          ...(courseId && { course: courseId }),
          ...(gradeId && { grade: gradeId }),
          ...(note !== undefined && { note }),
          ...(academicYear !== undefined && { academicYear })
        }
      },
      { new: true }
    )

    if (!updated) {
      res.status(404).json({ success: false, message: 'کلاس یافت نشد' })
      return
    }

    res.status(200).json({ success: true, message: 'اطلاعات کلاس بروزرسانی شد', data: updated })
  } catch (error: any) {
    logger.error('❌ خطا در ویرایش کلاس:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

/**
 * دریافت لیست کلاس‌های معلم
 */
/**
 * دریافت لیست کلاس‌های معلم
 */
export const getMyClassrooms = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const teacher = await getTeacherProfile(userId)

    if (!teacher) {
      res.status(403).json({ success: false, message: 'پروفایل معلم یافت نشد' })
      return
    }

    // دریافت کلاس‌ها و جوین کردن با مجموعه‌های Course و Grade و School برای نمایش نام آن‌ها
    const classrooms = await Classroom.find({ teacher: teacher._id, isActive: true })
      .populate('school', 'name color')
      .populate('course', 'name code')
      .populate('grade', 'name')
      .sort({ createdAt: -1 })

    // اطمینان از اینکه همه کلاس‌ها دارای شناسه عددی یکتا باشند
    for (const c of classrooms) {
      if (!c.code) {
        c.code = await generateUniqueClassCode()
        await Classroom.updateOne({ _id: c._id }, { $set: { code: c.code } })
      }
    }

    res.status(200).json({
      success: true,
      data: classrooms,
    })
  } catch (error: any) {
    logger.error('❌ خطا در دریافت لیست کلاس‌ها:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

/**
 * دریافت اطلاعات یک کلاس با شناسه کلاس
 */
export const getClassroomById = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { classroomId } = req.params
    const teacher = await getTeacherProfile(userId)

    if (!teacher) {
      res.status(403).json({ success: false, message: 'پروفایل معلم یافت نشد' })
      return
    }

    const classroom = await Classroom.findOne({ _id: classroomId, teacher: teacher._id })
      .populate('school', 'name color')
      .populate('course', 'name code')
      .populate('grade', 'name')

    if (!classroom) {
      res.status(404).json({ success: false, message: 'کلاس یافت نشد' })
      return
    }

    if (!classroom.code) {
      classroom.code = await generateUniqueClassCode()
      await Classroom.updateOne({ _id: classroom._id }, { $set: { code: classroom.code } })
    }

    res.status(200).json({
      success: true,
      data: classroom,
    })
  } catch (error: any) {
    logger.error('❌ خطا در دریافت اطلاعات کلاس:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

/**
 * بک‌فیل کدهای کلاس برای کلاس‌های قدیمی
 */
export const backfillClassroomCodes = async (): Promise<void> => {
  try {
    const missing = await Classroom.find({
      $or: [{ code: { $exists: false } }, { code: null }, { code: '' }]
    })
    for (const c of missing) {
      const code = await generateUniqueClassCode()
      await Classroom.updateOne({ _id: c._id }, { $set: { code } })
    }
    if (missing.length > 0) {
      logger.info(`✅ شناسه عددی برای ${missing.length} کلاس با موفقیت تولید شد.`)
    }
  } catch (err) {
    logger.error('❌ خطا در مقداردهی اولیه کدهای کلاسی:', err)
  }
}

/**
 * افزودن گروهی دانش‌آموزان به کلاس (با شماره موبایل)
 */
export const addStudentsToClassroom = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { classroomId } = req.params
    const { students } = req.body // آرایه‌ای از آبجکت‌ها یا رشته‌ها

    if (!Array.isArray(students) || students.length === 0) {
      res.status(400).json({ success: false, message: 'لیست دانش‌آموزان باید به صورت آرایه ارسال شود' })
      return
    }

    // استخراج شماره موبایل‌ها برای Classroom
    const phones = students.map((s: any) => typeof s === 'string' ? s : s.phone).filter(Boolean);

    const teacher = await getTeacherProfile(userId)
    
    // استفاده از عملگر $addToSet برای جلوگیری از ثبت شماره تکراری در کلاس
    const updatedClassroom = await Classroom.findOneAndUpdate(
      { _id: classroomId, teacher: teacher?._id },
      { $addToSet: { students: { $each: phones } } },
      { new: true }
    )

    if (!updatedClassroom) {
      res.status(404).json({ success: false, message: 'کلاس یافت نشد یا متعلق به شما نیست' })
      return
    }

    // ساخت رکورد ClassMembership برای هر دانش‌آموز
    for (const studentData of students) {
      const phone = typeof studentData === 'string' ? studentData : studentData.phone;
      if (!phone) continue;

      const firstName = typeof studentData === 'string' ? undefined : studentData.firstName;
      const lastName = typeof studentData === 'string' ? undefined : studentData.lastName;
      const fatherName = typeof studentData === 'string' ? undefined : studentData.fatherName;
      const parentPhone = typeof studentData === 'string' ? undefined : studentData.parentPhone;
      const birthDate = typeof studentData === 'string' ? undefined : studentData.birthDate;
      const specialNotes = typeof studentData === 'string' ? undefined : studentData.specialNotes;

      const existingMembership = await ClassMembership.findOne({ classId: classroomId, studentPhone: phone });
      if (!existingMembership) {
        await ClassMembership.create({
          classId: classroomId,
          studentPhone: phone,
          firstName,
          lastName,
          fatherName,
          parentPhone,
          birthDate,
          specialNotes,
          status: 'ACTIVE',
          source: 'MANUAL'
        });
      } else {
        // بروزرسانی اطلاعات اگر قبلا فقط با شماره ثبت شده بود
        if (firstName || lastName || fatherName || parentPhone || birthDate || specialNotes) {
           await ClassMembership.updateOne(
             { _id: existingMembership._id },
             { $set: { 
                 ...(firstName && { firstName }),
                 ...(lastName && { lastName }),
                 ...(fatherName && { fatherName }),
                 ...(parentPhone && { parentPhone }),
                 ...(birthDate && { birthDate }),
                 ...(specialNotes && { specialNotes })
               } 
             }
           );
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'دانش‌آموزان با موفقیت به کلاس اضافه شدند',
      data: updatedClassroom,
    })
  } catch (error: any) {
    logger.error('❌ خطا در افزودن دانش‌آموز به کلاس:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

/**
 * حذف یک دانش‌آموز از کلاس
 */
export const removeStudentFromClassroom = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { classroomId, studentPhone } = req.params

    const teacher = await getTeacherProfile(userId)

    const updatedClassroom = await Classroom.findOneAndUpdate(
      { _id: classroomId, teacher: teacher?._id },
      { $pull: { students: studentPhone } }, // حذف شماره از آرایه
      { new: true }
    )

    if (!updatedClassroom) {
      res.status(404).json({ success: false, message: 'کلاس یافت نشد' })
      return
    }

    // آرشیو کردن Membership
    await ClassMembership.findOneAndUpdate(
      { classId: classroomId, studentPhone },
      { status: 'ARCHIVED' }
    )

    res.status(200).json({
      success: true,
      message: 'دانش‌آموز از کلاس حذف شد',
      data: updatedClassroom,
    })
  } catch (error: any) {
    logger.error('❌ خطا در حذف دانش‌آموز از کلاس:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}
/**
 * دریافت لیست دقیق دانش‌آموزان کلاس با وضعیت عضویت
 */
export const getClassroomStudents = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { classroomId } = req.params;

    const teacher = await getTeacherProfile(userId);
    const classroom = await Classroom.findOne({ _id: classroomId, teacher: teacher?._id });

    if (!classroom) {
      res.status(404).json({ success: false, message: 'کلاس یافت نشد' });
      return;
    }

    // دریافت اعضای فعال کلاس (دانش‌آموزان تایید شده)
    const memberships = await ClassMembership.find({ classId: classroomId, status: 'ACTIVE' })
      .populate({
        path: 'studentId',
        populate: { path: 'user', select: 'fullName username' }
      })
      .sort({ joinedAt: -1 });

    res.status(200).json({
      success: true,
      data: memberships
    });
  } catch (error: any) {
    logger.error('❌ خطا در دریافت اعضای کلاس:', error);
    res.status(500).json({ success: false, message: 'خطای سرور' });
  }
}

/**
 * دریافت درخواست‌های عضویت در انتظار تایید کلاس همراه با بررسی تطبیق هوشمند (Join Requests)
 */
export const getClassroomJoinRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { classroomId } = req.params;

    const teacher = await getTeacherProfile(userId);
    const classroom = await Classroom.findOne({ _id: classroomId, teacher: teacher?._id });

    if (!classroom) {
      res.status(404).json({ success: false, message: 'کلاس یافت نشد' });
      return;
    }

    // دریافت تمام درخواست‌های در انتظار تایید
    const pendingRequests = await ClassMembership.find({
      classId: classroomId,
      status: 'PENDING'
    }).sort({ createdAt: -1 });

    // دریافت تمام دانش‌آموزان فعال که به صورت دستی وارد شده‌اند (بدون تیک آبی)
    const manualStudents = await ClassMembership.find({
      classId: classroomId,
      status: 'ACTIVE',
      $or: [
        { isVerified: false },
        { isVerified: { $exists: false } },
        { source: 'MANUAL' }
      ]
    });

    // بررسی تطبیق هوشمند برای هر درخواست (شباهت >= ۷۰٪ یا شامل بودن)
    const requestsWithMatches = pendingRequests.map((reqDoc) => {
      const reqObj = reqDoc.toObject();
      const reqFullName = `${reqDoc.firstName || ''} ${reqDoc.lastName || ''}`.trim();

      const similarityMatches: any[] = [];

      for (const manual of manualStudents) {
        const manualFullName = `${manual.firstName || ''} ${manual.lastName || ''}`.trim();
        const sim = checkStudentNameSimilarity(reqFullName, manualFullName);

        if (sim.isMatch) {
          similarityMatches.push({
            membershipId: manual._id,
            firstName: manual.firstName,
            lastName: manual.lastName,
            fatherName: manual.fatherName,
            studentPhone: manual.studentPhone,
            parentPhone: manual.parentPhone,
            birthDate: manual.birthDate,
            specialNotes: manual.specialNotes,
            score: sim.score,
            percent: sim.percent,
            reason: sim.reason,
          });
        }
      }

      return {
        ...reqObj,
        hasSimilarity: similarityMatches.length > 0,
        similarityMatches,
      };
    });

    res.status(200).json({
      success: true,
      count: requestsWithMatches.length,
      data: requestsWithMatches,
    });
  } catch (error: any) {
    logger.error('❌ خطا در دریافت درخواست‌های عضویت کلاس:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت درخواست‌ها' });
  }
};

/**
 * پذیرش درخواست عضویت دانش‌آموز (مستقیم یا ادغام با دانش‌آموز دستی قبلی)
 */
export const acceptClassroomJoinRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { classroomId, requestId } = req.params;
    const { action, targetMembershipId } = req.body; // action: 'DIRECT' | 'MERGE'

    const teacher = await getTeacherProfile(userId);
    const classroom = await Classroom.findOne({ _id: classroomId, teacher: teacher?._id });

    if (!classroom) {
      res.status(404).json({ success: false, message: 'کلاس یافت نشد' });
      return;
    }

    const pendingRequest = await ClassMembership.findOne({
      _id: requestId,
      classId: classroomId,
      status: 'PENDING'
    });

    if (!pendingRequest) {
      res.status(404).json({ success: false, message: 'درخواست عضویت یافت نشد یا قبلاً بررسی شده است.' });
      return;
    }

    // حالت اول: ادغام با دانش‌آموز دستی قبلی
    if (action === 'MERGE' && targetMembershipId) {
      const targetManualStudent = await ClassMembership.findOne({
        _id: targetMembershipId,
        classId: classroomId,
      });

      if (!targetManualStudent) {
        res.status(404).json({ success: false, message: 'دانش‌آموز دستی مورد نظر جهت ادغام یافت نشد.' });
        return;
      }

      // به‌روزرسانی آرایه شماره‌های کلاس
      if (targetManualStudent.studentPhone && targetManualStudent.studentPhone !== pendingRequest.studentPhone) {
        await Classroom.updateOne(
          { _id: classroomId },
          { $pull: { students: targetManualStudent.studentPhone } }
        );
        // انتقال سوابق حضور غیاب قبلی به شماره جدید
        await AttendanceRecord.updateMany(
          { studentPhone: targetManualStudent.studentPhone },
          { $set: { studentPhone: pendingRequest.studentPhone } }
        );
      }
      await Classroom.updateOne(
        { _id: classroomId },
        { $addToSet: { students: pendingRequest.studentPhone } }
      );

      // استخراج اطلاعات درخواست قبل از حذف
      const newPhone = pendingRequest.studentPhone;
      const newStudentId = pendingRequest.studentId;
      const newFirstName = pendingRequest.firstName;
      const newLastName = pendingRequest.lastName;
      const newFatherName = pendingRequest.fatherName;
      const newParentPhone = pendingRequest.parentPhone;
      const newBirthDate = pendingRequest.birthDate;
      const newSpecialNotes = pendingRequest.specialNotes;

      // ۱. حذف درخواست اضافی جهت جلوگیری از خطای duplicate key در ایندکس classId + studentPhone
      await ClassMembership.deleteOne({ _id: pendingRequest._id });

      // ۲. به‌روزرسانی پرونده دانش‌آموز دستی و اعطای تیک آبی (معتبر)
      targetManualStudent.studentPhone = newPhone;
      if (newStudentId) targetManualStudent.studentId = newStudentId;
      if (newFirstName) targetManualStudent.firstName = newFirstName;
      if (newLastName) targetManualStudent.lastName = newLastName;
      if (newFatherName) targetManualStudent.fatherName = newFatherName;
      if (newParentPhone) targetManualStudent.parentPhone = newParentPhone;
      if (newBirthDate) targetManualStudent.birthDate = newBirthDate;
      if (newSpecialNotes) targetManualStudent.specialNotes = newSpecialNotes;
      targetManualStudent.status = 'ACTIVE';
      targetManualStudent.source = 'INVITATION';
      targetManualStudent.isVerified = true; // اعطای تیک آبی
      await targetManualStudent.save();

      logger.info(`🔗 دانش‌آموز وب ${pendingRequest.firstName} ${pendingRequest.lastName} با پرونده دستی ${targetManualStudent._id} ادغام و تایید شد.`);

      res.status(200).json({
        success: true,
        message: 'دانش‌آموز با پرونده قبلی تطبیق داده شد و با نشان تیک آبی تایید گردید.',
        data: targetManualStudent,
      });
      return;
    }

    // حالت دوم: پذیرش مستقیم به عنوان دانش‌آموز جدید
    await Classroom.updateOne(
      { _id: classroomId },
      { $addToSet: { students: pendingRequest.studentPhone } }
    );

    pendingRequest.status = 'ACTIVE';
    pendingRequest.source = 'INVITATION';
    pendingRequest.isVerified = true; // اعطای تیک آبی
    await pendingRequest.save();

    logger.info(`✅ درخواست دانش‌آموز ${pendingRequest.firstName} ${pendingRequest.lastName} مستقیماً با تیک آبی پذیرفته شد.`);

    res.status(200).json({
      success: true,
      message: 'دانش‌آموز با موفقیت تایید شد و با نشان تیک آبی به کلاس افزوده گردید.',
      data: pendingRequest,
    });
  } catch (error: any) {
    logger.error('❌ خطا در پذیرش درخواست عضویت:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در پذیرش درخواست' });
  }
};

/**
 * رد یا حذف درخواست عضویت دانش‌آموز
 */
export const rejectClassroomJoinRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { classroomId, requestId } = req.params;

    const teacher = await getTeacherProfile(userId);
    const classroom = await Classroom.findOne({ _id: classroomId, teacher: teacher?._id });

    if (!classroom) {
      res.status(404).json({ success: false, message: 'کلاس یافت نشد' });
      return;
    }

    const deleted = await ClassMembership.findOneAndDelete({
      _id: requestId,
      classId: classroomId,
      status: 'PENDING',
    });

    if (!deleted) {
      res.status(404).json({ success: false, message: 'درخواست یافت نشد' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'درخواست عضویت با موفقیت حذف شد.',
    });
  } catch (error: any) {
    logger.error('❌ خطا در رد درخواست عضویت:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در رد درخواست' });
  }
};

/**
 * دریافت نتایج آزمون‌های این کلاس که هنوز به دانش‌آموزی متصل نشده‌اند (Needs Review)
 */
export const getUnmatchedResults = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { classroomId } = req.params;

    const teacher = await getTeacherProfile(userId);
    const classroom = await Classroom.findOne({ _id: classroomId, teacher: teacher?._id });

    if (!classroom) {
      res.status(404).json({ success: false, message: 'کلاس یافت نشد' });
      return;
    }

    const classExams = await Exam.find({ classId: classroomId }).select('_id title');
    const examIds = classExams.map(e => e._id);

    const unmatchedSessions = await ExamSession.find({
      exam: { $in: examIds },
      matchingStatus: 'NEEDS_REVIEW'
    }).populate('exam', 'title').sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: unmatchedSessions });
  } catch (error: any) {
    logger.error('❌ خطا در دریافت نتایج نیازمند بررسی:', error);
    res.status(500).json({ success: false, message: 'خطای سرور' });
  }
}

/**
 * متصل کردن نتیجه نامشخص به یک دانش‌آموز کلاس
 */
export const matchStudentResult = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { classroomId, sessionId } = req.params;
    const { studentId } = req.body; // رفرنس به StudentProfile

    const teacher = await getTeacherProfile(userId);
    const classroom = await Classroom.findOne({ _id: classroomId, teacher: teacher?._id });

    if (!classroom) {
      res.status(404).json({ success: false, message: 'کلاس یافت نشد' });
      return;
    }

    const session = await ExamSession.findById(sessionId);
    if (!session || session.matchingStatus !== 'NEEDS_REVIEW') {
      res.status(404).json({ success: false, message: 'نشست آزمون یافت نشد یا نیازمند بررسی نیست' });
      return;
    }

    const studentProfile = await StudentProfile.findById(studentId).populate('user');
    if (!studentProfile) {
      res.status(404).json({ success: false, message: 'دانش‌آموز مورد نظر یافت نشد' });
      return;
    }

    session.user = studentProfile.user;
    session.matchingStatus = 'MATCHED';
    await session.save();

    // اطمینان از وجود عضویت کلاس
    const existingMembership = await ClassMembership.findOne({ classId: classroomId, studentId: studentId });
    if (!existingMembership) {
      await ClassMembership.create({
        classId: classroomId,
        studentId: studentId,
        studentPhone: session.participantIdentifier,
        status: 'ACTIVE',
        source: 'EXAM_LINK'
      });
    }

    res.status(200).json({ success: true, message: 'نتیجه با موفقیت به دانش‌آموز متصل شد', data: session });
  } catch (error: any) {
    logger.error('❌ خطا در اتصال نتیجه آزمون:', error);
    res.status(500).json({ success: false, message: 'خطای سرور' });
  }
}

export const getClassroomReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { classroomId } = req.params;

    const teacher = await getTeacherProfile(userId);
    const classroom = await Classroom.findOne({ _id: classroomId, teacher: teacher?._id });

    if (!classroom) {
      res.status(404).json({ success: false, message: 'کلاس یافت نشد' });
      return;
    }

    // 1. Get all exams for this class
    const exams = await Exam.find({ classId: classroomId });
    const examIds = exams.map(e => e._id);

    // 2. Get all finished sessions for these exams
    const sessions = await ExamSession.find({ exam: { $in: examIds }, status: 'finished' }).populate('user');

    // 3. Calculate total average score
    const totalSessionsCount = sessions.length;
    const totalScoreSum = sessions.reduce((sum, s) => sum + (s.totalEarnedScore || 0), 0);
    const averageClassScore = totalSessionsCount > 0 ? (totalScoreSum / totalSessionsCount).toFixed(1) : 0;

    // 4. Calculate average per exam
    const examAverages = exams.map(exam => {
      const examSessions = sessions.filter(s => String(s.exam) === String(exam._id));
      const avg = examSessions.length > 0 
        ? examSessions.reduce((sum, s) => sum + (s.totalEarnedScore || 0), 0) / examSessions.length 
        : 0;
      
      return {
        _id: exam._id,
        title: exam.title,
        averageScore: avg.toFixed(1),
        maxScore: exam.totalScore,
        participantsCount: examSessions.length
      };
    });

    // 5. Calculate top students
    const studentScoresMap: Record<string, { name: string, totalScore: number, count: number, phone: string }> = {};
    
    sessions.forEach(session => {
      // Use participantIdentifier as the unique key if user is not populated, else use user._id
      const key = session.participantIdentifier;
      if (!studentScoresMap[key]) {
        studentScoresMap[key] = {
          name: session.user ? (session.user as any).fullName : `${session.firstNameSnapshot || ''} ${session.lastNameSnapshot || ''}`.trim() || 'ناشناس',
          phone: session.participantIdentifier,
          totalScore: 0,
          count: 0
        };
      }
      studentScoresMap[key].totalScore += (session.totalEarnedScore || 0);
      studentScoresMap[key].count += 1;
    });

    const topStudents = Object.values(studentScoresMap)
      .map(student => ({
        name: student.name || student.phone,
        averageScore: (student.totalScore / student.count).toFixed(1),
        phone: student.phone
      }))
      .sort((a, b) => parseFloat(b.averageScore) - parseFloat(a.averageScore))
      .slice(0, 3); // Top 3

    res.status(200).json({
      success: true,
      data: {
        totalExams: exams.length,
        totalSessions: totalSessionsCount,
        averageClassScore,
        examAverages,
        topStudents
      }
    });

  } catch (error: any) {
    logger.error('❌ خطا در دریافت گزارشات کلاس:', error);
    res.status(500).json({ success: false, message: 'خطای سرور' });
  }
};

// ----------------------------------------------------------------------
// حذف کامل کلاس
// ----------------------------------------------------------------------
export const deleteClassroom = async (req: Request, res: Response): Promise<void> => {
  try {
    const { classroomId } = req.params;
    
    // Check if classroom exists
    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      res.status(404).json({ success: false, message: 'کلاس یافت نشد' });
      return;
    }

    // Delete classroom
    await Classroom.findByIdAndDelete(classroomId);

    // Also delete memberships
    await ClassMembership.deleteMany({ classId: classroomId });

    // Also delete weekly schedules for this class
    await WeeklySchedule.deleteMany({ classId: classroomId });

    // Also delete class sessions and attendance records
    await ClassSession.deleteMany({ classId: classroomId });
    await AttendanceRecord.deleteMany({ classId: classroomId });

    res.json({ success: true, message: 'کلاس با موفقیت حذف شد' });
  } catch (error) {
    logger.error('Error deleting classroom:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در حذف کلاس' });
  }
}

export const getStudentProfileFull = async (req: Request | any, res: Response) => {
  try {
    const { classroomId, studentPhone } = req.params;
    
    const membership = await ClassMembership.findOne({ classId: classroomId, studentPhone });
    if (!membership) return res.status(404).json({ success: false, message: 'Student not found in this class' });

    // Attendance
    const attendanceRecords = await AttendanceRecord.find({ classId: classroomId, studentPhone }).populate('sessionId').lean();
    
    // Notes
    const notes = await GradebookRecord.find({ classroom: classroomId, student: studentPhone, type: 'note' }).sort({ date: -1 }).lean();

    // Exams for this class (Basic info)
    // We can just fetch Exams and check if this student has participated in ExamSessions.
    // For now, let's just return what we can easily.
    
    res.json({
      success: true,
      data: {
        membership,
        attendance: attendanceRecords,
        notes
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

export const updateStudentInfo = async (req: Request | any, res: Response) => {
  try {
    const { classroomId, studentPhone } = req.params;
    const { firstName, lastName, fatherName, parentPhone } = req.body;
    
    await ClassMembership.updateOne(
      { classId: classroomId, studentPhone },
      { $set: { firstName, lastName, fatherName, parentPhone } }
    );
    res.json({ success: true });
  } catch(error) {
    res.status(500).json({ success: false });
  }
}

export const addStudentNote = async (req: Request | any, res: Response) => {
  try {
    const { classroomId, studentPhone } = req.params;
    const { title, color } = req.body;
    
    const note = await GradebookRecord.create({
      teacher: req.user._id,
      classroom: classroomId,
      student: studentPhone,
      date: new Date().toISOString().split('T')[0],
      type: 'note',
      color: color || 'neutral',
      title
    });
    
    res.json({ success: true, data: note });
  } catch(error) {
    res.status(500).json({ success: false });
  }
}

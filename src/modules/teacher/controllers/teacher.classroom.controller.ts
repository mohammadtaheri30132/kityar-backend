import { Request, Response } from 'express'
import { Classroom } from '../../../core/models/Classroom.js'
import { ClassMembership } from '../../../core/models/ClassMembership.js'
import { StudentProfile } from '../../../core/models/StudentProfile.js'
import { TeacherProfile } from '../../../core/models/TeacherProfile.js'
import { Exam } from '../../../core/models/Exam.js'
import { ExamSession } from '../../../core/models/ExamSession.js'
import { logger } from '../../../core/utils/logger.js'

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
    const { name, course, grade, subjectName, gradeName, description } = req.body

    if (!name) {
      res.status(400).json({ success: false, message: 'نام کلاس الزامی است' })
      return
    }

    const teacher = await getTeacherProfile(userId)
    if (!teacher) {
      res.status(403).json({ success: false, message: 'پروفایل معلم یافت نشد' })
      return
    }

    const newClassroom = new Classroom({
      teacher: teacher._id,
      name,
      course: course || undefined,
      grade: grade || undefined,
      subjectName,
      gradeName,
      description,
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
    const { name, courseId, gradeId, note } = req.body

    const teacher = await getTeacherProfile(userId)
    if (!teacher) {
      res.status(403).json({ success: false, message: 'پروفایل معلم یافت نشد' })
      return
    }

    const updated = await Classroom.findOneAndUpdate(
      { _id: classroomId, teacher: teacher._id },
      { 
        $set: {
          ...(name && { name }),
          ...(courseId && { course: courseId }),
          ...(gradeId && { grade: gradeId }),
          ...(note !== undefined && { note })
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
export const getMyClassrooms = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const teacher = await getTeacherProfile(userId)

    if (!teacher) {
      res.status(403).json({ success: false, message: 'پروفایل معلم یافت نشد' })
      return
    }

    // دریافت کلاس‌ها و جوین کردن با مجموعه‌های Course و Grade برای نمایش نام آن‌ها
    const classrooms = await Classroom.find({ teacher: teacher._id, isActive: true })
      .populate('course', 'name code')
      .populate('grade', 'name')
      .sort({ createdAt: -1 })

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

      const existingMembership = await ClassMembership.findOne({ classId: classroomId, studentPhone: phone });
      if (!existingMembership) {
        await ClassMembership.create({
          classId: classroomId,
          studentPhone: phone,
          firstName,
          lastName,
          fatherName,
          status: 'ACTIVE',
          source: 'MANUAL'
        });
      } else {
        // بروزرسانی اطلاعات اگر قبلا فقط با شماره ثبت شده بود
        if (firstName || lastName || fatherName) {
           await ClassMembership.updateOne(
             { _id: existingMembership._id },
             { $set: { 
                 ...(firstName && { firstName }),
                 ...(lastName && { lastName }),
                 ...(fatherName && { fatherName })
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

    // دریافت اعضای کلاس
    const memberships = await ClassMembership.find({ classId: classroomId })
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

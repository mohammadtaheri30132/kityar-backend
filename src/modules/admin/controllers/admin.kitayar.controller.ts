import { Request, Response } from 'express';
import { Classroom } from '../../../core/models/Classroom.js';
import { ClassMembership } from '../../../core/models/ClassMembership.js';
import { User } from '../../../core/models/User.js';
import { TeacherProfile } from '../../../core/models/TeacherProfile.js';
import { Homework } from '../../../core/models/Homework.js';
import { Exam } from '../../../core/models/Exam.js';
import { ClassSession } from '../../../core/models/ClassSession.js';
import { NotificationService } from '../../../core/services/notificationService.js';
import { logger } from '../../../core/utils/logger.js';

export class AdminKitayarController {
  // ==========================================
  // 1. CLASSES MANAGEMENT (مدیریت کلاس‌ها)
  // ==========================================

  /**
   * دریافت لیست تمام کلاس‌ها به همراه آمار فعالیت‌ها و تعداد دانش‌آموزان
   */
  static async getClasses(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;
      const { search, grade, course, status } = req.query;

      const query: any = {};
      if (status === 'active') query.isActive = true;
      if (status === 'inactive') query.isActive = false;
      if (grade && grade !== 'all') query.grade = grade;
      if (course && course !== 'all') query.course = course;

      if (search && typeof search === 'string') {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { code: { $regex: search, $options: 'i' } },
          { subjectName: { $regex: search, $options: 'i' } },
          { gradeName: { $regex: search, $options: 'i' } },
        ];
      }

      const [classrooms, total] = await Promise.all([
        Classroom.find(query)
          .populate({
            path: 'teacher',
            populate: { path: 'user', select: 'fullName phoneNumber username' },
          })
          .populate('grade', 'name')
          .populate('course', 'name')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Classroom.countDocuments(query),
      ]);

      // محاسبه آمار هر کلاس به شکل موازی
      const classesWithStats = await Promise.all(
        classrooms.map(async (c: any) => {
          const [studentsCount, homeworksCount, examsCount, sessionsCount] = await Promise.all([
            ClassMembership.countDocuments({ classId: c._id, status: 'ACTIVE' }),
            Homework.countDocuments({ classId: c._id }),
            Exam.countDocuments({ classId: c._id }),
            ClassSession.countDocuments({ classId: c._id }),
          ]);

          const teacherUser = c.teacher?.user || null;

          return {
            ...c,
            teacherName: teacherUser?.fullName || 'نامشخص',
            teacherPhone: teacherUser?.phoneNumber || 'نامشخص',
            teacherUsername: teacherUser?.username || '',
            studentsCount,
            homeworksCount,
            examsCount,
            sessionsCount,
            totalActivities: homeworksCount + examsCount + sessionsCount,
          };
        })
      );

      // آمار کلی برای کارت‌های بالای صفحه
      const [totalClassesCount, activeClassesCount, totalMemberships, totalHw, totalEx] = await Promise.all([
        Classroom.countDocuments(),
        Classroom.countDocuments({ isActive: true }),
        ClassMembership.countDocuments({ status: 'ACTIVE' }),
        Homework.countDocuments(),
        Exam.countDocuments(),
      ]);

      return res.json({
        success: true,
        data: classesWithStats,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit,
        },
        summary: {
          totalClasses: totalClassesCount,
          activeClasses: activeClassesCount,
          totalStudents: totalMemberships,
          totalActivities: totalHw + totalEx,
        },
      });
    } catch (error: any) {
      logger.error('Error fetching admin kitayar classes:', error);
      return res.status(500).json({ success: false, message: 'خطا در دریافت لیست کلاس‌ها' });
    }
  }

  /**
   * دریافت جزئیات و فعالیت‌های یک کلاس خاص
   */
  static async getClassDetail(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const classroom: any = await Classroom.findById(id)
        .populate({
          path: 'teacher',
          populate: { path: 'user', select: 'fullName phoneNumber username' },
        })
        .populate('grade', 'name')
        .populate('course', 'name')
        .lean();

      if (!classroom) {
        return res.status(404).json({ success: false, message: 'کلاس یافت نشد' });
      }

      // دانش‌آموزان ثبت‌نامی این کلاس
      const students = await ClassMembership.find({ classId: id })
        .sort({ isVerified: -1, lastName: 1 })
        .lean();

      // تکالیف ثبت شده در کلاس
      const homeworks = await Homework.find({ classId: id })
        .select('title subject dueDateJalali studentSubmissions createdAt')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      // آزمون‌های کلاس
      const exams = await Exam.find({ classId: id })
        .select('title subject totalQuestions status createdAt')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      // جلسات حضور و غیاب
      const sessions = await ClassSession.find({ classId: id })
        .select('sessionNumber topic date createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      const teacherUser = classroom.teacher?.user || null;

      return res.json({
        success: true,
        data: {
          classroom: {
            ...classroom,
            teacherName: teacherUser?.fullName || 'نامشخص',
            teacherPhone: teacherUser?.phoneNumber || 'نامشخص',
          },
          students,
          homeworks,
          exams,
          sessions,
          stats: {
            studentsCount: students.filter((s) => s.status === 'ACTIVE').length,
            verifiedStudentsCount: students.filter((s) => s.isVerified).length,
            homeworksCount: homeworks.length,
            examsCount: exams.length,
            sessionsCount: sessions.length,
          },
        },
      });
    } catch (error: any) {
      logger.error('Error fetching admin kitayar class detail:', error);
      return res.status(500).json({ success: false, message: 'خطا در دریافت جزئیات کلاس' });
    }
  }

  // ==========================================
  // 2. TEACHERS MANAGEMENT (مدیریت معلمان)
  // ==========================================

  /**
   * دریافت لیست تمام معلمان همراه با پروفایل، کلاس‌ها و تعداد دانش‌آموزان
   */
  static async getTeachers(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;
      const { search, category, position, school } = req.query;

      const userQuery: any = { role: 'teacher' };
      if (search && typeof search === 'string') {
        userQuery.$or = [
          { fullName: { $regex: search, $options: 'i' } },
          { phoneNumber: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } },
        ];
      }

      // فیلتر بر اساس پروفایل اگر ارسال شده باشد
      let targetUserIds: any[] | null = null;
      if ((category && category !== 'all') || (position && position !== 'all') || school) {
        const pQuery: any = {};
        if (category && category !== 'all') pQuery.category = category;
        if (position && position !== 'all') pQuery.position = position;
        if (school && typeof school === 'string') pQuery.schools = { $regex: school, $options: 'i' };

        const profiles = await TeacherProfile.find(pQuery).select('user').lean();
        targetUserIds = profiles.map((p) => p.user);
        userQuery._id = { $in: targetUserIds };
      }

      const [teachers, total] = await Promise.all([
        User.find(userQuery)
          .select('-password')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(userQuery),
      ]);

      // اطلاعات تکمیلی و آمار کلاس‌های هر معلم
      const teacherIds = teachers.map((t) => t._id);
      const profiles = await TeacherProfile.find({ user: { $in: teacherIds } }).lean();
      const profileMap = new Map(profiles.map((p) => [p.user.toString(), p]));

      const teachersWithStats = await Promise.all(
        teachers.map(async (teacher: any) => {
          const profile: any = profileMap.get(teacher._id.toString());
          let classesCount = 0;
          let studentsCount = 0;

          if (profile) {
            const classIds = await Classroom.find({ teacher: profile._id }).distinct('_id');
            classesCount = classIds.length;
            if (classesCount > 0) {
              studentsCount = await ClassMembership.countDocuments({
                classId: { $in: classIds },
                status: 'ACTIVE',
              });
            }
          }

          return {
            ...teacher,
            profile: profile || null,
            category: profile?.category || 'آموزگار',
            position: profile?.position || 'معلم',
            schools: profile?.schools || [],
            classesCount,
            studentsCount,
          };
        })
      );

      // آمار خلاصه معلمان
      const oneMonthAgo = new Date();
      oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

      const [totalTeachersCount, activeThisMonth] = await Promise.all([
        User.countDocuments({ role: 'teacher' }),
        User.countDocuments({ role: 'teacher', lastLogin: { $gte: oneMonthAgo } }),
      ]);

      return res.json({
        success: true,
        data: teachersWithStats,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit,
        },
        summary: {
          totalTeachers: totalTeachersCount,
          activeThisMonth,
        },
      });
    } catch (error: any) {
      logger.error('Error fetching admin kitayar teachers:', error);
      return res.status(500).json({ success: false, message: 'خطا در دریافت لیست معلمان' });
    }
  }

  /**
   * دریافت پروفایل یک معلم و تمام کلاس‌ها و دانش‌آموزان او
   */
  static async getTeacherProfile(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const user = await User.findById(id).select('-password').lean();
      if (!user) {
        return res.status(404).json({ success: false, message: 'کاربر یافت نشد' });
      }

      const profile = await TeacherProfile.findOne({ user: id }).lean();

      let classrooms: any[] = [];
      let students: any[] = [];

      if (profile) {
        classrooms = await Classroom.find({ teacher: profile._id })
          .populate('grade', 'name')
          .populate('course', 'name')
          .sort({ createdAt: -1 })
          .lean();

        const classIds = classrooms.map((c) => c._id);
        if (classIds.length > 0) {
          students = await ClassMembership.find({ classId: { $in: classIds } })
            .populate('classId', 'name code')
            .sort({ lastName: 1 })
            .lean();
        }
      }

      return res.json({
        success: true,
        data: {
          user,
          profile,
          classrooms,
          students,
          stats: {
            classesCount: classrooms.length,
            totalStudents: students.filter((s) => s.status === 'ACTIVE').length,
          },
        },
      });
    } catch (error: any) {
      logger.error('Error fetching admin teacher profile:', error);
      return res.status(500).json({ success: false, message: 'خطا در دریافت پروفایل معلم' });
    }
  }

  /**
   * ارسال مستقیم پیام، نوتیفیکیشن یا اعلان به یک معلم خاص
   */
  static async notifyTeacher(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { title, body, priority = 'normal', type = 'ADMIN_ANNOUNCEMENT' } = req.body;

      if (!title || !body) {
        return res.status(400).json({ success: false, message: 'عنوان و متن پیام الزامی است' });
      }

      const teacher = await User.findById(id).select('phoneNumber fullName').lean();
      if (!teacher) {
        return res.status(404).json({ success: false, message: 'معلم مورد نظر یافت نشد' });
      }

      const phones = teacher.phoneNumber ? [teacher.phoneNumber] : [];

      await NotificationService.send({
        recipientType: 'teacher',
        recipientUserId: teacher._id,
        recipientPhones: phones,
        senderId: (req as any).user?._id,
        senderName: (req as any).user?.fullName || 'مدیریت کیتایار',
        senderRole: 'admin',
        title: title.trim(),
        body: body.trim(),
        type: type as any,
        priority: priority as any,
      });

      return res.json({
        success: true,
        message: `پیام و نوتیفیکیشن با موفقیت برای «${teacher.fullName}» ارسال شد.`,
      });
    } catch (error: any) {
      logger.error('Error notifying teacher:', error);
      return res.status(500).json({ success: false, message: 'خطا در ارسال اعلان به معلم' });
    }
  }

  // ==========================================
  // 3. REGISTERED STUDENTS (دانش‌آموزان ثبت‌شده)
  // ==========================================

  /**
   * دریافت لیست تمام دانش‌آموزان ثبت نام شده در تمام کلاس‌ها
   */
  static async getStudents(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;
      const { search, classId, status, isVerified, source } = req.query;

      const query: any = {};
      if (classId && classId !== 'all') query.classId = classId;
      if (status && status !== 'all') query.status = status;
      if (isVerified === 'true') query.isVerified = true;
      if (isVerified === 'false') query.isVerified = false;
      if (source && source !== 'all') query.source = source;

      if (search && typeof search === 'string') {
        query.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { studentPhone: { $regex: search, $options: 'i' } },
          { parentPhone: { $regex: search, $options: 'i' } },
          { fatherName: { $regex: search, $options: 'i' } },
        ];
      }

      const [memberships, total] = await Promise.all([
        ClassMembership.find(query)
          .populate({
            path: 'classId',
            select: 'name code subjectName gradeName teacher',
            populate: {
              path: 'teacher',
              populate: { path: 'user', select: 'fullName phoneNumber' },
            },
          })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        ClassMembership.countDocuments(query),
      ]);

      const formattedStudents = memberships.map((m: any) => {
        const cls = m.classId || {};
        const teacherUser = cls.teacher?.user || null;

        return {
          _id: m._id,
          firstName: m.firstName || '',
          lastName: m.lastName || '',
          fullName: `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'بدون نام',
          fatherName: m.fatherName || '-',
          studentPhone: m.studentPhone,
          parentPhone: m.parentPhone || '-',
          birthDate: m.birthDate || '-',
          status: m.status,
          source: m.source,
          isVerified: m.isVerified || false,
          joinedAt: m.joinedAt || m.createdAt,
          classroom: {
            _id: cls._id,
            name: cls.name || 'کلاس نامشخص',
            code: cls.code || '-',
            gradeName: cls.gradeName || '',
            subjectName: cls.subjectName || '',
          },
          teacher: {
            fullName: teacherUser?.fullName || 'نامشخص',
            phoneNumber: teacherUser?.phoneNumber || '-',
          },
        };
      });

      // آمار خلاصه دانش‌آموزان
      const [totalStudentsCount, verifiedCount, pendingCount, classesWithStudents] = await Promise.all([
        ClassMembership.countDocuments({ status: 'ACTIVE' }),
        ClassMembership.countDocuments({ status: 'ACTIVE', isVerified: true }),
        ClassMembership.countDocuments({ status: 'PENDING' }),
        ClassMembership.distinct('classId'),
      ]);

      return res.json({
        success: true,
        data: formattedStudents,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit,
        },
        summary: {
          totalStudents: totalStudentsCount,
          verifiedStudents: verifiedCount,
          pendingStudents: pendingCount,
          activeClassesCount: classesWithStudents.length,
        },
      });
    } catch (error: any) {
      logger.error('Error fetching admin kitayar students:', error);
      return res.status(500).json({ success: false, message: 'خطا در دریافت لیست دانش‌آموزان' });
    }
  }
}

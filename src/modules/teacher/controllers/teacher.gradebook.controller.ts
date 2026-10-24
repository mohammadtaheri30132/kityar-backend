import { Request, Response } from 'express'
// @ts-ignore
import moment from 'moment-jalaali'
import { GradebookRecord } from '../../../core/models/GradebookRecord.js'
import { Classroom } from '../../../core/models/Classroom.js'
import { ClassMembership } from '../../../core/models/ClassMembership.js'
import { AttendanceRecord } from '../../../core/models/AttendanceRecord.js'
import { TeacherProfile } from '../../../core/models/TeacherProfile.js'
import { WeeklySchedule } from '../../../core/models/WeeklySchedule.js'
import { ClassSession } from '../../../core/models/ClassSession.js'

export const getGradebookRecords = async (req: Request | any, res: Response) => {
  try {
    const { classroomId } = req.params
    const { filterType } = req.query

    const teacher = await TeacherProfile.findOne({ user: req.user._id })
    if (!teacher) {
      console.log('Gradebook error: Teacher profile not found for user', req.user._id);
      return res.status(404).json({ success: false, message: 'Teacher profile not found' })
    }

    const classroom = await Classroom.findOne({ _id: classroomId, teacher: teacher._id })
    if (!classroom) {
      console.log('Gradebook error: Classroom not found:', classroomId, 'for teacher:', teacher._id);
      return res.status(404).json({ success: false, message: 'Classroom not found' })
    }

    // Get Students
    console.log(`Fetching active memberships for classId: ${classroomId}`);
    const memberships = await ClassMembership.find({ classId: classroomId, status: 'ACTIVE' }).populate({
        path: 'studentId',
        populate: { path: 'user', select: 'fullName' }
    });
    
    const studentsList = memberships.map((m: any) => {
      let name = m.studentPhone;
      if (m.studentId && m.studentId.user && m.studentId.user.fullName) {
        name = m.studentId.user.fullName;
      } else if (m.firstName || m.lastName) {
        name = `${m.firstName || ''} ${m.lastName || ''}`.trim();
      }
      return {
        _id: m.studentPhone,
        name: name,
        phone: m.studentPhone,
        isVerified: !!m.isVerified
      };
    });
    
    console.log(`Found ${studentsList.length} students for gradebook.`);

    // Get Manual Records
    let query: any = { classroom: classroomId }
    if (filterType && filterType !== 'all') {
      query.type = filterType
    }
    const manualRecords = await GradebookRecord.find(query).lean()

    // Attendance Data
    const weeklySchedule = await WeeklySchedule.find({ classId: classroomId }).lean()
    const classSessions = await ClassSession.find({ classId: classroomId }).lean()
    const attendanceRecords = await AttendanceRecord.find({ classId: classroomId }).lean()

    res.status(200).json({
      success: true,
      data: {
        students: studentsList,
        records: manualRecords,
        weeklySchedule,
        classSessions,
        attendanceRecords
      }
    })
  } catch (error: any) {
    console.error(error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

export const createGradebookRecord = async (req: Request | any, res: Response) => {
  try {
    const { classroomId } = req.params
    const { studentId, date, type, color, title } = req.body

    const teacher = await TeacherProfile.findOne({ user: req.user._id })
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher profile not found' })
    }

    const classroom = await Classroom.findOne({ _id: classroomId, teacher: teacher._id })
    if (!classroom) {
      return res.status(404).json({ success: false, message: 'Classroom not found' })
    }

    const newRecord = await GradebookRecord.create({
      teacher: req.user._id,
      classroom: classroomId,
      student: studentId,
      date,
      type,
      color,
      title
    })

    res.status(201).json({ success: true, data: newRecord })
  } catch (error: any) {
    console.error(error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

export const deleteGradebookRecord = async (req: Request | any, res: Response) => {
  try {
    const { classroomId, recordId } = req.params
    
    const record = await GradebookRecord.findOneAndDelete({
      _id: recordId,
      classroom: classroomId,
      teacher: req.user._id
    })

    if (!record) {
       return res.status(404).json({ success: false, message: 'Record not found' })
    }

    res.status(200).json({ success: true, message: 'Record deleted successfully' })
  } catch (error: any) {
    console.error(error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

export const saveGradebookAttendance = async (req: Request | any, res: Response) => {
  try {
    const { classroomId } = req.params;
    const { studentPhone, date, subject, status } = req.body;

    const teacher = await TeacherProfile.findOne({ user: req.user._id });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    let session = await ClassSession.findOne({ classId: classroomId, date, subject });
    if (!session) {
      session = await ClassSession.create({
        classId: classroomId,
        teacherId: req.user._id,
        subject,
        date,
        status: 'PENDING'
      });
    }

    await AttendanceRecord.updateOne(
      { sessionId: session._id, studentPhone },
      { 
        $set: { 
          classId: classroomId,
          status,
          reason: ''
        } 
      },
      { upsert: true }
    );
    
    res.json({ success: true, message: 'Attendance saved' });
  } catch(error) {
     console.error(error);
     res.status(500).json({ success: false, message: 'Server error' });
  }
}

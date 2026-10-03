import { Request, Response } from 'express'
import { ClassSession } from '../../../core/models/ClassSession.js'
import { AttendanceRecord } from '../../../core/models/AttendanceRecord.js'
import { ClassMembership } from '../../../core/models/ClassMembership.js'
import { WeeklySchedule } from '../../../core/models/WeeklySchedule.js'
import { logger } from '../../../core/utils/logger.js'

// Helper to get past N dates that match the days of week
function getPastDatesForDays(daysOfWeek: number[], weeksBack: number = 4): { dateStr: string, dayOfWeek: number }[] {
  const result = [];
  const now = new Date();
  
  // A simple Jalali date formatting function just for unique dates.
  // We'll use JS Date offset to simulate past N weeks.
  for (let i = 0; i < weeksBack * 7; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    // JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat
    // In our system: 0=Sat, 1=Sun, ..., 6=Fri
    let jDay = (d.getDay() + 1) % 7;
    
    if (daysOfWeek.includes(jDay)) {
      // Format as YYYY/MM/DD (Greogrian formatted as string just for uniqueness, 
      // but ideally we should format to Jalali. We will just use ISO date part).
      const dateStr = d.toISOString().split('T')[0];
      result.push({ dateStr, dayOfWeek: jDay });
    }
  }
  return result;
}

export const getClassSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { classroomId } = req.params

    // 1. Find the schedule for this class
    const schedules = await WeeklySchedule.find({ classId: classroomId })
    const daysOfWeek = schedules.map(s => s.dayOfWeek)
    
    // 2. Generate past dates for these days (if any schedule exists)
    if (daysOfWeek.length > 0) {
      const pastDates = getPastDatesForDays(daysOfWeek, 4) // Last 4 weeks
      
      // 3. For each date, ensure a ClassSession exists
      for (const pd of pastDates) {
        const matchingSchedule = schedules.find(s => s.dayOfWeek === pd.dayOfWeek)
        if (!matchingSchedule) continue;
        
        await ClassSession.updateOne(
          { classId: classroomId, date: pd.dateStr, subject: matchingSchedule.subject || 'عمومی' },
          { $setOnInsert: { teacherId: userId, status: 'PENDING' } },
          { upsert: true }
        )
      }
    }

    // 4. Fetch all sessions for this class
    const sessions = await ClassSession.find({ classId: classroomId }).sort({ date: -1 })
    
    // 5. Fetch basic stats
    const totalSessions = sessions.length
    const completedSessions = sessions.filter(s => s.status === 'COMPLETED').length
    
    res.json({ 
      success: true, 
      data: {
        sessions,
        stats: {
          totalSessions,
          completedSessions,
          attendanceRate: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0
        }
      } 
    })
  } catch (error) {
    logger.error('Error in getClassSessions:', error)
    res.status(500).json({ success: false, message: 'خطا در دریافت جلسات' })
  }
}

export const getSessionAttendance = async (req: Request, res: Response): Promise<void> => {
  try {
    const { classroomId, sessionId } = req.params

    // Get all students in the class
    const students = await ClassMembership.find({ classId: classroomId, status: 'ACTIVE' })
    
    // Get existing records
    const records = await AttendanceRecord.find({ sessionId })
    
    // Merge them
    const data = students.map(st => {
      const existing = records.find(r => r.studentPhone === st.studentPhone)
      return {
        studentPhone: st.studentPhone,
        firstName: st.firstName,
        lastName: st.lastName,
        status: existing ? existing.status : 'PRESENT', // Default is PRESENT
        reason: existing?.reason || ''
      }
    })

    res.json({ success: true, data })
  } catch (error) {
    logger.error('Error in getSessionAttendance:', error)
    res.status(500).json({ success: false, message: 'خطا در دریافت لیست حضور غیاب' })
  }
}

export const saveSessionAttendance = async (req: Request, res: Response): Promise<void> => {
  try {
    const { classroomId, sessionId } = req.params
    const { attendanceData } = req.body // Array of { studentPhone, status, reason }

    for (const record of attendanceData) {
      await AttendanceRecord.updateOne(
        { sessionId, studentPhone: record.studentPhone },
        { 
          $set: { 
            classId: classroomId,
            status: record.status,
            reason: record.reason
          } 
        },
        { upsert: true }
      )
    }

    await ClassSession.findByIdAndUpdate(sessionId, { status: 'COMPLETED' })

    res.json({ success: true, message: 'حضور و غیاب با موفقیت ثبت شد' })
  } catch (error) {
    logger.error('Error in saveSessionAttendance:', error)
    res.status(500).json({ success: false, message: 'خطا در ثبت حضور غیاب' })
  }
}

export const getStudentAttendanceHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { classroomId, studentPhone } = req.params

    const records = await AttendanceRecord.find({ classId: classroomId, studentPhone })
      .populate('sessionId', 'subject date')
      .sort({ createdAt: -1 })

    // Format for frontend
    const history = records.map(r => ({
      status: r.status,
      reason: r.reason,
      sessionDate: (r.sessionId as any)?.date,
      subject: (r.sessionId as any)?.subject
    }))

    // Calculate stats
    const total = history.length
    const present = history.filter(h => h.status === 'PRESENT').length
    const absentUnexcused = history.filter(h => h.status === 'ABSENT_UNEXCUSED').length
    const absentExcused = history.filter(h => h.status === 'ABSENT_EXCUSED').length
    const late = history.filter(h => h.status === 'LATE').length

    res.json({ 
      success: true, 
      data: {
        history,
        stats: { total, present, absentUnexcused, absentExcused, late }
      } 
    })
  } catch (error) {
    logger.error('Error in getStudentAttendanceHistory:', error)
    res.status(500).json({ success: false, message: 'خطا در دریافت تاریخچه حضور غیاب' })
  }
}

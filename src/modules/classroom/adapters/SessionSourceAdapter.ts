import { Types } from 'mongoose'
import { OnlineClassBooking, IOnlineClassBooking } from '../../../core/models/OnlineClassBooking.js'
import { QuestionRequest, IQuestionRequest } from '../../../core/models/QuestionRequest.js'
import { logger } from '../../../core/utils/logger.js'

export interface ISessionSource {
  sourceId: string
  sourceType: 'online_class_booking' | 'question_request' | 'ad_hoc'
  teacherId: string
  studentId: string
  invitedStudentIds: string[]
  title: string
  topic?: string
  durationMinutes: number
  status: string
  canAccess(userId: string, role: string): boolean
  markInProgress(): Promise<void>
  markCompleted(): Promise<void>
}

export class SessionSourceAdapter {
  /**
   * Resolves a session source from OnlineClassBooking or QuestionRequest
   * Handles lookup by Mongo ObjectId or BookingCode
   */
  static async resolveSource(identifier: string): Promise<ISessionSource | null> {
    const isObjectId = Types.ObjectId.isValid(identifier)

    // 1. Check OnlineClassBooking
    let booking: IOnlineClassBooking | null = null
    if (isObjectId) {
      booking = await OnlineClassBooking.findById(identifier)
    }
    if (!booking) {
      booking = await OnlineClassBooking.findOne({ bookingCode: identifier })
    }

    if (booking) {
      const invitedIds = (booking.invitedStudents || [])
        .filter((s) => s.studentId)
        .map((s) => s.studentId!.toString())

      return {
        sourceId: booking._id.toString(),
        sourceType: 'online_class_booking',
        teacherId: booking.teacherId.toString(),
        studentId: booking.studentId.toString(),
        invitedStudentIds: invitedIds,
        title: booking.topic || booking.subjectName || 'کلاس رفع اشکال آنلاین',
        topic: booking.topic,
        durationMinutes: booking.durationMinutes || 45,
        status: booking.status,
        canAccess(userId: string, role: string): boolean {
          if (role === 'admin') return true
          if (booking!.teacherId.toString() === userId) return true
          if (booking!.studentId.toString() === userId) return true
          return invitedIds.includes(userId)
        },
        async markInProgress(): Promise<void> {
          if (booking!.status === 'confirmed') {
            booking!.status = 'in_progress'
            await booking!.save()
            logger.info(`[Classroom] Booking ${booking!._id} marked as in_progress`)
          }
        },
        async markCompleted(): Promise<void> {
          if (booking!.status !== 'completed') {
            booking!.status = 'completed'
            await booking!.save()
            logger.info(`[Classroom] Booking ${booking!._id} marked as completed`)
          }
        },
      }
    }

    // 2. Check QuestionRequest
    if (isObjectId) {
      const question = await QuestionRequest.findById(identifier)
      if (question) {
        const assignedTeacherId = question.claimedBy?.toString() || question.teacherId?.toString() || ''
        const studentId = question.studentId.toString()

        return {
          sourceId: question._id.toString(),
          sourceType: 'question_request',
          teacherId: assignedTeacherId,
          studentId: studentId,
          invitedStudentIds: [],
          title: question.title || 'رفع اشکال سوال',
          topic: question.description?.slice(0, 50),
          durationMinutes: 30,
          status: question.status,
          canAccess(userId: string, role: string): boolean {
            if (role === 'admin') return true
            if (studentId === userId) return true
            if (assignedTeacherId && assignedTeacherId === userId) return true
            return false
          },
          async markInProgress(): Promise<void> {
            if (question.status === 'accepted' || question.status === 'claimed') {
              question.status = 'in_progress'
              await question.save()
            }
          },
          async markCompleted(): Promise<void> {
            if (question.status !== 'answered') {
              question.status = 'answered'
              question.answeredAt = new Date()
              await question.save()
            }
          },
        }
      }
    }

    return null
  }
}


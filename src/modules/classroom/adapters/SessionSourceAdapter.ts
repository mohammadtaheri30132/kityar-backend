import { Types } from 'mongoose'
import { OnlineClassBooking, IOnlineClassBooking } from '../../../core/models/OnlineClassBooking.js'
import { OnlineClassMembership } from '../../../core/models/OnlineClassMembership.js'
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
  isJoinableStatus(): boolean
  canAccess(userId: string, role: string): Promise<boolean>
  markInProgress(): Promise<void>
  markCompleted(): Promise<void>
}

export class SessionSourceAdapter {
  /**
   * Resolves a session source from OnlineClassBooking or QuestionRequest
   * Handles lookup by Mongo ObjectId, BookingCode, or Meeting RoomName
   */
  static async resolveSource(identifier: string): Promise<ISessionSource | null> {
    const isObjectId = Types.ObjectId.isValid(identifier)

    // 1. Check OnlineClassBooking
    let booking: IOnlineClassBooking | null = null
    if (isObjectId) {
      booking = await OnlineClassBooking.findById(identifier)
    }
    if (!booking) {
      booking = await OnlineClassBooking.findOne({
        $or: [
          { bookingCode: identifier },
          { 'meeting.roomName': identifier },
        ],
      })
    }

    if (booking) {
      const invitedIds = (booking.invitedStudents || [])
        .filter((s) => s.studentId)
        .map((s) => s.studentId!.toString())

      return {
        sourceId: booking._id.toString(),
        sourceType: 'online_class_booking',
        teacherId: booking.teacherId ? booking.teacherId.toString() : '',
        studentId: booking.studentId ? booking.studentId.toString() : '',
        invitedStudentIds: invitedIds,
        title: booking.title || booking.topic || booking.subjectName || 'کلاس رفع اشکال آنلاین',
        topic: booking.topic,
        durationMinutes: booking.durationMinutes || 90,
        status: booking.status,
        isJoinableStatus(): boolean {
          return ['confirmed', 'in_progress'].includes(booking!.status)
        },
        async canAccess(userId: string, role: string): Promise<boolean> {
          if (role === 'admin') return true
          if (booking!.teacherId && booking!.teacherId.toString() === userId) return true
          if (!['confirmed', 'in_progress'].includes(booking!.status)) {
            return false
          }
          if (booking!.studentId && booking!.studentId.toString() === userId) {
            return true
          }
          if (Types.ObjectId.isValid(userId)) {
            const membership = await OnlineClassMembership.findOne({
              bookingId: booking!._id,
              studentId: new Types.ObjectId(userId),
            }).lean()
            if (membership) {
              return membership.status === 'active' || membership.status === 'accepted'
            }
          }
          const matchingInv = (booking!.invitedStudents || []).find(
            (s) => s.studentId && s.studentId.toString() === userId
          )
          return Boolean(matchingInv && matchingInv.status === 'accepted')
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
          isJoinableStatus(): boolean {
            return ['accepted', 'claimed', 'in_progress'].includes(question.status)
          },
          async canAccess(userId: string, role: string): Promise<boolean> {
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


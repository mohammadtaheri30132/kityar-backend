import assert from 'node:assert/strict'
import { Types } from 'mongoose'
import { OnlineClassService } from '../../core/services/onlineClass.service.js'
import { OnlineClassBooking } from '../../core/models/OnlineClassBooking.js'
import { TeacherProfile } from '../../core/models/TeacherProfile.js'
import { WalletService } from '../../core/services/wallet.service.js'
import { ClassroomSession } from '../../modules/classroom/models/ClassroomSession.js'
import { ClassroomPricing, DEFAULT_CLASSROOM_POLICY } from '../../core/models/ClassroomPricing.js'

async function runScenarioTests() {
  console.log('🧪 Starting Online Class Scenario Tests...')

  // Test 1: Class Duration & Timing calculation
  console.log('➡️ Test 1: Timing Calculation (Early teacher join vs Late teacher join with 5m buffer)')
  const scheduledAt = new Date('2026-11-19T17:00:00.000Z')

  // Case 1a: Teacher arrives 4 mins early at 16:56 for 60-min class
  const teacherEarlyJoin = new Date('2026-11-19T16:56:00.000Z')
  const timingEarly = OnlineClassService.calculateClassEndTime(scheduledAt, teacherEarlyJoin, 60, 5)
  // Time must start at official scheduled time (17:00), not 16:56!
  assert.equal(timingEarly.effectiveStartAt.toISOString(), scheduledAt.toISOString(), 'Effective start must be scheduled time when early')
  // End time must be 17:00 + (60 + 5) = 18:05
  assert.equal(timingEarly.endsAt.toISOString(), new Date('2026-11-19T18:05:00.000Z').toISOString(), 'End time must be scheduled + 65 mins')

  // Case 1b: Teacher arrives 15 mins late at 17:15 for 60-min class (User explicit example)
  const teacherLateJoin = new Date('2026-11-19T17:15:00.000Z')
  const timingLate = OnlineClassService.calculateClassEndTime(scheduledAt, teacherLateJoin, 60, 5)
  // Time must start at 17:15
  assert.equal(timingLate.effectiveStartAt.toISOString(), teacherLateJoin.toISOString(), 'Effective start must be 17:15')
  // End time must be 17:15 + 60m + 5m buffer = 18:20
  assert.equal(timingLate.endsAt.toISOString(), new Date('2026-11-19T18:20:00.000Z').toISOString(), 'End time must be 18:20')
  console.log('  ✅ Test 1 Passed: Teacher early & late timing calculated accurately (17:15 -> 18:20).')

  // Test 2: Teacher No-Show (> 30 mins) & Auto Refund
  console.log('➡️ Test 2: Teacher No-Show Grace Period Exceeded (>30m) & 100% Student Refund')
  const mockStudentId = new Types.ObjectId()
  const mockTeacherId = new Types.ObjectId()
  const mockBookingId = new Types.ObjectId()

  let refundedAmount = 0
  let creditedUserId: any = null
  let teacherNoShowCountIncrement = 0

  // Stub WalletService.credit
  const origCredit = WalletService.credit
  ;(WalletService as any).credit = async (params: any) => {
    creditedUserId = params.userId
    refundedAmount = params.amount
    return { wallet: {} as any, transaction: {} as any }
  }

  // Stub TeacherProfile.findOneAndUpdate
  const origTeacherUpdate = TeacherProfile.findOneAndUpdate
  ;(TeacherProfile as any).findOneAndUpdate = async (filter: any, update: any) => {
    if (update?.$inc?.noShowCount) {
      teacherNoShowCountIncrement += update.$inc.noShowCount
    }
    return {}
  }

  // Stub ClassroomSession.updateMany
  const origSessionUpdateMany = ClassroomSession.updateMany
  ;(ClassroomSession as any).updateMany = async () => ({})

  const mockBooking: any = {
    _id: mockBookingId,
    bookingCode: 'ocb-noshow-test-1',
    studentId: mockStudentId,
    teacherId: mockTeacherId,
    scheduledAt: new Date(Date.now() - 40 * 60 * 1000), // 40 minutes ago (> 30 min threshold)
    durationMinutes: 90,
    status: 'confirmed',
    payment: { isPaid: true },
    pricing: { totalPrice: 150000 },
    teacherJoinedAt: undefined,
    topic: 'ریاضی هفتم',
    courseName: 'متوسطه اول',
    subjectName: 'ریاضی',
    save: async function () { return this },
  }

  const resultBooking = await OnlineClassService.handleTeacherNoShow(mockBooking)
  assert.equal(resultBooking?.teacherNoShow, true, 'Booking teacherNoShow flag must be true')
  assert.equal(resultBooking?.status, 'refunded', 'Booking status must be set to refunded')
  assert.equal(resultBooking?.cancellationReason, 'عدم حضور معلم', 'Cancellation reason must state عدم حضور معلم')
  assert.equal(refundedAmount, 150000, 'Student must receive 100% full refund (150,000 Tomans)')
  assert.equal(creditedUserId?.toString(), mockStudentId.toString(), 'Refund must be credited to student wallet')
  assert.equal(teacherNoShowCountIncrement, 1, 'Teacher noShowCount must be incremented by 1 in resume')
  console.log('  ✅ Test 2 Passed: Teacher no-show cancelled, 100% refunded to student wallet, +1 penalty to teacher resume.')

  // Test 3: Session Policy Defaults & Unlock Rules
  console.log('➡️ Test 3: Policy Defaults Verification')
  const defaultPolicy = DEFAULT_CLASSROOM_POLICY
  assert.equal(defaultPolicy.unlockBeforeMinutes, 5, 'Default unlockBeforeMinutes must be 5 minutes')
  assert.equal(defaultPolicy.teacherGraceMinutes, 30, 'Default teacherGraceMinutes must be 30 minutes')
  assert.equal(defaultPolicy.extraMinutes, 5, 'Default extraMinutes buffer must be 5 minutes')
  assert.equal(defaultPolicy.chatOpenHoursAfterEnd, 24, 'Default chatOpenHoursAfterEnd must be 24 hours')
  assert.ok(defaultPolicy.teacherRules.length > 0, 'Teacher rules must have items')
  assert.ok(defaultPolicy.studentRules.length > 0, 'Student rules must have items')
  console.log('  ✅ Test 3 Passed: Classroom policy defaults verified.')

  // Cleanup stubs
  ;(WalletService as any).credit = origCredit
  ;(TeacherProfile as any).findOneAndUpdate = origTeacherUpdate
  ;(ClassroomSession as any).updateMany = origSessionUpdateMany

  console.log('🎉 All Online Class Scenario Tests Passed Successfully!')
}

runScenarioTests().catch((err) => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})

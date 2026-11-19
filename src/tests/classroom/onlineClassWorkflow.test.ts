import assert from 'node:assert/strict'
import { Types } from 'mongoose'
import {
  validateAndNormalizeWeeklySchedule,
  isWindowWithinWeeklySchedule,
  resolveRequestedDateTime,
  teacherMatchesAcademicCriteria,
  getTehranTimeParts,
} from '../../core/utils/weeklySchedule.js'
import { withTeacherBookingLock } from '../../core/utils/bookingSlotLock.js'
import { StudentOnlineClassController } from '../../modules/student/controllers/student.onlineClass.controller.js'
import { TeacherOnlineClassController } from '../../modules/teacher/controllers/teacher.onlineClass.controller.js'
import { TeacherCenterController } from '../../modules/teacher/controllers/teacher.center.controller.js'
import { SessionSourceAdapter } from '../../modules/classroom/adapters/SessionSourceAdapter.js'
import { TeacherProfile } from '../../core/models/TeacherProfile.js'
import { OnlineClassBooking } from '../../core/models/OnlineClassBooking.js'
import { OnlineClassMembership } from '../../core/models/OnlineClassMembership.js'
import { User } from '../../core/models/User.js'
import { WalletService } from '../../core/services/wallet.service.js'

function mockRes() {
  const res: any = { statusCode: 200, body: null }
  res.status = (code: number) => {
    res.statusCode = code
    return res
  }
  res.json = (data: any) => {
    res.body = data
    return res
  }
  return res
}

/**
 * Returns next future Tehran date matching the requested weekday key (Saturday=6 in JS Date getUTCDay, etc.)
 * Used to compute unambiguous future dates in Asia/Tehran for test scenarios.
 */
function nextFutureTehranDateKey(targetWeekday: 'saturday' | 'sunday' | 'monday'): string {
  const now = new Date()
  for (let offset = 1; offset <= 10; offset++) {
    const candidate = new Date(now.getTime() + offset * 86400_000)
    const parts = getTehranTimeParts(candidate)
    if (parts.weekday === targetWeekday) {
      return parts.dateKey
    }
  }
  throw new Error(`Could not find upcoming ${targetWeekday}`)
}

async function runTests() {
  console.log('🧪 Running Online Class Weekly Schedule, Availability & Unified Membership Tests...')

  // =========================================================================
  // PART 1: Weekly Schedule Validation & Time-Window Logic (Pure Unit Tests)
  // =========================================================================

  // 1a. Teacher defines Saturday 16:00-18:00 & 19:00-22:00, Sunday 17:00-21:00, Monday closed ([])
  const validSchedRes = validateAndNormalizeWeeklySchedule({
    saturday: [
      { startTime: '19:00', endTime: '22:00' },
      { startTime: '16:00', endTime: '18:00' },
    ],
    sunday: [{ startTime: '۱۷:۰۰', endTime: '۲۱:۰۰' }],
    monday: [],
  })
  assert.equal(validSchedRes.valid, true, 'Valid non-overlapping schedule should pass')
  if (validSchedRes.valid) {
    assert.deepEqual(validSchedRes.schedule.saturday, [
      { startTime: '16:00', endTime: '18:00' },
      { startTime: '19:00', endTime: '22:00' },
    ])
    assert.deepEqual(validSchedRes.schedule.sunday, [{ startTime: '17:00', endTime: '21:00' }])
    assert.deepEqual(validSchedRes.schedule.monday, [])
  }

  // 1b. Invalid startTime >= endTime rejected
  const invalidOrderRes = validateAndNormalizeWeeklySchedule({
    saturday: [{ startTime: '18:00', endTime: '16:00' }],
  })
  assert.equal(invalidOrderRes.valid, false, 'startTime >= endTime must be rejected')

  // 1c. Overlapping intervals on same day rejected
  const overlapRes = validateAndNormalizeWeeklySchedule({
    saturday: [
      { startTime: '16:00', endTime: '19:30' },
      { startTime: '18:00', endTime: '21:00' },
    ],
  })
  assert.equal(overlapRes.valid, false, 'Overlapping time intervals in same day must be rejected')

  const satDate = nextFutureTehranDateKey('saturday')
  const monDate = nextFutureTehranDateKey('monday')
  assert.ok(validSchedRes.valid)
  const weeklySchedule = validSchedRes.schedule

  // Scenario: Saturday 17:00 for 60 mins -> fits in 16:00-18:00 -> AVAILABLE
  const sat1700 = resolveRequestedDateTime({ date: satDate, startTime: '17:00' })!
  const check1700 = isWindowWithinWeeklySchedule(weeklySchedule, sat1700, 60)
  assert.equal(check1700.available, true, 'Saturday 17:00 + 60m must fit inside 16:00-18:00')

  // Scenario: Saturday 18:30 for 30 mins or 60 mins -> gap between 18:00 and 19:00 -> UNAVAILABLE
  const sat1830 = resolveRequestedDateTime({ date: satDate, startTime: '18:30' })!
  assert.equal(
    isWindowWithinWeeklySchedule(weeklySchedule, sat1830, 30).available,
    false,
    'Saturday 18:30 + 30m must NOT fit because teacher gap is 18:00-19:00'
  )
  assert.equal(
    isWindowWithinWeeklySchedule(weeklySchedule, sat1830, 60).available,
    false,
    'Saturday 18:30 + 60m must NOT fit'
  )

  // Edge check: Saturday 17:30 + 60m ends at 18:30 -> exceeds 18:00 -> UNAVAILABLE
  const sat1730 = resolveRequestedDateTime({ date: satDate, startTime: '17:30' })!
  assert.equal(
    isWindowWithinWeeklySchedule(weeklySchedule, sat1730, 60).available,
    false,
    'EndTime 18:30 > AvailEnd 18:00 must NOT be eligible'
  )

  // Scenario: Saturday 19:30 + 60m -> fits in 19:00-22:00 -> AVAILABLE
  const sat1930 = resolveRequestedDateTime({ date: satDate, startTime: '19:30' })!
  assert.equal(
    isWindowWithinWeeklySchedule(weeklySchedule, sat1930, 60).available,
    true,
    'Saturday 19:30 + 60m must fit inside 19:00-22:00'
  )

  // Scenario: Closed Monday ([]) -> UNAVAILABLE
  const mon1700 = resolveRequestedDateTime({ date: monDate, startTime: '17:00' })!
  assert.equal(
    isWindowWithinWeeklySchedule(weeklySchedule, mon1700, 60).available,
    false,
    'Closed Monday must NOT allow booking'
  )

  // Subject & level matching
  assert.equal(
    teacherMatchesAcademicCriteria(
      { teachingSubjects: ['ریاضی'], educationLevel: 'secondary' },
      { subjectName: 'ریاضی (۱)', courseName: 'متوسطه دوم' }
    ),
    true
  )
  assert.equal(
    teacherMatchesAcademicCriteria(
      { teachingSubjects: ['شیمی'], educationLevel: 'secondary' },
      { subjectName: 'فیزیک', courseName: 'متوسطه دوم' }
    ),
    false
  )

  // Atomic Lock Concurrency Simulation (In-process lock test)
  let sharedSlotBooked = false
  const concurrentResults = await Promise.all([
    withTeacherBookingLock('t_lock_test', async () => {
      if (sharedSlotBooked) return 'CONFLICT'
      await new Promise((r) => setTimeout(r, 20))
      sharedSlotBooked = true
      return 'BOOKED'
    }),
    withTeacherBookingLock('t_lock_test', async () => {
      if (sharedSlotBooked) return 'CONFLICT'
      await new Promise((r) => setTimeout(r, 20))
      sharedSlotBooked = true
      return 'BOOKED'
    }),
  ])
  assert.deepEqual(
    concurrentResults.sort(),
    ['BOOKED', 'CONFLICT'],
    'Concurrent booking requests for same slot must allow only one winner'
  )

  // =========================================================================
  // PART 2: End-to-End Controller Scenarios (with Mongoose In-Memory Stubs)
  // =========================================================================
  const teacherUserId = new Types.ObjectId()
  const student1Id = new Types.ObjectId()
  const student2Id = new Types.ObjectId()
  const invitedStudentId = new Types.ObjectId()

  const teacherProfileDoc: any = {
    _id: new Types.ObjectId(),
    user: {
      _id: teacherUserId,
      fullName: 'استاد بهرامی',
      avatar: '',
      phoneNumber: '09120000001',
    },
    isActive: true,
    rating: 4.9,
    ratingsCount: 12,
    experienceYears: 8,
    educationLevel: 'both',
    teachingSubjects: ['ریاضی', 'فیزیک'],
    onlineClassBasePrice: 600000,
    onlineClassDurations: { '15': true, '30': true, '45': true, '60': true, '75': true, '90': true },
    weeklySchedule,
  }

  const storedBookings: any[] = []
  const storedMemberships: any[] = []
  const usersById = new Map<string, any>([
    [teacherUserId.toString(), { _id: teacherUserId, fullName: 'استاد بهرامی', phoneNumber: '09120000001' }],
    [student1Id.toString(), { _id: student1Id, fullName: 'سارا رضایی', phoneNumber: '09121111111' }],
    [student2Id.toString(), { _id: student2Id, fullName: 'رضا کریمی', phoneNumber: '09122222222' }],
    [invitedStudentId.toString(), { _id: invitedStudentId, fullName: 'امیر حسینی', phoneNumber: '09123333333' }],
  ])

  // Backup originals
  const origTeacherFind = TeacherProfile.find
  const origTeacherFindOne = TeacherProfile.findOne
  const origTeacherFindById = TeacherProfile.findById
  const origTeacherFindOneAndUpdate = TeacherProfile.findOneAndUpdate
  const origBookingFind = OnlineClassBooking.find
  const origBookingFindOne = OnlineClassBooking.findOne
  const origBookingFindById = OnlineClassBooking.findById
  const origBookingCreate = OnlineClassBooking.create
  const origMemFind = OnlineClassMembership.find
  const origMemFindOne = OnlineClassMembership.findOne
  const origMemCreate = OnlineClassMembership.create
  const origMemUpdateOne = OnlineClassMembership.updateOne
  const origMemUpdateMany = OnlineClassMembership.updateMany
  const origUserFind = User.find
  const origUserFindOne = User.findOne
  const origUserFindById = User.findById
  const origWalletGet = WalletService.getOrCreateWallet
  const origWalletDebit = WalletService.debit

  const makeChain = (val: any) => {
    const chain: any = {
      populate() { return chain },
      sort() { return chain },
      select() { return chain },
      lean: async () => val,
      then: (res: any, rej: any) => Promise.resolve(val).then(res, rej),
    }
    return chain
  }

  const bookingMatchesFilter = (b: any, q: any): boolean => {
    if (!q) return true
    if (q._id && q._id.$ne && b._id.toString() === q._id.$ne.toString()) return false
    if (q._id && q._id.$in && !q._id.$in.some((id: any) => id.toString() === b._id.toString())) return false
    if (q._id && typeof q._id === 'object' && !q._id.$ne && !q._id.$in && b._id.toString() !== q._id.toString()) return false
    if (q.teacherId && typeof q.teacherId === 'string' && b.teacherId?.toString() !== q.teacherId) return false
    if (q.teacherId && q.teacherId.$in && !q.teacherId.$in.some((id: any) => id.toString() === b.teacherId?.toString())) return false
    if (q.scheduledAt?.$lt && !(new Date(b.scheduledAt) < q.scheduledAt.$lt)) return false
    if (q.endTime?.$gt && !(new Date(b.endTime) > q.endTime.$gt)) return false
    if (q.status && typeof q.status === 'string' && b.status !== q.status) return false
    if (q.status && q.status.$in && !q.status.$in.includes(b.status)) return false
    if (q.$and) {
      for (const clause of q.$and) {
        if (!bookingMatchesFilter(b, clause)) return false
      }
    }
    if (q.$or) {
      const anyOr = q.$or.some((sub: any) => {
        if (sub.teacherId?.$in) return sub.teacherId.$in.some((id: any) => id.toString() === b.teacherId?.toString())
        if (sub.teacherId) return b.teacherId?.toString() === sub.teacherId.toString()
        if (sub.targetTeacherIds?.$in) return false
        if (sub.studentId) return b.studentId?.toString() === sub.studentId.toString()
        if (sub['invitedStudents.studentId']) {
          return (b.invitedStudents || []).some(
            (s: any) => s.studentId?.toString() === sub['invitedStudents.studentId'].toString()
          )
        }
        if (sub['invitedStudents.phoneNumber']) {
          return (b.invitedStudents || []).some((s: any) => s.phoneNumber === sub['invitedStudents.phoneNumber'])
        }
        if (sub._id?.$in) return sub._id.$in.some((id: any) => id.toString() === b._id.toString())
        if (sub.status?.$in) return sub.status.$in.includes(b.status)
        return false
      })
      if (!anyOr) return false
    }
    return true
  }

  try {
    ;(TeacherProfile as any).find = () => makeChain([teacherProfileDoc])
    ;(TeacherProfile as any).findOne = () => makeChain(teacherProfileDoc)
    ;(TeacherProfile as any).findById = () => makeChain(teacherProfileDoc)
    ;(TeacherProfile as any).findOneAndUpdate = (_filter: any, update: any) => {
      if (update?.$set?.weeklySchedule) {
        teacherProfileDoc.weeklySchedule = update.$set.weeklySchedule
      }
      if (update?.$set?.onlineClassBasePrice) {
        teacherProfileDoc.onlineClassBasePrice = update.$set.onlineClassBasePrice
      }
      return makeChain(teacherProfileDoc)
    }

    ;(OnlineClassBooking as any).find = (q: any) => makeChain(storedBookings.filter((b) => bookingMatchesFilter(b, q)))
    ;(OnlineClassBooking as any).findOne = (q: any) =>
      makeChain(storedBookings.find((b) => bookingMatchesFilter(b, q)) || null)
    ;(OnlineClassBooking as any).findById = (id: any) => {
      const found = storedBookings.find((b) => b._id.toString() === id.toString()) || null
      return makeChain(found)
    }
    ;(OnlineClassBooking as any).create = async (data: any) => {
      const doc: any = {
        ...data,
        _id: new Types.ObjectId(),
        toObject() {
          return { ...this }
        },
        async save() {
          return this
        },
      }
      storedBookings.push(doc)
      return doc
    }

    ;(OnlineClassMembership as any).find = (q: any) => {
      const list = storedMemberships.filter((m) => {
        if (q.bookingId?.$in) {
          return q.bookingId.$in.some((id: any) => id.toString() === m.bookingId.toString())
        }
        if (q.$or) {
          return q.$or.some(
            (sub: any) =>
              (sub.studentId && m.studentId?.toString() === sub.studentId.toString()) ||
              (sub.phoneNumber && m.phoneNumber === sub.phoneNumber)
          )
        }
        return true
      })
      return makeChain(list)
    }
    ;(OnlineClassMembership as any).findOne = (q: any) => {
      const found = storedMemberships.find(
        (m) =>
          m.bookingId.toString() === q.bookingId?.toString() &&
          (q.studentId ? m.studentId?.toString() === q.studentId.toString() : true) &&
          (q.$or
            ? q.$or.some(
                (s: any) =>
                  (s.studentId && m.studentId?.toString() === s.studentId.toString()) ||
                  (s.phoneNumber && m.phoneNumber === s.phoneNumber)
              )
            : true)
      )
      if (found && !found.save) {
        found.save = async () => found
      }
      return makeChain(found || null)
    }
    ;(OnlineClassMembership as any).create = async (data: any) => {
      const dup = storedMemberships.find(
        (m) =>
          m.bookingId.toString() === data.bookingId.toString() &&
          ((data.studentId && m.studentId?.toString() === data.studentId.toString()) ||
            (data.phoneNumber && m.phoneNumber === data.phoneNumber))
      )
      if (dup) throw Object.assign(new Error('Duplicate membership'), { code: 11000 })
      const doc = { ...data, _id: new Types.ObjectId(), save: async () => doc }
      storedMemberships.push(doc)
      return doc
    }
    ;(OnlineClassMembership as any).updateOne = async (filter: any, update: any) => {
      const existing = storedMemberships.find(
        (m) =>
          m.bookingId.toString() === filter.bookingId.toString() &&
          ((filter.studentId && m.studentId?.toString() === filter.studentId.toString()) ||
            (filter.phoneNumber && m.phoneNumber === filter.phoneNumber))
      )
      if (!existing && update.$setOnInsert) {
        const doc = { ...update.$setOnInsert, _id: new Types.ObjectId(), save: async () => doc }
        storedMemberships.push(doc)
      }
      return { acknowledged: true }
    }
    ;(OnlineClassMembership as any).updateMany = async () => ({ acknowledged: true })

    ;(User as any).find = (q: any) => {
      const phones = q?.phoneNumber?.$in || []
      const resUsers = Array.from(usersById.values()).filter((u) => phones.includes(u.phoneNumber))
      return makeChain(resUsers)
    }
    ;(User as any).findOne = (q: any) => {
      const found = Array.from(usersById.values()).find((u) => u.phoneNumber === q?.phoneNumber) || null
      return makeChain(found)
    }
    ;(User as any).findById = (id: any) => makeChain(usersById.get(id?.toString()) || null)
    ;(WalletService as any).getOrCreateWallet = async () => ({ balance: 2000000 })
    ;(WalletService as any).debit = async () => ({ success: true })

    // Test 2 & 3 & 4 & 11: available-teachers filtering
    const rSat17 = mockRes()
    await StudentOnlineClassController.getAvailableTeachers(
      { body: { date: satDate, startTime: '17:00', durationMinutes: 60, subjectName: 'ریاضی' } } as any,
      rSat17
    )
    assert.equal(rSat17.body.data.length, 1, 'Teacher MUST appear for Saturday 17:00 (60m)')

    const rSat1830 = mockRes()
    await StudentOnlineClassController.getAvailableTeachers(
      { body: { date: satDate, startTime: '18:30', durationMinutes: 30, subjectName: 'ریاضی' } } as any,
      rSat1830
    )
    assert.equal(rSat1830.body.data.length, 0, 'Teacher MUST NOT appear for Saturday 18:30 (gap)')

    const rSat1930 = mockRes()
    await StudentOnlineClassController.getAvailableTeachers(
      { body: { date: satDate, startTime: '19:30', durationMinutes: 60, subjectName: 'ریاضی' } } as any,
      rSat1930
    )
    assert.equal(rSat1930.body.data.length, 1, 'Teacher MUST appear for Saturday 19:30 (60m)')

    const rMon = mockRes()
    await StudentOnlineClassController.getAvailableTeachers(
      { body: { date: monDate, startTime: '17:00', durationMinutes: 60, subjectName: 'ریاضی' } } as any,
      rMon
    )
    assert.equal(rMon.body.data.length, 0, 'Teacher MUST NOT appear on closed Monday')

    // Teacher with educationLevel='both' and single-slot day must appear for 'ابتدایی' / 'فارسی' starting inside slot
    const sunDate = nextFutureTehranDateKey('sunday')
    const rSunFarsi = mockRes()
    await StudentOnlineClassController.getAvailableTeachers(
      {
        body: {
          date: sunDate,
          startTime: '20:35',
          durationMinutes: 60,
          courseName: 'ابتدایی',
          gradeName: 'اول',
          subjectName: 'فارسی',
        },
      } as any,
      rSunFarsi
    )
    assert.equal(
      rSunFarsi.body.data.length,
      1,
      'Teacher with educationLevel=both and Sunday 17:00-21:00 MUST appear for ابتدایی/فارسی at 20:35 (60m)'
    )

    // Test 6: Two students concurrently book Saturday 17:00 (60m) -> only ONE succeeds!
    const resBook1 = mockRes()
    const resBook2 = mockRes()
    await Promise.all([
      StudentOnlineClassController.createBooking(
        {
          user: { _id: student1Id },
          body: {
            teacherId: teacherUserId.toString(),
            subjectName: 'ریاضی',
            topic: 'حد و پیوستگی',
            date: satDate,
            startTime: '17:00',
            durationMinutes: 60,
          },
        } as any,
        resBook1
      ),
      StudentOnlineClassController.createBooking(
        {
          user: { _id: student2Id },
          body: {
            teacherId: teacherUserId.toString(),
            subjectName: 'ریاضی',
            topic: 'مشتق',
            date: satDate,
            startTime: '17:00',
            durationMinutes: 60,
          },
        } as any,
        resBook2
      ),
    ])
    const statuses = [resBook1.statusCode, resBook2.statusCode].sort()
    assert.deepEqual(statuses, [200, 409], 'Concurrent bookings for identical slot must yield one 200 and one 409')

    // Teacher accepts the winning booking
    const bookedDoc = storedBookings[0]
    const acceptRes = mockRes()
    await TeacherOnlineClassController.acceptRequest(
      { user: { _id: teacherUserId }, params: { id: bookedDoc._id.toString() } } as any,
      acceptRes
    )
    assert.equal(acceptRes.statusCode, 200)
    assert.equal(bookedDoc.status, 'confirmed')

    // Test 5: Teacher with confirmed booking at 17:00-18:00 MUST NOT appear for overlapping 16:30-17:30!
    const rOverlap = mockRes()
    await StudentOnlineClassController.getAvailableTeachers(
      { body: { date: satDate, startTime: '16:30', durationMinutes: 60, subjectName: 'ریاضی' } } as any,
      rOverlap
    )
    assert.equal(rOverlap.body.data.length, 0, 'Overlapping confirmed booking must exclude teacher from search')

    // Test 10: Teacher updates weeklySchedule (closes Saturday!) -> existing confirmed booking stays intact!
    const updSchedRes = mockRes()
    await TeacherOnlineClassController.updateSettings(
      {
        user: { _id: teacherUserId },
        body: {
          weeklySchedule: { ...weeklySchedule, saturday: [] },
        },
      } as any,
      updSchedRes
    )
    assert.equal(updSchedRes.statusCode, 200)
    assert.equal(bookedDoc.status, 'confirmed', 'Changing weeklySchedule must NOT cancel previously confirmed bookings')

    // Test 7, 8 & 9: Teacher creates virtual classroom and invites student -> unified student list & access enforcement
    const createVirtualRes = mockRes()
    await TeacherCenterController.createVirtualClassroom(
      {
        user: { _id: teacherUserId },
        body: {
          name: 'کلاس جمع‌بندی جبر',
          subject: 'ریاضی',
          maxStudents: 5,
          invitedStudents: [{ phoneNumber: '09123333333', fullName: 'امیر حسینی' }],
        },
      } as any,
      createVirtualRes
    )
    assert.equal(createVirtualRes.statusCode, 200)
    assert.equal(createVirtualRes.body.data.source, 'teacher_invitation')
    const virtualClassId = createVirtualRes.body.data._id.toString()

    // Teacher sees BOTH student booking AND teacher-created virtual class in class-requests
    const teacherClassesRes = mockRes()
    await TeacherOnlineClassController.getClassRequests(
      { user: { _id: teacherUserId }, query: { tab: 'upcoming' } } as any,
      teacherClassesRes
    )
    assert.equal(teacherClassesRes.body.data.length, 2, 'Teacher must see both student booking and virtual class')

    // Invited student sees virtual class in unified my-bookings with pending_invite status and canJoinLive = false
    const invitedListBefore = mockRes()
    await StudentOnlineClassController.getMyBookings(
      { user: { _id: invitedStudentId, phoneNumber: '09123333333' } } as any,
      invitedListBefore
    )
    assert.equal(invitedListBefore.body.data.length, 1)
    assert.equal(invitedListBefore.body.data[0].myRole, 'invited')
    assert.equal(invitedListBefore.body.data[0].myMembershipStatus, 'pending_invite')
    assert.equal(invitedListBefore.body.data[0].canJoinLive, false, 'Pending invite must not allow live join yet')

    // SessionSourceAdapter blocks pending invite and uninvited stranger
    const vSource = await SessionSourceAdapter.resolveSource(virtualClassId)
    assert.ok(vSource)
    assert.equal(await vSource.canAccess(invitedStudentId.toString(), 'student'), false, 'Pending invite blocked by backend')
    assert.equal(await vSource.canAccess(student2Id.toString(), 'student'), false, 'Uninvited student blocked by backend')

    // Invited student accepts invite -> canJoinLive = true & SessionSourceAdapter grants access
    const respondRes = mockRes()
    await StudentOnlineClassController.respondToInvite(
      {
        user: { _id: invitedStudentId, phoneNumber: '09123333333', fullName: 'امیر حسینی' },
        params: { id: virtualClassId },
        body: { action: 'accept' },
      } as any,
      respondRes
    )
    assert.equal(respondRes.statusCode, 200)
    assert.equal(await vSource.canAccess(invitedStudentId.toString(), 'student'), true, 'Accepted invited student allowed live join')

    // Original requesting student sees their booking in same unified list with myRole = requester & canJoinLive = true
    const winnerId = resBook1.statusCode === 200 ? student1Id : student2Id
    const requesterList = mockRes()
    await StudentOnlineClassController.getMyBookings(
      { user: { _id: winnerId } } as any,
      requesterList
    )
    assert.equal(requesterList.body.data.length, 1)
    assert.equal(requesterList.body.data[0].myRole, 'requester')
    assert.equal(requesterList.body.data[0].source, 'booking')
    assert.equal(requesterList.body.data[0].canJoinLive, true)

    // Test 11: Completed/Cancelled booking cannot be joined live
    bookedDoc.status = 'completed'
    const completedSource = await SessionSourceAdapter.resolveSource(bookedDoc._id.toString())
    assert.ok(completedSource)
    assert.equal(completedSource.isJoinableStatus(), false, 'Completed class must not be joinable live')
    assert.equal(await completedSource.canAccess(winnerId.toString(), 'student'), false)

    console.log('✅ All 11 Online Class Scheduling, Concurrency Lock & Unified Membership scenarios passed!')
    process.exit(0)
  } finally {
    // Restore Mongoose statics
    ;(TeacherProfile as any).find = origTeacherFind
    ;(TeacherProfile as any).findOne = origTeacherFindOne
    ;(TeacherProfile as any).findById = origTeacherFindById
    ;(TeacherProfile as any).findOneAndUpdate = origTeacherFindOneAndUpdate
    ;(OnlineClassBooking as any).find = origBookingFind
    ;(OnlineClassBooking as any).findOne = origBookingFindOne
    ;(OnlineClassBooking as any).findById = origBookingFindById
    ;(OnlineClassBooking as any).create = origBookingCreate
    ;(OnlineClassMembership as any).find = origMemFind
    ;(OnlineClassMembership as any).findOne = origMemFindOne
    ;(OnlineClassMembership as any).create = origMemCreate
    ;(OnlineClassMembership as any).updateOne = origMemUpdateOne
    ;(OnlineClassMembership as any).updateMany = origMemUpdateMany
    ;(User as any).find = origUserFind
    ;(User as any).findOne = origUserFindOne
    ;(User as any).findById = origUserFindById
    ;(WalletService as any).getOrCreateWallet = origWalletGet
    ;(WalletService as any).debit = origWalletDebit
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})

import assert from 'node:assert/strict'
import http from 'node:http'
import jwt from 'jsonwebtoken'
import mongoose, { Types } from 'mongoose'
import WebSocket from 'ws'
import { NativeSignalingServer } from '../../modules/classroom/native/ws/NativeSignalingServer.js'
import { RoomManager } from '../../modules/classroom/native/services/RoomManager.js'
import { ClassroomSession } from '../../modules/classroom/models/ClassroomSession.js'
import { SessionSourceAdapter } from '../../modules/classroom/adapters/SessionSourceAdapter.js'
import { OnlineClassBooking } from '../../core/models/OnlineClassBooking.js'
import { ClassroomPricing } from '../../core/models/ClassroomPricing.js'
import { User } from '../../core/models/User.js'
import { PlugNmeetController } from '../../modules/classroom/plugnmeet/PlugNmeetController.js'

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret'

interface WsTestClient {
  ws: WebSocket
  messages: any[]
  closed: Promise<{ code: number; reason: string }>
  waitFor: (predicate: (msg: any) => boolean, timeoutMs?: number) => Promise<any>
}

function connectWs(url: string): Promise<WsTestClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const messages: any[] = []
    const waiters: Array<{ predicate: (m: any) => boolean; resolve: (m: any) => void }> = []

    const closed = new Promise<{ code: number; reason: string }>((resClose) => {
      ws.on('close', (code, reasonBuf) => {
        resClose({ code, reason: reasonBuf.toString() })
      })
    })

    ws.on('message', (raw) => {
      const parsed = JSON.parse(raw.toString())
      messages.push(parsed)
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].predicate(parsed)) {
          const w = waiters.splice(i, 1)[0]
          w.resolve(parsed)
        }
      }
    })

    const waitFor = (predicate: (msg: any) => boolean, timeoutMs = 4000) => {
      const existing = messages.find(predicate)
      if (existing) return Promise.resolve(existing)
      return new Promise<any>((resWait, rejWait) => {
        const timer = setTimeout(() => {
          rejWait(new Error(`Timeout waiting for WS message. Received: ${JSON.stringify(messages)}`))
        }, timeoutMs)
        waiters.push({
          predicate,
          resolve: (m) => {
            clearTimeout(timer)
            resWait(m)
          },
        })
      })
    }

    ws.once('open', () => resolve({ ws, messages, closed, waitFor }))
    ws.once('error', reject)
  })
}

function mockRes() {
  const state: { statusCode: number; body: any } = { statusCode: 200, body: null }
  const res: any = {
    status(code: number) {
      state.statusCode = code
      return res
    },
    json(payload: any) {
      state.body = payload
      return res
    },
  }
  return { res, state }
}

async function runTests() {
  const teacher1Id = new Types.ObjectId()
  const teacher2Id = new Types.ObjectId()
  const student1Id = new Types.ObjectId()
  const student2Id = new Types.ObjectId()
  const intruderId = new Types.ObjectId()
  const bookingId = new Types.ObjectId()
  const sessionId = new Types.ObjectId()
  const roomId = `kitayar-class-ocb${Date.now().toString(36)}`

  const teacherTicketCode = 'inv-tch-unit-001'
  const student1TicketCode = 'inv-std-unit-001'
  const student2TicketCode = 'inv-std-unit-002'
  const adHocSeminarRoom = `seminar-unit-${Date.now().toString(36)}`

  const inMemorySessions: any[] = [
    {
      _id: sessionId,
      bookingId,
      bookingCode: 'OCB-TEST-1',
      sourceType: 'online_class_booking',
      provider: 'internal',
      uiMode: 'online_class',
      roomName: roomId,
      plugNmeetRoomId: roomId,
      teacherId: teacher1Id,
      studentId: student1Id,
      invitedStudentIds: [student2Id],
      title: 'کلاس تست ریاضی',
      topic: 'انتگرال',
      teacherName: 'استاد تستی',
      status: 'waiting',
      maxParticipants: 10,
      inviteTickets: [
        { ticketCode: teacherTicketCode, role: 'teacher', name: 'استاد تستی', userId: teacher1Id, isUsed: false, createdAt: new Date() },
        { ticketCode: student1TicketCode, role: 'student', name: 'سارا دانش‌آموز', userId: student1Id, isUsed: false, createdAt: new Date() },
        { ticketCode: student2TicketCode, role: 'student', name: 'علی دانش‌آموز', userId: student2Id, isUsed: false, createdAt: new Date() },
      ],
      async save() {
        return this
      },
    },
    {
      _id: new Types.ObjectId(),
      sourceType: 'ad_hoc',
      provider: 'internal',
      uiMode: 'seminar',
      roomName: adHocSeminarRoom,
      plugNmeetRoomId: adHocSeminarRoom,
      title: 'سمینار عمومی تست',
      status: 'active',
      maxParticipants: 50,
      inviteTickets: [],
      async save() {
        return this
      },
    },
  ]

  const usersById = new Map<string, any>([
    [teacher1Id.toString(), { _id: teacher1Id, role: 'teacher', fullName: 'استاد تستی' }],
    [teacher2Id.toString(), { _id: teacher2Id, role: 'teacher', fullName: 'استاد دوم' }],
    [student1Id.toString(), { _id: student1Id, role: 'student', fullName: 'سارا دانش‌آموز' }],
    [student2Id.toString(), { _id: student2Id, role: 'student', fullName: 'علی دانش‌آموز' }],
    [intruderId.toString(), { _id: intruderId, role: 'student', fullName: 'کاربر غیرمجاز' }],
  ])

  let markInProgressCalls = 0
  const freshBookingRoom = `kitayar-class-linkonly-${Date.now().toString(36)}`
  const freshBookingId = new Types.ObjectId()

  // Patch Mongoose connection readyState + model static methods cleanly for offline unit test
  const origReadyDesc = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState')
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true })

  const origSessionFindOne = ClassroomSession.findOne
  const origSessionFindById = ClassroomSession.findById
  const origSessionCreate = ClassroomSession.create
  const origUserFindById = User.findById
  const origBookingFindById = OnlineClassBooking.findById
  const origResolveSource = SessionSourceAdapter.resolveSource
  const origPricingFindOne = ClassroomPricing.findOne
  const origSessionUpdateOne = ClassroomSession.updateOne

  ;(ClassroomPricing as any).findOne = () => ({
    lean: async () => null,
    then: (res: any, rej: any) => Promise.resolve(null).then(res, rej),
  })
  ;(ClassroomSession as any).updateOne = async () => ({})

  const matchSession = (query: any): any => {
    if (!query) return null
    const clauses = query.$or || [query]
    for (const s of inMemorySessions) {
      for (const c of clauses) {
        if (c._id && s._id.toString() === c._id.toString()) return s
        if (c.bookingId && s.bookingId?.toString() === c.bookingId.toString()) return s
        if (c.roomName && s.roomName === c.roomName && (!c['inviteTickets.ticketCode'] || s.inviteTickets.some((t: any) => t.ticketCode === c['inviteTickets.ticketCode']))) {
          return s
        }
        if (c.plugNmeetRoomId && s.plugNmeetRoomId === c.plugNmeetRoomId) return s
        if (c.bookingCode && s.bookingCode === c.bookingCode) return s
        if (c['inviteTickets.ticketCode'] && s.inviteTickets.some((t: any) => t.ticketCode === c['inviteTickets.ticketCode'])) return s
      }
    }
    return null
  }

  ;(ClassroomSession as any).findOne = (query: any) => {
    const doc = matchSession(query)
    return {
      lean: async () => doc,
      then: (res: any, rej: any) => Promise.resolve(doc).then(res, rej),
    }
  }
  ;(ClassroomSession as any).findById = (id: any) => {
    const doc = inMemorySessions.find((s) => s._id.toString() === String(id)) || null
    return {
      lean: async () => doc,
      then: (res: any, rej: any) => Promise.resolve(doc).then(res, rej),
    }
  }
  ;(ClassroomSession as any).create = async (payload: any) => {
    const doc = {
      ...payload,
      _id: new Types.ObjectId(),
      inviteTickets: payload.inviteTickets || [],
      async save() {
        return this
      },
    }
    inMemorySessions.push(doc)
    return doc
  }
  ;(User as any).findById = (id: any) => {
    const u = usersById.get(String(id)) || null
    return {
      lean: async () => u,
      then: (res: any, rej: any) => Promise.resolve(u).then(res, rej),
    }
  }
  ;(OnlineClassBooking as any).findById = (id: any) => {
    const data: any =
      String(id) === freshBookingId.toString()
        ? {
            bookingCode: 'OCB-FRESH',
            meeting: { roomName: freshBookingRoom },
            capacity: 3,
            scheduledAt: new Date(Date.now() + 60000),
            durationMinutes: 60,
            save: async function () {
              return this
            },
          }
        : null
    return {
      select: () => ({
        lean: async () => data,
        then: (res: any, rej: any) => Promise.resolve(data).then(res, rej),
      }),
      lean: async () => data,
      then: (res: any, rej: any) => Promise.resolve(data).then(res, rej),
    }
  }
  ;(SessionSourceAdapter as any).resolveSource = async (id: string) => {
    if (String(id) === freshBookingId.toString()) {
      return {
        sourceId: freshBookingId.toString(),
        sourceType: 'online_class_booking',
        teacherId: teacher1Id.toString(),
        studentId: student1Id.toString(),
        invitedStudentIds: [student2Id.toString()],
        title: 'کلاس شیمی',
        topic: 'اسید و باز',
        durationMinutes: 60,
        status: 'confirmed',
        isJoinableStatus: () => true,
        canAccess: async (uid: string, role: string) =>
          role === 'admin' ||
          uid === teacher1Id.toString() ||
          uid === student1Id.toString() ||
          uid === student2Id.toString(),
        markInProgress: async () => {
          markInProgressCalls += 1
        },
        markCompleted: async () => {},
      }
    }
    if (String(id) === bookingId.toString()) {
      return {
        sourceId: bookingId.toString(),
        sourceType: 'online_class_booking',
        teacherId: teacher1Id.toString(),
        studentId: student1Id.toString(),
        invitedStudentIds: [student2Id.toString()],
        title: 'کلاس تست ریاضی',
        durationMinutes: 60,
        status: 'confirmed',
        isJoinableStatus: () => true,
        canAccess: async (uid: string, role: string) =>
          role === 'admin' ||
          uid === teacher1Id.toString() ||
          uid === student1Id.toString() ||
          uid === student2Id.toString(),
        markInProgress: async () => {
          markInProgressCalls += 1
        },
        markCompleted: async () => {},
      }
    }
    return null
  }

  const server = http.createServer()
  NativeSignalingServer.init(server)
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', () => res()))
  const port = (server.address() as any).port
  const wsBase = `ws://127.0.0.1:${port}/api/classroom/native/ws`

  const openClients: WsTestClient[] = []
  try {
    // -----------------------------------------------------------------------
    // TEST 1: Same student enters App (JWT), then Web (personal ticket) -> App kicked
    // -----------------------------------------------------------------------
    const student1Token = jwt.sign({ userId: student1Id.toString(), role: 'student' }, JWT_SECRET)
    const s1App = await connectWs(wsBase)
    openClients.push(s1App)
    s1App.ws.send(JSON.stringify({ type: 'join_room', roomId, token: student1Token }))
    const s1AppJoined = await s1App.waitFor((m) => m.type === 'room_joined')
    assert.equal(s1AppJoined.payload.self.role, 'student')
    assert.equal(RoomManager.getActiveParticipantsList(roomId).length, 1)

    const s1Web = await connectWs(wsBase)
    openClients.push(s1Web)
    s1Web.ws.send(JSON.stringify({ type: 'join_room', roomId, ticketCode: student1TicketCode }))

    const [removedMsg, closedInfo, s1WebJoined] = await Promise.all([
      s1App.waitFor((m) => m.type === 'participant_removed'),
      s1App.closed,
      s1Web.waitFor((m) => m.type === 'room_joined'),
    ])
    assert.equal(removedMsg.payload.code, 'DUPLICATE_DEVICE')
    assert.equal(closedInfo.code, 4001)
    assert.equal(s1WebJoined.payload.self.role, 'student')
    assert.equal(RoomManager.getActiveParticipantsList(roomId).length, 1)
    console.log('✅ Test 1 passed: App JWT kicked when Student opened personal Web ticket')

    // -----------------------------------------------------------------------
    // TEST 2: Student shares link with Device 2 & Device 3 -> Last device wins
    // -----------------------------------------------------------------------
    const s1Dev2 = await connectWs(wsBase)
    openClients.push(s1Dev2)
    s1Dev2.ws.send(JSON.stringify({ type: 'join_room', roomId, ticketCode: student1TicketCode }))
    const [kickedWeb, closedWeb] = await Promise.all([
      s1Web.waitFor((m) => m.type === 'participant_removed'),
      s1Web.closed,
      s1Dev2.waitFor((m) => m.type === 'room_joined'),
    ])
    assert.equal(kickedWeb.payload.code, 'DUPLICATE_DEVICE')
    assert.equal(closedWeb.code, 4001)

    const s1Dev3 = await connectWs(wsBase)
    openClients.push(s1Dev3)
    s1Dev3.ws.send(JSON.stringify({ type: 'join_room', roomId, ticketCode: student1TicketCode }))
    const [kickedDev2, closedDev2] = await Promise.all([
      s1Dev2.waitFor((m) => m.type === 'participant_removed'),
      s1Dev2.closed,
      s1Dev3.waitFor((m) => m.type === 'room_joined'),
    ])
    assert.equal(kickedDev2.payload.code, 'DUPLICATE_DEVICE')
    assert.equal(closedDev2.code, 4001)
    assert.equal(RoomManager.getActiveParticipantsList(roomId).length, 1)
    console.log('✅ Test 2 passed: Sequential link sharing kicks older devices')

    // -----------------------------------------------------------------------
    // TEST 3: Same teacher switches App -> Web; distinct 2nd teacher blocked
    // -----------------------------------------------------------------------
    const teacher1Token = jwt.sign({ userId: teacher1Id.toString(), role: 'teacher' }, JWT_SECRET)
    const t1App = await connectWs(wsBase)
    openClients.push(t1App)
    t1App.ws.send(JSON.stringify({ type: 'join_room', roomId, token: teacher1Token }))
    await t1App.waitFor((m) => m.type === 'room_joined')

    const t1Web = await connectWs(wsBase)
    openClients.push(t1Web)
    t1Web.ws.send(JSON.stringify({ type: 'join_room', roomId, ticketCode: teacherTicketCode }))
    const [t1Removed, t1Closed, t1WebJoined] = await Promise.all([
      t1App.waitFor((m) => m.type === 'participant_removed'),
      t1App.closed,
      t1Web.waitFor((m) => m.type === 'room_joined'),
    ])
    assert.equal(t1Removed.payload.code, 'DUPLICATE_DEVICE')
    assert.equal(t1Closed.code, 4001)
    assert.equal(t1WebJoined.payload.self.role, 'teacher')

    // Another teacher account tries to join -> TEACHER_ALREADY_PRESENT
    const teacher2Token = jwt.sign({ userId: teacher2Id.toString(), role: 'teacher' }, JWT_SECRET)
    const t2Client = await connectWs(wsBase)
    openClients.push(t2Client)
    t2Client.ws.send(JSON.stringify({ type: 'join_room', roomId, token: teacher2Token }))
    const t2Err = await t2Client.waitFor((m) => m.type === 'error')
    assert.equal(t2Err.payload.code, 'UNAUTHORIZED') // not this booking's teacher!

    // Also test a guest/admin with teacher ticket conflict check on non-booking room
    console.log('✅ Test 3 passed: Same teacher switches device smoothly; unauthorized teacher blocked')

    // -----------------------------------------------------------------------
    // TEST 4: Distinct Student 2 joins -> Student 1 Device 3 stays connected
    // -----------------------------------------------------------------------
    const s2Web = await connectWs(wsBase)
    openClients.push(s2Web)
    s2Web.ws.send(JSON.stringify({ type: 'join_room', roomId, ticketCode: student2TicketCode }))
    await s2Web.waitFor((m) => m.type === 'room_joined')
    assert.equal(RoomManager.getActiveParticipantsList(roomId).length, 3)
    assert.equal(s1Dev3.messages.some((m) => m.type === 'participant_removed'), false)
    console.log('✅ Test 4 passed: Distinct participants coexist without kicking each other')

    // -----------------------------------------------------------------------
    // TEST 5: Public seminar guests coexist without kicking each other
    // -----------------------------------------------------------------------
    const g1 = await connectWs(wsBase)
    const g2 = await connectWs(wsBase)
    openClients.push(g1, g2)
    g1.ws.send(JSON.stringify({ type: 'join_room', roomId: adHocSeminarRoom, displayName: 'مهمان ۱', requestedRole: 'student' }))
    await g1.waitFor((m) => m.type === 'room_joined')
    g2.ws.send(JSON.stringify({ type: 'join_room', roomId: adHocSeminarRoom, displayName: 'مهمان ۲', requestedRole: 'student' }))
    await g2.waitFor((m) => m.type === 'room_joined')
    assert.equal(RoomManager.getActiveParticipantsList(adHocSeminarRoom).length, 2)
    console.log('✅ Test 5 passed: Seminar guests coexist')

    // -----------------------------------------------------------------------
    // TEST 6: Forged ticket & unauthorized guest rejected on booking room
    // -----------------------------------------------------------------------
    const badTkt = await connectWs(wsBase)
    openClients.push(badTkt)
    badTkt.ws.send(JSON.stringify({ type: 'join_room', roomId, ticketCode: 'inv-std-forged-999' }))
    const badTktErr = await badTkt.waitFor((m) => m.type === 'error')
    assert.equal(badTktErr.payload.code, 'INVALID_TICKET')

    const noAuth = await connectWs(wsBase)
    openClients.push(noAuth)
    noAuth.ws.send(JSON.stringify({ type: 'join_room', roomId }))
    const noAuthErr = await noAuth.waitFor((m) => m.type === 'error')
    assert.equal(noAuthErr.payload.code, 'UNAUTHORIZED')
    console.log('✅ Test 6 passed: Invalid ticket & unauthenticated booking entry rejected')

    // -----------------------------------------------------------------------
    // TEST 7: PlugNmeetController.getJoinToken linkOnly + idempotent personal ticket + authz
    // -----------------------------------------------------------------------
    // 7a: Intruder 403
    const rIntruder = mockRes()
    await PlugNmeetController.getJoinToken(
      {
        params: { sessionId: freshBookingId.toString() },
        body: { linkOnly: true },
        query: {},
        user: { _id: intruderId, role: 'student', fullName: 'کاربر غیرمجاز' },
      } as any,
      rIntruder.res
    )
    if (rIntruder.state.statusCode !== 403) {
      console.log('DEBUG 7a intruder status:', rIntruder.state)
    }
    assert.equal(rIntruder.state.statusCode, 403)

    // 7b: Student linkOnly -> issues personal ticket without markInProgress
    const rStudent1Link = mockRes()
    await PlugNmeetController.getJoinToken(
      {
        params: { sessionId: freshBookingId.toString() },
        body: { linkOnly: true, clientPlatform: 'android' },
        query: {},
        user: { _id: student1Id, role: 'student', fullName: 'سارا دانش‌آموز' },
      } as any,
      rStudent1Link.res
    )
    if (rStudent1Link.state.statusCode !== 200) {
      console.log('DEBUG 7b error:', rStudent1Link.state)
    }
    assert.equal(rStudent1Link.state.statusCode, 200)
    const firstTicket = rStudent1Link.state.body.data.ticketCode
    assert.ok(firstTicket?.startsWith('inv-std-'))
    assert.ok(rStudent1Link.state.body.data.webJoinUrl.includes(`/classroom/native/${freshBookingRoom}?ticket=${firstTicket}`))
    assert.equal(markInProgressCalls, 0)

    // Idempotent second call for same student -> exact same ticketCode
    const rStudent1LinkAgain = mockRes()
    await PlugNmeetController.getJoinToken(
      {
        params: { sessionId: freshBookingId.toString() },
        body: { linkOnly: true, clientPlatform: 'ios' },
        query: {},
        user: { _id: student1Id, role: 'student', fullName: 'سارا دانش‌آموز' },
      } as any,
      rStudent1LinkAgain.res
    )
    assert.equal(rStudent1LinkAgain.state.body.data.ticketCode, firstTicket)
    assert.equal(markInProgressCalls, 0)

    // 7c: Teacher full join (linkOnly false) -> inv-tch ticket + markInProgress called
    const rTeacherJoin = mockRes()
    await PlugNmeetController.getJoinToken(
      {
        params: { sessionId: freshBookingId.toString() },
        body: { clientPlatform: 'android' },
        query: {},
        user: { _id: teacher1Id, role: 'teacher', fullName: 'استاد تستی' },
      } as any,
      rTeacherJoin.res
    )
    assert.equal(rTeacherJoin.state.statusCode, 200)
    assert.ok(rTeacherJoin.state.body.data.ticketCode.startsWith('inv-tch-'))
    assert.equal(rTeacherJoin.state.body.data.roomId, freshBookingRoom)
    assert.equal(markInProgressCalls, 1)
    console.log('✅ Test 7 passed: Booking token authorization, linkOnly, and idempotent personal web tickets')

    console.log('\n🎉 ALL 7 SINGLE-DEVICE & WEB-LINK TESTS PASSED!')
  } finally {
    for (const c of openClients) {
      try {
        c.ws.close()
      } catch {}
    }
    server.close()
    if (origReadyDesc) Object.defineProperty(mongoose.connection, 'readyState', origReadyDesc)
    ClassroomSession.findOne = origSessionFindOne
    ClassroomSession.findById = origSessionFindById
    ClassroomSession.create = origSessionCreate
    User.findById = origUserFindById
    OnlineClassBooking.findById = origBookingFindById
    SessionSourceAdapter.resolveSource = origResolveSource
    ClassroomPricing.findOne = origPricingFindOne
    ClassroomSession.updateOne = origSessionUpdateOne
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test failed:', err)
    process.exit(1)
  })

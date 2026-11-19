import assert from 'node:assert/strict'
import { RoomManager } from '../../modules/classroom/native/services/RoomManager.js'
import { ServerTelemetrySampler } from '../../modules/classroom/native/services/ServerTelemetrySampler.js'
import { NativeClassroomController } from '../../modules/classroom/native/native.controller.js'

function createMockRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: any) {
      this.body = payload
      return this
    },
  }
  return res
}

async function runTests() {
  console.log('🧪 Running Seminar System, Dynamic Form, Attendance & Developer Telemetry Tests...')

  // 1. Setup a Seminar room
  const seminarRoomId = `seminar-test-${Date.now()}`
  const seminarRoom = await RoomManager.getOrCreateRoom(seminarRoomId, 'سمینار معماری مقیاس‌پذیر', 'host_1', 200)
  seminarRoom.uiMode = 'seminar'

  // Setup an Online Class room for comparison
  const classRoomId = `class-test-${Date.now()}`
  const classRoom = await RoomManager.getOrCreateRoom(classRoomId, 'کلاس ریاضی تعاملی', 'teacher_1', 15)
  classRoom.uiMode = 'online_class'

  // 2. Test Pre-Entry Dynamic Form Validation & Deduplicated Registration via Controller
  const origFindSession = (NativeClassroomController as any).findSessionByKey
  const fakeSessionDoc: any = {
    roomName: seminarRoomId,
    title: 'سمینار معماری مقیاس‌پذیر',
    uiMode: 'seminar',
    status: 'active',
    registrationForm: {
      enabled: true,
      title: 'فرم ورود سمینار',
      fields: [
        { id: 'fullName', label: 'نام و نام خانوادگی', type: 'text', required: true },
        { id: 'phone', label: 'شماره موبایل', type: 'phone', required: true },
        { id: 'grade', label: 'مقطع', type: 'select', required: false, options: ['کارشناسی', 'ارشد'] },
      ],
    },
    attendees: [],
    markModified() {},
    async save() {
      return this
    },
    toObject() {
      return this
    },
  }

  try {
    // Patch session lookup temporarily for unit-level controller assertion without Mongo daemon
    ;(NativeClassroomController as any).findSessionByKey = async () => fakeSessionDoc

    // Missing required field ('phone') should return 400
    const badReq: any = {
      params: { roomId: seminarRoomId },
      body: {
        displayName: 'علی رضایی',
        formAnswers: { fullName: 'علی رضایی', grade: 'ارشد' },
      },
    }
    const badRes = createMockRes()
    await NativeClassroomController.registerAttendee(badReq, badRes)
    assert.equal(badRes.statusCode, 400, 'Missing required dynamic field must return HTTP 400')
    assert.equal(badRes.body.fieldId, 'phone', 'Error must point to the missing required field id')

    // Valid registration submission
    const goodReq: any = {
      params: { roomId: seminarRoomId },
      body: {
        displayName: 'علی رضایی',
        formAnswers: { fullName: 'علی رضایی', phone: '0912 345 6789', grade: 'ارشد' },
      },
    }
    const goodRes1 = createMockRes()
    await NativeClassroomController.registerAttendee(goodReq, goodRes1)
    assert.equal(goodRes1.statusCode, 200, 'Valid registration must succeed')
    const attendeeKey1 = goodRes1.body.data.attendeeKey
    assert.equal(attendeeKey1, 'phone:09123456789', 'Phone field should produce normalized deterministic attendeeKey')

    // Submitting again with same phone must update the existing record rather than duplicating it
    const goodRes2 = createMockRes()
    await NativeClassroomController.registerAttendee(goodReq, goodRes2)
    assert.equal(goodRes2.body.data.attendeeKey, attendeeKey1)
    assert.equal(fakeSessionDoc.attendees.length, 1, 'Duplicate submission with same phone must not duplicate attendee row')

    // 3. Multi-Join / Leave Cumulative Attendance Aggregation
    const t0 = Date.now() - 12_000
    const t1 = Date.now() - 4_000

    // Host joins seminar
    RoomManager.addParticipant(seminarRoomId, {
      peerId: 'host_peer_1',
      userId: 'host_1',
      name: 'مجری اصلی',
      role: 'teacher',
      micState: 'enabled',
      isSpeaker: true,
      connectionState: 'connected',
      joinedAt: t0,
      isTeacher: true,
    })

    // Attendee joins first time (peer A)
    RoomManager.addParticipant(
      seminarRoomId,
      {
        peerId: 'att_peer_1',
        attendeeKey: attendeeKey1,
        name: 'علی رضایی',
        role: 'student',
        micState: 'blocked',
        handRaised: false,
        isSpeaker: false,
        connectionState: 'connected',
        joinedAt: t0,
        isTeacher: false,
      },
      goodReq.body.formAnswers
    )
    // Leaves first time -> duration ~12s
    RoomManager.removeParticipant(seminarRoomId, 'att_peer_1')

    // Rejoins second time (peer B)
    RoomManager.addParticipant(seminarRoomId, {
      peerId: 'att_peer_2',
      attendeeKey: attendeeKey1,
      name: 'علی رضایی',
      role: 'student',
      micState: 'blocked',
      handRaised: false,
      isSpeaker: false,
      connectionState: 'connected',
      joinedAt: t1,
      isTeacher: false,
    })

    // Raise hand & promote to speaker -> unblocks mic; revoke -> re-blocks in seminar mode
    assert.equal(RoomManager.setParticipantHandRaised(seminarRoomId, 'att_peer_2', true), true)
    assert.equal(seminarRoom.participants.get('att_peer_2')?.handRaised, true)
    const promoted = RoomManager.setParticipantSpeaker(seminarRoomId, 'att_peer_2', true)
    assert.equal(promoted?.isSpeaker, true)
    assert.equal(promoted?.micState, 'disabled', 'Granting speaker must unblock mic')
    const revoked = RoomManager.setParticipantSpeaker(seminarRoomId, 'att_peer_2', false)
    assert.equal(revoked?.isSpeaker, false)
    assert.equal(revoked?.micState, 'blocked', 'Revoking speaker in seminar mode must re-block mic')

    // Co-Manager Promotion & Demotion
    const promotedMgr = RoomManager.setParticipantModerator(seminarRoomId, 'att_peer_2', true)
    assert.equal(promotedMgr?.isModerator, true, 'Participant promoted to moderator must have isModerator === true')
    assert.equal(promotedMgr?.isSpeaker, true, 'Promoted moderator must have speaker privileges')
    assert.equal(promotedMgr?.micState, 'disabled', 'Promoted moderator mic must be unblocked')
    const demotedMgr = RoomManager.setParticipantModerator(seminarRoomId, 'att_peer_2', false)
    assert.equal(demotedMgr?.isModerator, false)
    assert.equal(demotedMgr?.micState, 'blocked', 'Demoted moderator in seminar must re-block mic')

    // Live Seminar Polls: Create, Vote, Deduplicate, Close
    const poll = RoomManager.createPoll(
      seminarRoomId,
      { peerId: 'host_peer_1', name: 'مدیر اصلی' },
      { question: 'آیا کیفیت سمینار مطلوب است؟', options: ['بله عالی', 'متوسط'], allowMultiple: false }
    )
    assert.ok(poll, 'Valid poll must be created')
    assert.equal(RoomManager.votePoll(seminarRoomId, poll!.id, attendeeKey1, ['opt_1']), true)
    // Changing vote under same voter key must overwrite instead of double counting
    assert.equal(RoomManager.votePoll(seminarRoomId, poll!.id, attendeeKey1, ['opt_2']), true)
    const serialized = RoomManager.serializePolls(seminarRoom.polls, attendeeKey1)
    assert.equal(serialized[0].totalVoters, 1, 'Same voter re-voting must remain 1 total voter')
    assert.equal(serialized[0].options[0].votes, 0)
    assert.equal(serialized[0].options[1].votes, 1)
    assert.deepEqual(serialized[0].myOptionIds, ['opt_2'])
    assert.equal(RoomManager.closePoll(seminarRoomId, poll!.id), true)
    assert.equal(RoomManager.votePoll(seminarRoomId, poll!.id, 'other_voter', ['opt_1']), false, 'Closed poll must reject new votes')

    // Leaves second time -> adds ~4s more
    RoomManager.removeParticipant(seminarRoomId, 'att_peer_2')

    const snapshot = RoomManager.getAttendanceSnapshot(seminarRoomId, [])
    const aliRecord = snapshot.find(a => a.attendeeKey === attendeeKey1)
    assert.ok(aliRecord, 'Attendee record must exist in snapshot')
    assert.equal(aliRecord.joinCount, 2, 'Two joins with same attendeeKey must merge with joinCount === 2')
    assert.equal(aliRecord.sessions.length, 2, 'Should record both entry/exit intervals')
    assert.equal(aliRecord.isOnline, false, 'Attendee left both peers so must be offline')
    assert.ok(aliRecord.totalDurationSeconds >= 15, `Cumulative duration should be >= 15s, got ${aliRecord.totalDurationSeconds}`)
    assert.equal(aliRecord.formAnswers?.grade, 'ارشد', 'Form answers must remain attached to merged record')

    // 4. Server Telemetry & Capacity Report Comparison (Seminar O(S*N) vs Class O(N^2))
    ServerTelemetrySampler.recordRoomWs(seminarRoomId, 'in', 25)
    ServerTelemetrySampler.recordRoomWs(seminarRoomId, 'out', 100)

    // Add 5 participants to classRoom & 5 to seminarRoom to verify topology link math
    for (let i = 1; i <= 5; i++) {
      RoomManager.addParticipant(classRoomId, {
        peerId: `cls_p_${i}`,
        name: `دانش‌آموز ${i}`,
        role: i === 1 ? 'teacher' : 'student',
        micState: 'disabled',
        connectionState: 'connected',
        joinedAt: Date.now(),
        isTeacher: i === 1,
      })
      RoomManager.addParticipant(seminarRoomId, {
        peerId: `sem_aud_${i}`,
        name: `مخاطب ${i}`,
        role: 'student',
        micState: 'blocked',
        connectionState: 'connected',
        joinedAt: Date.now(),
        isTeacher: false,
      })
    }

    assert.equal(
      ServerTelemetrySampler.estimateRoomPeerLinks(classRoom),
      10,
      '5-participant interactive class mesh must estimate N*(N-1)/2 = 10 links'
    )
    // seminarRoom currently has host_peer_1 + 5 sem_aud = 6 total, 1 speaker -> 1 * (6 - 1) = 5 links
    assert.equal(
      ServerTelemetrySampler.estimateRoomPeerLinks(seminarRoom),
      5,
      '6-participant seminar with 1 speaker must estimate stage*audience = 5 links'
    )

    const seminarReport = ServerTelemetrySampler.buildDeveloperReport({
      roomId: seminarRoomId,
      liveRoom: seminarRoom,
    })
    assert.equal(seminarReport.uiMode, 'seminar')
    assert.ok(seminarReport.hostHardware.cpuCores >= 1)
    assert.ok(seminarReport.peakMetrics.wsMessagesReceived >= 25)
    assert.ok(seminarReport.capacityEstimation.signalingServerMaxConcurrent >= seminarReport.peakMetrics.currentInRoom)
    assert.ok(seminarReport.markdownReport.includes('# Technical Load & Capacity Telemetry Report'))

    // Cleanup rooms cleanly
    RoomManager.endRoom(seminarRoomId, { name: 'Tester', role: 'system' })
    RoomManager.endRoom(classRoomId, { name: 'Tester', role: 'system' })

    console.log('✅ All seminar, dynamic form, attendance & developer telemetry tests passed!')
  } finally {
    ;(NativeClassroomController as any).findSessionByKey = origFindSession
  }
}

runTests().catch(err => {
  console.error('❌ Seminar system test failed:', err)
  process.exit(1)
})

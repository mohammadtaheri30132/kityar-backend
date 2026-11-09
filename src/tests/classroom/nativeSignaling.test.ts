import assert from 'assert'
import http from 'http'
import { WebSocket } from 'ws'
import jwt from 'jsonwebtoken'
import { NativeSignalingServer } from '../../modules/classroom/native/ws/NativeSignalingServer.js'
import { RoomManager } from '../../modules/classroom/native/services/RoomManager.js'

const PORT = 5599
const JWT_SECRET = 'test-secret-key-123'
process.env.JWT_SECRET = JWT_SECRET

// Generate test JWTs
const teacherToken = jwt.sign(
  { id: 'teacher_123', username: 'teacher_ali', role: 'teacher' },
  JWT_SECRET,
  { expiresIn: '1h' }
)
const studentToken = jwt.sign(
  { id: 'student_456', username: 'student_reza', role: 'student' },
  JWT_SECRET,
  { expiresIn: '1h' }
)

const roomId = 'test-native-room-01'

async function runTests() {
  console.log('🧪 Starting Native WebRTC Signaling Core Tests...')

  const server = http.createServer((req, res) => {
    res.writeHead(200)
    res.end('ok')
  })

  NativeSignalingServer.init(server)

  await new Promise<void>(resolve => server.listen(PORT, resolve))
  console.log(`✅ Test HTTP & WebSocket Server listening on port ${PORT}`)

  try {
    // 1. Connect Teacher socket
    const teacherWs = new WebSocket(`ws://127.0.0.1:${PORT}/api/classroom/native/ws`)
    await new Promise(resolve => teacherWs.on('open', resolve))
    console.log('✅ Teacher WebSocket connected')

    // Helper to await next message
    const getNextMessage = (ws: WebSocket): Promise<any> => {
      return new Promise(resolve => {
        ws.once('message', data => {
          resolve(JSON.parse(data.toString()))
        })
      })
    }

    // 2. Teacher joins room
    teacherWs.send(
      JSON.stringify({
        type: 'join_room',
        roomId,
        token: teacherToken,
        displayName: 'استاد علی',
      })
    )

    const teacherJoinedMsg = await getNextMessage(teacherWs)
    assert.strictEqual(teacherJoinedMsg.type, 'room_joined')
    assert.strictEqual(teacherJoinedMsg.payload.self.role, 'teacher')
    assert.strictEqual(teacherJoinedMsg.payload.self.isTeacher, true)
    const teacherPeerId = teacherJoinedMsg.payload.self.peerId
    assert.ok(teacherPeerId, 'Teacher should receive a valid peerId')
    console.log('✅ Teacher successfully joined room as peer:', teacherPeerId)

    // 3. Connect Student socket
    const studentWs = new WebSocket(`ws://127.0.0.1:${PORT}/api/classroom/native/ws`)
    await new Promise(resolve => studentWs.on('open', resolve))
    console.log('✅ Student WebSocket connected')

    // Set up promise for teacher to receive participant_joined
    const teacherSeesStudentPromise = getNextMessage(teacherWs)

    // Student joins room
    studentWs.send(
      JSON.stringify({
        type: 'join_room',
        roomId,
        token: studentToken,
        displayName: 'رضا دانش‌آموز',
      })
    )

    const studentJoinedMsg = await getNextMessage(studentWs)
    assert.strictEqual(studentJoinedMsg.type, 'room_joined')
    assert.strictEqual(studentJoinedMsg.payload.self.role, 'student')
    assert.strictEqual(studentJoinedMsg.payload.self.isTeacher, false)
    const studentPeerId = studentJoinedMsg.payload.self.peerId
    assert.ok(studentPeerId)

    // Verify student sees teacher in existing participants
    assert.strictEqual(studentJoinedMsg.payload.participants.length, 1)
    assert.strictEqual(studentJoinedMsg.payload.participants[0].peerId, teacherPeerId)
    console.log('✅ Student joined and received teacher in participants list')

    // Verify teacher received participant_joined
    const teacherSeesStudent = await teacherSeesStudentPromise
    assert.strictEqual(teacherSeesStudent.type, 'participant_joined')
    assert.strictEqual(teacherSeesStudent.payload.participant.peerId, studentPeerId)
    console.log('✅ Teacher notified of student join')

    // 4. Test WebRTC Offer / Answer relay
    const dummySdpOffer = { type: 'offer', sdp: 'v=0 dummy offer sdp' }
    const teacherSeesOfferPromise = getNextMessage(teacherWs)

    studentWs.send(
      JSON.stringify({
        type: 'offer',
        roomId,
        targetPeerId: teacherPeerId,
        sdp: dummySdpOffer,
      })
    )

    const relayedOffer = await teacherSeesOfferPromise
    assert.strictEqual(relayedOffer.type, 'offer')
    assert.strictEqual(relayedOffer.fromPeerId, studentPeerId)
    assert.strictEqual(relayedOffer.payload.sdp.sdp, dummySdpOffer.sdp)
    console.log('✅ WebRTC Offer successfully relayed from student to teacher')

    // 5. Test WebRTC Answer relay
    const dummySdpAnswer = { type: 'answer', sdp: 'v=0 dummy answer sdp' }
    const studentSeesAnswerPromise = getNextMessage(studentWs)

    teacherWs.send(
      JSON.stringify({
        type: 'answer',
        roomId,
        targetPeerId: studentPeerId,
        sdp: dummySdpAnswer,
      })
    )

    const relayedAnswer = await studentSeesAnswerPromise
    assert.strictEqual(relayedAnswer.type, 'answer')
    assert.strictEqual(relayedAnswer.fromPeerId, teacherPeerId)
    assert.strictEqual(relayedAnswer.payload.sdp.sdp, dummySdpAnswer.sdp)
    console.log('✅ WebRTC Answer successfully relayed from teacher to student')

    // 6. Test ICE Candidate relay
    const dummyCandidate = { candidate: 'candidate:1 1 UDP 2122260223 192.168.1.1 50000 typ host', sdpMid: '0' }
    const teacherSeesCandidatePromise = getNextMessage(teacherWs)

    studentWs.send(
      JSON.stringify({
        type: 'ice_candidate',
        roomId,
        targetPeerId: teacherPeerId,
        candidate: dummyCandidate,
      })
    )

    const relayedCandidate = await teacherSeesCandidatePromise
    assert.strictEqual(relayedCandidate.type, 'ice_candidate')
    assert.strictEqual(relayedCandidate.fromPeerId, studentPeerId)
    assert.strictEqual(relayedCandidate.payload.candidate.candidate, dummyCandidate.candidate)
    console.log('✅ ICE candidate successfully relayed')

    // 7. Test Microphone state toggle
    const teacherSeesMicPromise = getNextMessage(teacherWs)
    const studentSeesMicPromise = getNextMessage(studentWs)
    studentWs.send(
      JSON.stringify({
        type: 'set_microphone',
        roomId,
        enabled: true,
      })
    )

    const micMsg = await teacherSeesMicPromise
    await studentSeesMicPromise
    assert.strictEqual(micMsg.type, 'microphone_state_changed')
    assert.strictEqual(micMsg.payload.peerId, studentPeerId)
    assert.strictEqual(micMsg.payload.enabled, true)
    console.log('✅ Microphone enable state broadcast verified')

    // 8. Test Teacher blocking student microphone
    const studentSeesBlockedPromise = getNextMessage(studentWs)
    teacherWs.send(
      JSON.stringify({
        type: 'teacher_set_permission',
        roomId,
        targetPeerId: studentPeerId,
        micBlocked: true,
      })
    )

    const blockMsg = await studentSeesBlockedPromise
    assert.strictEqual(blockMsg.type, 'permission_state_changed')
    assert.strictEqual(blockMsg.payload.peerId, studentPeerId)
    assert.strictEqual(blockMsg.payload.micBlocked, true)
    console.log('✅ Teacher blocked student microphone permission')

    // 9. Student attempts to unmute while blocked -> receives error
    const studentSeesErrorPromise = getNextMessage(studentWs)
    studentWs.send(
      JSON.stringify({
        type: 'set_microphone',
        roomId,
        enabled: true,
      })
    )

    const errorMsg = await studentSeesErrorPromise
    assert.strictEqual(errorMsg.type, 'error')
    assert.strictEqual(errorMsg.payload.code, 'MIC_BLOCKED')
    console.log('✅ Student unmuting while blocked rejected by server')

    // 10. Teacher ends room
    const studentSeesEndedPromise = getNextMessage(studentWs)
    teacherWs.send(
      JSON.stringify({
        type: 'teacher_end_room',
        roomId,
      })
    )

    const endMsg = await studentSeesEndedPromise
    assert.strictEqual(endMsg.type, 'room_ended')
    console.log('✅ Room successfully ended by teacher and broadcast to participants')

    // Clean up
    teacherWs.close()
    studentWs.close()
    server.close()

    console.log('\n🎉 ALL 10 NATIVE SIGNALING TESTS PASSED PERFECTLY!\n')
    process.exit(0)
  } catch (err) {
    console.error('❌ Test failed with error:', err)
    server.close()
    process.exit(1)
  }
}

runTests()

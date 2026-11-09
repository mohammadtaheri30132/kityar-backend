// ==============================================================================
// Classroom Module End-to-End Integration & Unit Test (Phase 3)
// ==============================================================================

import mongoose, { Types } from 'mongoose'
import { ClassroomService } from '../../modules/classroom/services/classroom.service.js'
import { ClassroomSession } from '../../modules/classroom/models/ClassroomSession.js'
import { IRtcProvider } from '../../modules/classroom/adapters/RtcProvider.js'
import { ClassroomUserContext } from '../../modules/classroom/adapters/AuthAdapter.js'

// Mock In-Memory RTC Provider for hermetic testing
class MockRtcProvider implements IRtcProvider {
  public closedRooms: string[] = []

  async mintToken(options: any): Promise<string> {
    return `mock_token_for_${options.identity}_in_${options.roomName}_admin_${options.isTeacher}`
  }

  getServerUrl(clientPlatform?: string): string {
    if (clientPlatform === 'android_emulator') return 'ws://10.0.2.2:7880'
    return 'ws://localhost:7880'
  }

  async closeRoom(roomName: string): Promise<void> {
    this.closedRooms.push(roomName)
  }

  async verifyWebhook(body: string, authHeader: string): Promise<any> {
    return JSON.parse(body)
  }
}

async function runClassroomTests() {
  console.log('--- [Phase 3 Test] Running Classroom Module Tests ---')

  const mockRtc = new MockRtcProvider()
  const service = new ClassroomService(mockRtc)

  const teacherUser: ClassroomUserContext = {
    userId: new Types.ObjectId().toString(),
    role: 'teacher',
    name: 'استاد علوی',
    phoneNumber: '09120000001',
  }

  const studentUser: ClassroomUserContext = {
    userId: new Types.ObjectId().toString(),
    role: 'student',
    name: 'آرش کیانی',
    phoneNumber: '09120000002',
  }

  const intruderUser: ClassroomUserContext = {
    userId: new Types.ObjectId().toString(),
    role: 'student',
    name: 'کاربر ناشناس',
    phoneNumber: '09129999999',
  }

  // TEST 1: Create ad-hoc ClassroomSession directly
  console.log('TEST 1: Creating direct ClassroomSession in DB...')
  const testRoomName = `kitayar-class-test-${Date.now()}`
  const session = await ClassroomSession.create({
    roomName: testRoomName,
    sourceType: 'ad_hoc',
    teacherId: new Types.ObjectId(teacherUser.userId),
    studentId: new Types.ObjectId(studentUser.userId),
    title: 'کلاس رفع اشکال آزمایشی',
    status: 'scheduled',
    maxParticipants: 10,
  })
  console.log('✅ Session created with ID:', session._id.toString())

  // TEST 2: Teacher joins session
  console.log('TEST 2: Teacher joins session...')
  const teacherJoinResult = await service.joinSession(session._id.toString(), teacherUser)
  if (!teacherJoinResult.token.includes('admin_true')) {
    throw new Error('Teacher should have admin grant!')
  }
  console.log('✅ Teacher token minted correctly:', {
    role: teacherJoinResult.participant.role,
    isTeacher: teacherJoinResult.participant.isTeacher,
    roomAdmin: teacherJoinResult.participant.permissions.roomAdmin,
  })

  // TEST 3: Student joins session
  console.log('TEST 3: Student joins session...')
  const studentJoinResult = await service.joinSession(
    session._id.toString(),
    studentUser,
    'android_emulator'
  )
  if (studentJoinResult.participant.permissions.roomAdmin) {
    throw new Error('Student should NOT have admin grant!')
  }
  if (studentJoinResult.serverUrl !== 'ws://10.0.2.2:7880') {
    throw new Error('Emulator serverUrl should be 10.0.2.2!')
  }
  console.log('✅ Student token & emulator URL validated:', {
    serverUrl: studentJoinResult.serverUrl,
    roomAdmin: studentJoinResult.participant.permissions.roomAdmin,
    canPublishData: studentJoinResult.participant.permissions.canPublishData,
  })

  // TEST 4: Whiteboard snapshot save and retrieve
  console.log('TEST 4: Whiteboard snapshot save and retrieve...')
  const sampleStrokes = [
    { id: 'stroke_1', color: '#7c3aed', size: 3, points: [[0, 0], [10, 20], [30, 45]] },
    { id: 'stroke_2', color: '#ef4444', size: 5, points: [[50, 50], [60, 70]] },
  ]
  await service.saveWhiteboardSnapshot(
    session._id.toString(),
    { elements: sampleStrokes, viewport: { scale: 1.2, scrollX: 10, scrollY: 20 } },
    teacherUser
  )
  const retrievedWb = await service.getWhiteboardSnapshot(session._id.toString(), studentUser)
  if (retrievedWb.elements.length !== 2) {
    throw new Error(`Expected 2 whiteboard elements, got ${retrievedWb.elements.length}`)
  }
  console.log('✅ Whiteboard snapshot persisted and retrieved successfully. Elements:', retrievedWb.elements.length)

  // TEST 5: Webhook Lifecycle Events (room_started -> participant_joined -> participant_left -> room_finished)
  console.log('TEST 5: Testing Webhook Event Handling...')
  await service.handleWebhookEvent({
    event: 'room_started',
    room: { name: testRoomName, sid: 'RM_mock_sid' },
  })
  let updatedSession = await ClassroomSession.findById(session._id)
  if (updatedSession?.status !== 'active') {
    throw new Error(`Expected status active, got ${updatedSession?.status}`)
  }
  console.log('✅ Webhook room_started processed: status is now active')

  await service.handleWebhookEvent({
    event: 'participant_joined',
    room: { name: testRoomName },
    participant: {
      identity: studentUser.userId,
      name: studentUser.name,
      metadata: JSON.stringify({ role: 'student' }),
    },
  })
  updatedSession = await ClassroomSession.findById(session._id)
  if (updatedSession?.participantsLog.length !== 1) {
    throw new Error('Participant was not logged!')
  }
  console.log('✅ Webhook participant_joined processed: log count =', updatedSession.participantsLog.length)

  await service.handleWebhookEvent({
    event: 'participant_left',
    room: { name: testRoomName },
    participant: { identity: studentUser.userId },
  })
  updatedSession = await ClassroomSession.findById(session._id)
  if (!updatedSession?.participantsLog[0]?.leftAt) {
    throw new Error('participant leftAt was not recorded!')
  }
  console.log('✅ Webhook participant_left processed: leftAt recorded')

  // TEST 6: Student tries to end class -> Should fail (403)
  console.log('TEST 6: Student tries to end session (expect 403)...')
  try {
    await service.endSession(session._id.toString(), studentUser)
    throw new Error('Student should not be able to end session!')
  } catch (err: any) {
    if (err.statusCode === 403) {
      console.log('✅ Student blocked from ending session (HTTP 403)')
    } else {
      throw err
    }
  }

  // TEST 7: Teacher ends session -> Success
  console.log('TEST 7: Teacher ends session...')
  const endResult = await service.endSession(session._id.toString(), teacherUser)
  if (!endResult.success) {
    throw new Error('Failed to end session')
  }
  if (!mockRtc.closedRooms.includes(testRoomName)) {
    throw new Error('RTC room was not closed!')
  }
  updatedSession = await ClassroomSession.findById(session._id)
  if (updatedSession?.status !== 'completed') {
    throw new Error('Session should be completed!')
  }
  console.log('✅ Teacher ended session successfully: status is completed, SFU room closed')

  // Cleanup test session
  await ClassroomSession.findByIdAndDelete(session._id)
  console.log('🎉 ALL 7 CLASSROOM MODULE TESTS PASSED WITH 100% SUCCESS!')
}

// Connect to MongoDB and run tests
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/question-cms'
mongoose
  .connect(MONGO_URI)
  .then(() => runClassroomTests())
  .then(() => {
    mongoose.disconnect()
    process.exit(0)
  })
  .catch((err) => {
    console.error('❌ Test failed:', err)
    mongoose.disconnect()
    process.exit(1)
  })


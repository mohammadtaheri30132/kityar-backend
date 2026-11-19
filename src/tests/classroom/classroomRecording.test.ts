import assert from 'node:assert/strict'
import fs from 'node:fs'
import { RoomManager } from '../../modules/classroom/native/services/RoomManager.js'

async function runTests() {
  console.log('🧪 Running Classroom Recording & Synchronized Replay Tests...')

  // 1. Regular Room (Student & Teacher): Auto-starts recording as soon as first participant joins
  const regularRoomId = `class-math-${Date.now()}`
  const room = await RoomManager.getOrCreateRoom(regularRoomId, 'کلاس ریاضی یازدهم', 'teacher_1', 10)
  assert.equal(room.isTestRoom, false, 'Regular room should not be marked as test room')
  assert.equal(room.recording.isRecording, false, 'Before first join, recording should be idle')

  const joinResult1 = RoomManager.addParticipant(regularRoomId, {
    peerId: 'peer_teacher_1',
    userId: 'teacher_1',
    name: 'استاد رضایی',
    role: 'teacher',
    micState: 'disabled',
    cameraEnabled: false,
    connectionState: 'connected',
    joinedAt: Date.now(),
    isTeacher: true,
  })

  assert.equal(joinResult1.added, true, 'First participant should be added')
  assert.equal(joinResult1.autoStartedRecording, true, 'Recording must auto-start on first participant join')
  assert.equal(room.recording.isRecording, true, 'Room recording state must be active')
  assert.equal(room.recording.mode, 'auto', 'Regular room recording mode must be auto')
  assert.equal(room.recording.recorderPeerId, 'peer_teacher_1', 'Teacher peer should be assigned as recorder')

  // Second participant (student) joins
  const joinResult2 = RoomManager.addParticipant(regularRoomId, {
    peerId: 'peer_student_1',
    userId: 'student_1',
    name: 'علی محمدی',
    role: 'student',
    micState: 'disabled',
    cameraEnabled: false,
    connectionState: 'connected',
    joinedAt: Date.now(),
    isTeacher: false,
  })
  assert.equal(joinResult2.added, true)
  assert.equal(joinResult2.autoStartedRecording, false, 'Second participant join should not re-trigger auto-start')

  // Teacher unmutes mic, turns on camera, draws on whiteboard, sends chat
  RoomManager.updateMicrophoneState(regularRoomId, 'peer_teacher_1', 'enabled' as any)
  RoomManager.updateCameraState(regularRoomId, 'peer_teacher_1', true)
  RoomManager.appendWhiteboardTimeline(regularRoomId, 'add_element', {
    page: 1,
    element: { id: 'el_1', type: 'pen', points: [{ x: 10, y: 20 }, { x: 50, y: 80 }] },
  })
  RoomManager.appendChatMessage(regularRoomId, {
    id: 'chat_1',
    senderId: 'peer_student_1',
    senderName: 'علی محمدی',
    senderRole: 'student',
    message: 'سلام استاد، صدا و تصویر عالیه!',
    timestamp: Date.now(),
  })

  // Upload binary video chunk
  const fakeWebmChunk = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03, 0x04])
  const chunkStats = RoomManager.appendRecordingChunk(regularRoomId, fakeWebmChunk)
  assert.ok(chunkStats, 'Chunk stats should be returned')
  assert.equal(chunkStats.chunksCount, 1)
  assert.equal(chunkStats.fileSize, fakeWebmChunk.length)
  assert.ok(room.recording.filePath && fs.existsSync(room.recording.filePath), 'Recorded video file must exist on disk')

  // Student leaves, then class ends
  RoomManager.removeParticipant(regularRoomId, 'peer_student_1')
  RoomManager.setRetentionHoursCache(24)
  RoomManager.endRoom(regularRoomId, { peerId: 'peer_teacher_1', name: 'استاد رضایی', role: 'teacher' })

  const completed = RoomManager.getCompletedRoom(regularRoomId)
  assert.ok(completed, 'Completed room snapshot must be preserved')
  assert.equal(completed.recording.status, 'completed')
  assert.equal(completed.recording.isRecording, false)
  assert.ok(completed.recording.expiresAt && completed.recording.expiresAt > Date.now(), 'expiresAt must be set from retentionHours')

  const logTypes = completed.recording.serverLogs.map(l => l.type)
  assert.ok(logTypes.includes('recording_started'), 'Server logs must include recording_started')
  assert.ok(logTypes.includes('participant_joined'), 'Server logs must include participant_joined')
  assert.ok(logTypes.includes('mic_changed'), 'Server logs must include mic_changed')
  assert.ok(logTypes.includes('camera_changed'), 'Server logs must include camera_changed')
  assert.ok(logTypes.includes('chat_message'), 'Server logs must include chat_message')
  assert.ok(logTypes.includes('participant_left'), 'Server logs must include participant_left')
  assert.ok(logTypes.includes('room_ended'), 'Server logs must include room_ended')
  assert.ok(logTypes.includes('recording_stopped'), 'Server logs must include recording_stopped')
  assert.equal(completed.chatMessages.length, 1, 'Chat log must contain the in-class chat message')
  assert.equal(completed.recording.whiteboardTimeline.length, 1, 'Whiteboard timeline must contain stroke')

  // 2. Test Room on Website: Must NOT auto-start on join; must start & stop manually via button
  const testRoomId = `test-room-${Date.now()}`
  const testRoom = await RoomManager.getOrCreateRoom(testRoomId, 'کلاس تستی سایت')
  assert.equal(testRoom.isTestRoom, true, 'Room with "test" in ID must be detected as test room')

  const testJoin = RoomManager.addParticipant(testRoomId, {
    peerId: 'peer_tester_1',
    name: 'کاربر تست',
    role: 'teacher',
    micState: 'disabled',
    cameraEnabled: false,
    connectionState: 'connected',
    joinedAt: Date.now(),
    isTeacher: true,
  })
  assert.equal(testJoin.autoStartedRecording, false, 'Test room must NOT auto-start recording on participant join')
  assert.equal(testRoom.recording.isRecording, false, 'Test room recording must remain false until manual start')

  // Manual start button clicked
  const manualStart = RoomManager.startRecording(testRoomId, 'manual_test', {
    peerId: 'peer_tester_1',
    name: 'کاربر تست',
    role: 'teacher',
  })
  assert.ok(manualStart?.isRecording, 'Test room recording must start after manual trigger')
  assert.equal(manualStart?.mode, 'manual_test')

  // Manual stop button clicked
  const manualStop = RoomManager.stopRecording(testRoomId, {
    peerId: 'peer_tester_1',
    name: 'کاربر تست',
    role: 'teacher',
  })
  assert.equal(manualStop?.isRecording, false, 'Test room recording must stop after manual trigger')
  assert.equal(manualStop?.status, 'completed')
  RoomManager.endRoom(testRoomId)

  // 3. Auto-Deletion after Retention Timer Expires
  completed.recording.expiresAt = Date.now() - 1000 // Simulate expired retention window
  const deletedCount = await RoomManager.cleanupExpiredRecordings()
  assert.ok(deletedCount >= 1, 'Expired recording should be cleaned up')
  assert.equal(completed.recording.status, 'deleted', 'Expired recording status must become deleted')
  assert.equal(completed.recording.videoUrl, undefined, 'Expired recording videoUrl must be cleared')
  if (completed.recording.filePath) {
    assert.equal(fs.existsSync(completed.recording.filePath), false, 'Expired video file must be deleted from disk')
  }

  console.log('✅ All Classroom Recording, Manual Test Mode & Auto-Deletion tests passed!')
}

runTests().catch(err => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})

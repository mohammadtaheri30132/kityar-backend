// ==============================================================================
// Ticket-Based Classroom Creation and Join Test
// ==============================================================================

import mongoose, { Types } from 'mongoose'
import { ClassroomService } from '../../modules/classroom/services/classroom.service.js'
import { ClassroomSession } from '../../modules/classroom/models/ClassroomSession.js'
import { IRtcProvider } from '../../modules/classroom/adapters/RtcProvider.js'
import { ClassroomUserContext } from '../../modules/classroom/adapters/AuthAdapter.js'

class MockRtcProvider implements IRtcProvider {
  async mintToken(options: any): Promise<string> {
    return `jwt_for_${options.identity}_role_${options.metadata?.role}_admin_${options.isTeacher}`
  }

  getServerUrl(clientPlatform?: string): string {
    return 'ws://localhost:7880'
  }

  async closeRoom(roomName: string): Promise<void> {}

  async verifyWebhook(body: string, authHeader: string): Promise<any> {
    return JSON.parse(body)
  }
}

async function runTicketTests() {
  console.log('--- Running Ad-Hoc Classroom & Membership Ticket Tests ---')

  const mockRtc = new MockRtcProvider()
  const service = new ClassroomService(mockRtc)

  const adminUser: ClassroomUserContext = {
    userId: new Types.ObjectId().toString(),
    role: 'admin',
    name: 'مدیر ارشد سامانه',
  }

  // 1. Create Ad-Hoc Session with 3 student tickets + 1 teacher ticket
  console.log('TEST 1: Creating ad-hoc session with 3 student tickets...')
  const session = await service.createAdHocSession({
    title: 'کلاس تستی فیزیک دوازدهم',
    topic: 'حرکت‌شناسی و دینامیک',
    teacherName: 'استاد علوی',
    studentCount: 3,
    adminUser,
  })

  if (!session || !session._id) throw new Error('Session creation failed')
  if (session.inviteTickets.length !== 4) {
    throw new Error(`Expected 4 tickets (1 teacher + 3 students), got ${session.inviteTickets.length}`)
  }

  const teacherTicket = session.inviteTickets.find((t) => t.role === 'teacher')
  const studentTickets = session.inviteTickets.filter((t) => t.role === 'student')

  if (!teacherTicket) throw new Error('Teacher ticket not found')
  if (studentTickets.length !== 3) throw new Error('Expected 3 student tickets')

  console.log('✅ Session created successfully:', {
    sessionId: session._id.toString(),
    roomName: session.roomName,
    teacherTicket: teacherTicket.ticketCode,
    studentTicketsCount: studentTickets.length,
  })

  // 2. Teacher joins via ticket (no JWT user required)
  console.log('TEST 2: Teacher joins using teacher ticket...')
  const teacherJoinResult = await service.joinSession(
    session._id.toString(),
    null, // No JWT user
    'web',
    teacherTicket.ticketCode
  )

  if (!teacherJoinResult.participant.isTeacher) {
    throw new Error('Participant should be marked as teacher!')
  }
  if (!teacherJoinResult.participant.permissions.roomAdmin) {
    throw new Error('Teacher should have roomAdmin permission!')
  }
  console.log('✅ Teacher joined with ticket:', {
    name: teacherJoinResult.participant.name,
    role: teacherJoinResult.participant.role,
    roomAdmin: teacherJoinResult.participant.permissions.roomAdmin,
  })

  // 3. Student joins via student ticket #1 with custom guest name
  console.log('TEST 3: Student joins using student ticket...')
  const studentTicket1 = studentTickets[0]
  const studentJoinResult = await service.joinSession(
    session._id.toString(),
    null,
    'web',
    studentTicket1.ticketCode,
    'آرش کیانی'
  )

  if (studentJoinResult.participant.isTeacher) {
    throw new Error('Student should not be teacher!')
  }
  if (studentJoinResult.participant.permissions.roomAdmin) {
    throw new Error('Student should not have roomAdmin!')
  }
  if (studentJoinResult.participant.name !== 'آرش کیانی') {
    throw new Error('Guest name override failed')
  }
  console.log('✅ Student joined with ticket and custom name:', {
    name: studentJoinResult.participant.name,
    role: studentJoinResult.participant.role,
    roomAdmin: studentJoinResult.participant.permissions.roomAdmin,
  })

  // 4. Add more tickets to the session
  console.log('TEST 4: Adding 2 more tickets to session...')
  const addResult = await service.addTicketsToSession(session._id.toString(), {
    count: 2,
    role: 'student',
    namePrefix: 'دانش‌آموز جدید',
  })

  if (addResult.newTickets.length !== 2) {
    throw new Error('Expected 2 new tickets')
  }
  if (addResult.totalTickets.length !== 6) {
    throw new Error('Expected 6 total tickets')
  }
  console.log('✅ Added 2 new tickets. Total tickets now:', addResult.totalTickets.length)

  // 5. List tickets
  console.log('TEST 5: Listing all tickets for session...')
  const listResult = await service.listTickets(session._id.toString())
  if (listResult.tickets.length !== 6) {
    throw new Error('Ticket listing count mismatch')
  }
  console.log('✅ Ticket listing verified:', listResult.tickets.map((t) => `${t.name} (${t.role}): ${t.ticketCode}`))

  // Cleanup
  await ClassroomSession.findByIdAndDelete(session._id)
  console.log('🎉 ALL TICKET CLASSROOM TESTS PASSED 100%!')
}

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/question-cms'
mongoose
  .connect(MONGO_URI)
  .then(() => runTicketTests())
  .then(() => {
    mongoose.disconnect()
    process.exit(0)
  })
  .catch((err) => {
    console.error('❌ Ticket test failed:', err)
    mongoose.disconnect()
    process.exit(1)
  })


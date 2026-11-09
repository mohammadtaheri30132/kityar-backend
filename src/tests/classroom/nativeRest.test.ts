import assert from 'assert'
import express from 'express'
import http from 'http'
import nativeRoutes from '../../modules/classroom/native/native.routes.js'
import { RoomManager } from '../../modules/classroom/native/services/RoomManager.js'

const app = express()
app.use(express.json())
app.use('/api/classroom/native', nativeRoutes)

const server = http.createServer(app)

async function runRestTests() {
  console.log('🧪 Starting Native Classroom REST API Tests...')

  await new Promise<void>(resolve => server.listen(0, resolve))
  const address = server.address() as any
  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
    // 1. Test GET /ice-servers
    const iceResponse = await fetch(`${baseUrl}/api/classroom/native/ice-servers`)
    assert.strictEqual(iceResponse.status, 200)
    const iceJson: any = await iceResponse.json()
    assert.ok(iceJson.success)
    assert.ok(Array.isArray(iceJson.data.iceServers))
    assert.ok(iceJson.data.iceServers.length >= 2)
    console.log('✅ GET /ice-servers returned valid STUN/TURN configurations')

    // 2. Setup mock room in memory
    await RoomManager.getOrCreateRoom('mock-room-123', 'کلاس ریاضی هشتم', 'teacher_1', 8)

    // 3. Test GET /rooms/:roomId/active-state
    const stateResponse = await fetch(`${baseUrl}/api/classroom/native/rooms/mock-room-123/active-state`)
    assert.strictEqual(stateResponse.status, 200)
    const stateJson: any = await stateResponse.json()
    assert.strictEqual(stateJson.success, true)
    assert.strictEqual(stateJson.data.roomId, 'mock-room-123')
    assert.strictEqual(stateJson.data.status, 'active')
    console.log('✅ GET /rooms/:roomId/active-state returned active room status')

    server.close()
    console.log('\n🎉 ALL NATIVE REST API TESTS PASSED!\n')
    process.exit(0)
  } catch (err) {
    server.close()
    console.error('❌ REST Test failed:', err)
    process.exit(1)
  }
}

runRestTests()

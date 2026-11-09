// ==============================================================================
// LiveKit Official SDK Validation Test (Phase 2)
// ==============================================================================

import { AccessToken, WebhookReceiver } from 'livekit-server-sdk'

const API_KEY = process.env.LIVEKIT_API_KEY || 'kitayar_livekit_key_prod_2026'
const API_SECRET = process.env.LIVEKIT_API_SECRET || 'kitayar_livekit_secret_super_secure_iran_2026'

async function runOfficialSdkValidation() {
  console.log('--- [Phase 2] Validating with Official livekit-server-sdk ---')

  // 1. Generate Token with official SDK
  const at = new AccessToken(API_KEY, API_SECRET, {
    identity: 'teacher_9901',
    name: 'استاد احمدی',
    ttl: '1h',
    metadata: JSON.stringify({ role: 'teacher', subject: 'ریاضی' }),
  })

  at.addGrant({
    roomJoin: true,
    room: 'kitayar-test-room-202',
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })

  const token = await at.toJwt()
  console.log('✅ Generated JWT using official SDK. Length:', token.length)

  // 2. Validate with WebhookReceiver
  const receiver = new WebhookReceiver(API_KEY, API_SECRET)
  const webhookBody = JSON.stringify({
    event: 'participant_joined',
    room: { name: 'kitayar-test-room-202', sid: 'RM_12345' },
    participant: { identity: 'teacher_9901', name: 'استاد احمدی' },
    id: 'EV_webhook_sdk_test',
    createdAt: Math.floor(Date.now() / 1000),
  })

  // Create valid auth header using AccessToken with sha256 claim as WebhookReceiver expects
  const crypto = await import('crypto')
  const bodyHash = crypto.createHash('sha256').update(webhookBody).digest('base64')
  
  const webhookToken = new AccessToken(API_KEY, API_SECRET, {
    ttl: '5m',
  })
  webhookToken.sha256 = bodyHash
  const authHeader = await webhookToken.toJwt()

  const receivedEvent = await receiver.receive(webhookBody, authHeader)
  console.log('✅ WebhookReceiver successfully verified event:', receivedEvent.event, 'for participant:', receivedEvent.participant?.identity)

  console.log('🎉 Official LiveKit Server SDK validation PASSED 100%!')
}

runOfficialSdkValidation().catch((err) => {
  console.error('❌ Validation failed:', err)
  process.exit(1)
})


import { AccessToken, RoomServiceClient, WebhookReceiver } from 'livekit-server-sdk'
import { logger } from '../../../core/utils/logger.js'

export interface IRtcTokenOptions {
  identity: string
  name: string
  roomName: string
  isTeacher: boolean
  ttlSeconds?: number
  metadata?: Record<string, any>
}

export interface IRtcProvider {
  mintToken(options: IRtcTokenOptions): Promise<string>
  getServerUrl(clientPlatform?: string): string
  closeRoom(roomName: string): Promise<void>
  verifyWebhook(body: string, authHeader: string): Promise<any>
}

export class LiveKitRtcProvider implements IRtcProvider {
  private apiKey: string
  private apiSecret: string
  private serverUrl: string
  private roomService: RoomServiceClient
  private webhookReceiver: WebhookReceiver

  constructor() {
    this.apiKey = process.env.LIVEKIT_API_KEY || 'kitayar_livekit_key_prod_2026'
    this.apiSecret = process.env.LIVEKIT_API_SECRET || 'kitayar_livekit_secret_super_secure_iran_2026'
    this.serverUrl = process.env.LIVEKIT_SERVER_URL || 'ws://localhost:7880'

    const httpUrl = this.serverUrl.replace(/^ws(s)?:/, 'http$1:')
    this.roomService = new RoomServiceClient(httpUrl, this.apiKey, this.apiSecret)
    this.webhookReceiver = new WebhookReceiver(this.apiKey, this.apiSecret)
  }

  /**
   * Generates a signed LiveKit AccessToken JWT
   */
  async mintToken(options: IRtcTokenOptions): Promise<string> {
    const { identity, name, roomName, isTeacher, ttlSeconds = 7200, metadata = {} } = options

    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity,
      name,
      ttl: `${ttlSeconds}s`,
      metadata: JSON.stringify({
        ...metadata,
        isTeacher,
        system: 'kitayar_classroom',
      }),
    })

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true, // Both teacher and student can publish audio/video
      canSubscribe: true,
      canPublishData: true, // Crucial for InfiniteCanvas whiteboard real-time strokes
      roomAdmin: isTeacher,
      roomRecord: false, // Class recording is out-of-scope
    })

    return await at.toJwt()
  }

  /**
   * Returns client-appropriate WebSocket connection URL
   */
  getServerUrl(clientPlatform?: string): string {
    if (process.env.LIVEKIT_PUBLIC_URL) {
      return process.env.LIVEKIT_PUBLIC_URL
    }

    if (clientPlatform === 'android_emulator') {
      return 'ws://10.0.2.2:7880'
    }

    return this.serverUrl
  }

  /**
   * Delete / Close a room on LiveKit SFU
   */
  async closeRoom(roomName: string): Promise<void> {
    try {
      await this.roomService.deleteRoom(roomName)
      logger.info(`[Classroom RtcProvider] Room ${roomName} deleted successfully`)
    } catch (error: any) {
      // If room was not active on SFU, ignore 404
      if (error?.response?.status === 404 || error?.message?.includes('not found')) {
        logger.info(`[Classroom RtcProvider] Room ${roomName} was already closed or not created on SFU`)
        return
      }
      logger.warn(`[Classroom RtcProvider] Error closing room ${roomName}:`, error)
    }
  }

  /**
   * Validates LiveKit incoming webhook HMAC authorization header
   */
  async verifyWebhook(body: string, authHeader: string): Promise<any> {
    return await this.webhookReceiver.receive(body, authHeader)
  }
}


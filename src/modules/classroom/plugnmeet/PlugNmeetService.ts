import crypto from 'crypto'
import { logger } from '../../../core/utils/logger.js'

export interface IPlugNmeetRoomMetadata {
  room_title: string
  welcome_message?: string
  logout_url?: string
  room_features?: {
    allow_webcams?: boolean
    mute_on_start?: boolean
    allow_screen_share?: boolean
    allow_rtmp?: boolean
    admin_only_webcams?: boolean
    allow_view_other_webcams?: boolean
    allow_view_other_users_list?: boolean
    chat_features?: {
      is_allow?: boolean
      is_allow_file_upload?: boolean
      max_file_size?: number
      allowed_file_types?: string[]
      allow_chat?: boolean
      allow_file_upload?: boolean
    }
    shared_note_pad_features?: {
      is_allow?: boolean
      visible?: boolean
      allowed?: boolean
    }
    whiteboard_features?: {
      is_allow?: boolean
      visible?: boolean
      allowed?: boolean
      max_allowed_file_size?: number
    }
    breakout_room_features?: {
      is_allow?: boolean
      allowed?: boolean
    }
    display_external_link_features?: {
      is_allow?: boolean
      allowed?: boolean
    }
    recording_features?: {
      is_allow?: boolean
      enable_auto_cloud_recording?: boolean
    }
  }
  default_lock_settings?: {
    lock_microphone?: boolean
    lock_webcam?: boolean
    lock_screen_sharing?: boolean
    lock_chat?: boolean
    lock_chat_send_message?: boolean
    lock_chat_file_share?: boolean
    lock_whiteboard?: boolean
    lock_shared_notepad?: boolean
  }
  copyright_conf?: {
    display?: boolean
    text?: string
  }
  default_language?: string
}

export interface IPlugNmeetCreateRoomOptions {
  roomId: string
  roomTitle: string
  welcomeMessage?: string
  maxParticipants?: number
  emptyTimeout?: number
  logoutUrl?: string
  metadataOverrides?: Partial<IPlugNmeetRoomMetadata>
}

export interface IPlugNmeetJoinTokenOptions {
  roomId: string
  name: string
  userId: string
  isAdmin: boolean
  role?: 'teacher' | 'student' | 'admin'
  userMetadata?: Record<string, any>
}

export interface IPlugNmeetClientFiles {
  status: boolean
  msg: string
  css?: string[]
  js?: string[]
}

/**
 * PlugNmeet Standalone Service
 * Connects securely to a self-hosted plugNmeet-server via official HMAC-SHA256 authenticated REST API.
 */
export class PlugNmeetService {
  private serverUrl: string
  private apiKey: string
  private apiSecret: string

  constructor() {
    const rawUrl = process.env.PLUGNMEET_SERVER_URL || 'https://demo.plugnmeet.com'
    this.serverUrl = rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl
    this.apiKey = process.env.PLUGNMEET_API_KEY || 'plugnmeet'
    this.apiSecret = process.env.PLUGNMEET_API_SECRET || 'zumyyYWqv7KR2kUqvYdq4z4sXg7XTBD2ljT6'

    logger.info(`[plugNmeet] Service initialized for server: ${this.serverUrl}`)
  }

  /**
   * Internal helper to make signed POST requests to plugNmeet API
   */
  private async sendRequest<T = any>(endpoint: string, body: Record<string, any>): Promise<T> {
    const jsonBody = JSON.stringify(body)
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(jsonBody)
      .digest('hex')

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    // Support both /auth/room/... and /room/... depending on endpoint prefix
    const path = cleanEndpoint.startsWith('/auth') ? cleanEndpoint : `/auth${cleanEndpoint}`
    const fullUrl = `${this.serverUrl}${path}`

    try {
      const response = await fetch(fullUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          'Content-Type': 'application/json',
          'API-KEY': this.apiKey,
          'HASH-SIGNATURE': signature,
        },
        body: jsonBody,
      })

      const data = await response.json()
      return data as T
    } catch (error: any) {
      logger.error(`[plugNmeet] Request failed for ${fullUrl}:`, error.message)
      throw new Error(`خطا در ارتباط با سرور plugNmeet (${cleanEndpoint}): ${error.message}`)
    }
  }

  /**
   * Creates a live room session on plugNmeet
   */
  public async createRoom(options: IPlugNmeetCreateRoomOptions): Promise<{
    status: boolean
    msg: string
    room_info?: any
  }> {
    const defaultMetadata: IPlugNmeetRoomMetadata = {
      room_title: options.roomTitle,
      welcome_message: options.welcomeMessage || `به کلاس آنلاین «${options.roomTitle}» در کیتایار خوش آمدید.`,
      ...(options.logoutUrl ? { logout_url: options.logoutUrl } : {}),
      room_features: {
        allow_webcams: true,
        mute_on_start: false,
        allow_screen_share: true,
        allow_rtmp: false,
        admin_only_webcams: false,
        allow_view_other_webcams: true,
        allow_view_other_users_list: true,
        chat_features: {
          is_allow: true,
          is_allow_file_upload: true,
          max_file_size: 50,
          allowed_file_types: [
            'jpg', 'jpeg', 'png', 'svg', 'gif', 'pdf',
            'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt',
            'zip', 'rar', 'mp3', 'mp4', 'txt'
          ],
        },
        shared_note_pad_features: {
          is_allow: true,
          visible: false,
        },
        whiteboard_features: {
          is_allow: true,
          visible: false,
        },
        breakout_room_features: {
          is_allow: true,
        },
        display_external_link_features: {
          is_allow: true,
        },
        recording_features: {
          is_allow: true,
          enable_auto_cloud_recording: false,
        },
      },
      default_lock_settings: {
        lock_microphone: true,
        lock_webcam: true,
        lock_screen_sharing: true,
        lock_chat: false,
        lock_chat_send_message: false,
        lock_chat_file_share: false,
        lock_whiteboard: true,
        lock_shared_notepad: true,
      },
      copyright_conf: {
        display: true,
        text: 'سامانه آموزش آنلاین کیتایار • Kitayar Classroom',
      },
      default_language: 'fa',
    }

    const payload = {
      room_id: options.roomId,
      max_participants: options.maxParticipants || 50,
      empty_timeout: options.emptyTimeout || 3600,
      metadata: {
        ...defaultMetadata,
        ...options.metadataOverrides,
      },
    }

    return await this.sendRequest('/room/create', payload)
  }

  /**
   * Generates a secure, short-lived join token for participant/moderator
   */
  public async getJoinToken(options: IPlugNmeetJoinTokenOptions): Promise<{
    status: boolean
    msg: string
    token?: string
  }> {
    const payload = {
      room_id: options.roomId,
      user_info: {
        name: options.name,
        user_id: options.userId,
        is_admin: options.isAdmin,
        is_hidden: false,
        user_metadata: {
          role: options.role || (options.isAdmin ? 'teacher' : 'student'),
          platform: 'kitayar_web',
          ...options.userMetadata,
        },
      },
    }

    return await this.sendRequest('/room/getJoinToken', payload)
  }

  /**
   * Checks if a room has an active session on the plugNmeet server
   */
  public async isRoomActive(roomId: string): Promise<boolean> {
    try {
      const res = await this.sendRequest<{ status: boolean; msg: string }>('/room/isRoomActive', {
        room_id: roomId,
      })
      return !!res.status
    } catch {
      return false
    }
  }

  /**
   * Force terminates an active room on the plugNmeet server
   */
  public async endRoom(roomId: string): Promise<{ status: boolean; msg: string }> {
    try {
      return await this.sendRequest('/room/endRoom', { room_id: roomId })
    } catch (err: any) {
      return { status: false, msg: err.message }
    }
  }

  /**
   * Retrieves official Javascript and CSS client assets for Native Embedding
   */
  public async getClientFiles(): Promise<IPlugNmeetClientFiles> {
    try {
      return await this.sendRequest<IPlugNmeetClientFiles>('/getClientFiles', {})
    } catch (err: any) {
      return { status: false, msg: err.message, css: [], js: [] }
    }
  }

  public getServerUrl(): string {
    return this.serverUrl
  }
}

export const plugNmeetService = new PlugNmeetService()


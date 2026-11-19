import fs from 'fs'
import path from 'path'
import mongoose from 'mongoose'
import {
  IChatMessage,
  INativeParticipant,
  INativeRoom,
  INativeRoomPoll,
  INativeRoomRecording,
  IRecordingServerLog,
  MicrophoneState,
} from '../types/native.types.js'
import {
  ClassroomSession,
  ClassroomUiMode,
  ISeminarAttendeeRecord,
} from '../../models/ClassroomSession.js'
import { ServerTelemetrySampler } from './ServerTelemetrySampler.js'
import { ClassroomPricing } from '../../../../core/models/ClassroomPricing.js'
import { logger } from '../../../../core/utils/logger.js'

const RECORDINGS_DIR = path.join(process.cwd(), 'uploads', 'class-recordings')

function roleLabelFa(role?: string): string {
  if (role === 'teacher') return 'استاد'
  if (role === 'admin') return 'ادمین'
  return 'دانش‌آموز'
}

export class RoomManager {
  private static rooms = new Map<string, INativeRoom>()
  private static completedRooms = new Map<string, INativeRoom>()
  private static roomAttendees = new Map<string, Map<string, ISeminarAttendeeRecord>>()
  private static retentionHoursCache = 48
  private static cleanupTimerStarted = false

  static isTestRoomId(roomId: string): boolean {
    const normalized = String(roomId || '').trim().toLowerCase()
    return normalized.includes('test') || normalized.startsWith('demo-')
  }

  static ensureRecordingsDir(): void {
    if (!fs.existsSync(RECORDINGS_DIR)) {
      fs.mkdirSync(RECORDINGS_DIR, { recursive: true })
    }
  }

  static setRetentionHoursCache(hours: number): void {
    if (Number.isFinite(hours) && hours >= 0) {
      this.retentionHoursCache = hours
    }
  }

  static async getRetentionHours(): Promise<number> {
    if (mongoose.connection.readyState === 1) {
      try {
        const pricing = await ClassroomPricing.findOne({ key: 'default' }).lean()
        if (pricing && typeof (pricing as any).recordingRetentionHours === 'number') {
          this.retentionHoursCache = (pricing as any).recordingRetentionHours
        }
      } catch (err) {
        logger.error('[RoomManager] Error reading retention hours from ClassroomPricing:', err)
      }
    }
    return this.retentionHoursCache
  }

  static startCleanupScheduler(): void {
    if (this.cleanupTimerStarted) return
    this.cleanupTimerStarted = true
    const timer = setInterval(() => {
      this.cleanupExpiredRecordings().catch(err =>
        logger.error('[RoomManager] Periodic recording cleanup failed:', err)
      )
    }, 10 * 60 * 1000)
    if (typeof timer.unref === 'function') {
      timer.unref()
    }
  }

  /**
   * Get an existing room from memory or initialize it from database
   */
  static async getOrCreateRoom(
    roomId: string,
    initialTitle = 'کلاس آنلاین کیتایار',
    teacherId?: string,
    maxParticipants = 8
  ): Promise<INativeRoom> {
    this.startCleanupScheduler()
    ServerTelemetrySampler.registerRoomsProvider(() => this.rooms)

    let room = this.rooms.get(roomId)
    if (room) {
      return room
    }

    // Try loading session metadata from database if connected
    let title = initialTitle
    let dbTeacherId = teacherId
    let max = maxParticipants
    let uiMode: ClassroomUiMode = 'online_class'
    let existingAttendees: ISeminarAttendeeRecord[] = []
    let existingPolls: INativeRoomPoll[] = []
    const isTestRoom = this.isTestRoomId(roomId)

    if (mongoose.connection.readyState === 1) {
      try {
        const session = await ClassroomSession.findOne({ roomName: roomId }).lean()
        if (session) {
          title = session.title || title
          dbTeacherId = session.teacherId?.toString() || dbTeacherId
          max = session.maxParticipants || max
          uiMode = session.uiMode === 'seminar' ? 'seminar' : 'online_class'
          existingAttendees = Array.isArray(session.attendees) ? session.attendees : []
          existingPolls = Array.isArray((session as any).polls) ? (session as any).polls : []
        }
      } catch (err) {
        logger.error(`[RoomManager] Error querying db for room ${roomId}:`, err)
      }
    }

    if (!this.roomAttendees.has(roomId)) {
      const map = new Map<string, ISeminarAttendeeRecord>()
      for (const att of existingAttendees) {
        if (att?.attendeeKey) {
          map.set(att.attendeeKey, {
            ...att,
            isOnline: false,
            activePeerIds: [],
            sessions: Array.isArray(att.sessions) ? [...att.sessions] : [],
          })
        }
      }
      this.roomAttendees.set(roomId, map)
    }

    room = {
      roomId,
      title,
      uiMode,
      teacherId: dbTeacherId,
      isTestRoom,
      status: 'active',
      maxParticipants: max,
      participants: new Map<string, INativeParticipant>(),
      whiteboard: {
        currentPage: 1,
        totalPages: 10,
        gridMode: 'grid',
        allowStudentDraw: false,
        pages: { 1: [] },
        pageBackgrounds: {},
      },
      chatMessages: [],
      polls: existingPolls,
      recording: {
        isRecording: false,
        mode: isTestRoom ? 'manual_test' : 'auto',
        status: 'idle',
        chunksCount: 0,
        fileSize: 0,
        serverLogs: [],
        whiteboardTimeline: [],
      },
      createdAt: Date.now(),
      startedAt: Date.now(),
    }

    this.rooms.set(roomId, room)

    // Update or upsert DB status to active if connected
    if (mongoose.connection.readyState === 1) {
      ClassroomSession.updateOne(
        { roomName: roomId },
        {
          $set: { status: 'active', startedAt: new Date() },
          $setOnInsert: {
            roomName: roomId,
            title: isTestRoom && title === 'کلاس آنلاین کیتایار' ? `کلاس تستی (${roomId})` : title,
            sourceType: 'ad_hoc',
            provider: 'internal',
            maxParticipants: max,
          },
        },
        { upsert: true }
      ).catch(err => logger.error(`[RoomManager] Failed to update room start in DB:`, err))
    }

    return room
  }

  static getRoom(roomId: string): INativeRoom | undefined {
    return this.rooms.get(roomId)
  }

  static getCompletedRoom(roomId: string): INativeRoom | undefined {
    return this.completedRooms.get(roomId)
  }

  static assignRecorderPeer(room: INativeRoom): string | undefined {
    if (!room.recording.isRecording) {
      room.recording.recorderPeerId = undefined
      return undefined
    }
    const currentId = room.recording.recorderPeerId
    if (currentId && room.participants.has(currentId)) {
      return currentId
    }
    const list = Array.from(room.participants.values())
    const teacher = list.find(p => p.role === 'teacher')
    const chosen = teacher || list[0]
    room.recording.recorderPeerId = chosen?.peerId
    return room.recording.recorderPeerId
  }

  static startRecording(
    roomId: string,
    mode?: 'auto' | 'manual_test',
    actor?: { peerId?: string; name?: string; role?: 'teacher' | 'student' | 'admin' }
  ): INativeRoomRecording | undefined {
    const room = this.rooms.get(roomId)
    if (!room) return undefined

    if (room.recording.isRecording) {
      this.assignRecorderPeer(room)
      return room.recording
    }

    this.ensureRecordingsDir()
    const now = Date.now()
    const resolvedMode = mode || (room.isTestRoom ? 'manual_test' : 'auto')

    if (!room.recording.filePath || room.recording.status === 'deleted') {
      const safeRoom = roomId.replace(/[^a-zA-Z0-9_-]/g, '_')
      const fileName = `${safeRoom}-${now}.webm`
      room.recording.filePath = path.join(RECORDINGS_DIR, fileName)
      room.recording.videoUrl = `/uploads/class-recordings/${fileName}`
    }

    room.recording.isRecording = true
    room.recording.mode = resolvedMode
    room.recording.status = 'recording'
    if (!room.recording.startedAt) {
      room.recording.startedAt = now
    }
    room.recording.endedAt = undefined
    this.assignRecorderPeer(room)

    this.appendRecordingLog(roomId, {
      type: 'recording_started',
      actorId: actor?.peerId,
      actorName: actor?.name || 'سیستم',
      actorRole: actor?.role || 'system',
      message:
        resolvedMode === 'manual_test'
          ? `ضبط دستی کلاس تستی توسط ${actor?.name || 'کاربر'} آغاز شد`
          : `ضبط خودکار کلاس با ورود اولین نفر (${actor?.name || 'کاربر'}) آغاز شد`,
      metadata: { mode: resolvedMode },
    })

    if (mongoose.connection.readyState === 1) {
      ClassroomSession.updateOne(
        { roomName: roomId },
        {
          $set: {
            'recording.status': 'recording',
            'recording.mode': resolvedMode,
            'recording.startedAt': new Date(room.recording.startedAt),
            'recording.videoUrl': room.recording.videoUrl,
            'recording.mimeType': 'video/webm',
          },
        }
      ).catch(err => logger.error(`[RoomManager] Failed to persist recording start in DB:`, err))
    }

    return room.recording
  }

  static stopRecording(
    roomId: string,
    actor?: { peerId?: string; name?: string; role?: 'teacher' | 'student' | 'admin' | 'system' },
    reason?: string
  ): INativeRoomRecording | undefined {
    const room = this.rooms.get(roomId)
    if (!room) return undefined

    const wasRecording = room.recording.isRecording
    const now = Date.now()
    room.recording.isRecording = false
    room.recording.recorderPeerId = undefined

    if (wasRecording || room.recording.startedAt) {
      room.recording.endedAt = now
      room.recording.status = 'completed'
    }

    const startedAt = room.recording.startedAt || room.startedAt || room.createdAt
    const durationSeconds = Math.max(1, Math.round((now - startedAt) / 1000))
    const retentionHours = this.retentionHoursCache
    const expiresAt =
      retentionHours > 0 ? new Date(now + retentionHours * 3600 * 1000) : undefined
    room.recording.expiresAt = expiresAt ? expiresAt.getTime() : undefined

    if (wasRecording) {
      this.appendRecordingLog(roomId, {
        type: 'recording_stopped',
        actorId: actor?.peerId,
        actorName: actor?.name || 'سیستم',
        actorRole: actor?.role || 'system',
        message:
          reason ||
          `ضبط کلاس توسط ${actor?.name || 'سیستم'} پایان یافت (مدت: ${durationSeconds} ثانیه)`,
        metadata: { durationSeconds, chunksCount: room.recording.chunksCount, fileSize: room.recording.fileSize },
      })
    }

    this.persistRecordingSnapshot(room, durationSeconds, expiresAt)
    return room.recording
  }

  private static persistRecordingSnapshot(
    room: INativeRoom,
    durationSeconds: number,
    expiresAt?: Date
  ): void {
    // Keep in-memory copy for immediate replay / tests
    this.completedRooms.set(room.roomId, {
      ...room,
      participants: new Map(room.participants),
      chatMessages: [...room.chatMessages],
      recording: {
        ...room.recording,
        serverLogs: [...room.recording.serverLogs],
        whiteboardTimeline: [...room.recording.whiteboardTimeline],
      },
    })
    if (this.completedRooms.size > 50) {
      const oldestKey = this.completedRooms.keys().next().value
      if (oldestKey) this.completedRooms.delete(oldestKey)
    }

    if (mongoose.connection.readyState === 1) {
      const baseStart = room.recording.startedAt || room.startedAt || room.createdAt
      const chatLog = room.chatMessages.map(msg => ({
        id: msg.id,
        senderId: msg.senderId,
        senderName: msg.senderName,
        senderRole: msg.senderRole,
        message: msg.message,
        timestamp: new Date(msg.timestamp),
        offsetMs:
          typeof msg.offsetMs === 'number'
            ? msg.offsetMs
            : Math.max(0, msg.timestamp - baseStart),
      }))

      const serverLogs = room.recording.serverLogs.map(log => ({
        timestamp: new Date(log.timestamp),
        offsetMs: log.offsetMs,
        type: log.type,
        actorId: log.actorId,
        actorName: log.actorName,
        actorRole: log.actorRole,
        message: log.message,
        metadata: log.metadata,
      }))

      const whiteboardTimeline = room.recording.whiteboardTimeline.map(wb => ({
        timestamp: new Date(wb.timestamp),
        offsetMs: wb.offsetMs,
        page: wb.page,
        action: wb.action,
        payload: wb.payload,
      }))

      ClassroomSession.updateOne(
        { roomName: room.roomId },
        {
          $set: {
            recording: {
              status: room.recording.status,
              mode: room.recording.mode,
              startedAt: room.recording.startedAt ? new Date(room.recording.startedAt) : new Date(baseStart),
              endedAt: room.recording.endedAt ? new Date(room.recording.endedAt) : new Date(),
              durationSeconds,
              videoUrl: room.recording.videoUrl,
              fileSize: room.recording.fileSize,
              mimeType: 'video/webm',
              expiresAt,
              chunksCount: room.recording.chunksCount,
              serverLogs,
              chatLog,
              whiteboardTimeline,
            },
          },
        }
      ).catch(err => logger.error(`[RoomManager] Failed to persist recording snapshot in DB:`, err))
    }
  }

  static appendRecordingLog(
    roomId: string,
    entry: {
      type: IRecordingServerLog['type']
      actorId?: string
      actorName?: string
      actorRole?: 'teacher' | 'student' | 'admin' | 'system'
      message: string
      metadata?: Record<string, any>
    }
  ): IRecordingServerLog | undefined {
    const room = this.rooms.get(roomId)
    if (!room) return undefined

    const now = Date.now()
    const baseStart = room.recording.startedAt || room.startedAt || room.createdAt
    const offsetMs = Math.max(0, now - baseStart)

    const logItem: IRecordingServerLog = {
      timestamp: now,
      offsetMs,
      type: entry.type,
      actorId: entry.actorId,
      actorName: entry.actorName,
      actorRole: entry.actorRole,
      message: entry.message,
      metadata: entry.metadata,
    }

    room.recording.serverLogs.push(logItem)

    if (mongoose.connection.readyState === 1) {
      ClassroomSession.updateOne(
        { roomName: roomId },
        {
          $push: {
            'recording.serverLogs': {
              timestamp: new Date(now),
              offsetMs,
              type: entry.type,
              actorId: entry.actorId,
              actorName: entry.actorName,
              actorRole: entry.actorRole,
              message: entry.message,
              metadata: entry.metadata,
            },
          },
        }
      ).catch(err => logger.error(`[RoomManager] Failed to push server log to DB:`, err))
    }

    return logItem
  }

  static appendWhiteboardTimeline(roomId: string, action: string, payload?: any): void {
    const room = this.rooms.get(roomId)
    if (!room) return

    const now = Date.now()
    const baseStart = room.recording.startedAt || room.startedAt || room.createdAt
    const offsetMs = Math.max(0, now - baseStart)

    const item = {
      timestamp: now,
      offsetMs,
      page: room.whiteboard.currentPage,
      action,
      payload,
    }
    room.recording.whiteboardTimeline.push(item)

    if (mongoose.connection.readyState === 1) {
      ClassroomSession.updateOne(
        { roomName: roomId },
        {
          $push: {
            'recording.whiteboardTimeline': {
              timestamp: new Date(now),
              offsetMs,
              page: room.whiteboard.currentPage,
              action,
              payload,
            },
          },
        }
      ).catch(err => logger.error(`[RoomManager] Failed to push whiteboard timeline to DB:`, err))
    }
  }

  static appendRecordingChunk(
    roomId: string,
    chunk: Buffer
  ): { chunksCount: number; fileSize: number; videoUrl?: string } | undefined {
    const room = this.rooms.get(roomId) || this.completedRooms.get(roomId)
    if (!room || !chunk || chunk.length === 0) return undefined

    this.ensureRecordingsDir()
    if (!room.recording.filePath) {
      const safeRoom = roomId.replace(/[^a-zA-Z0-9_-]/g, '_')
      const fileName = `${safeRoom}-${Date.now()}.webm`
      room.recording.filePath = path.join(RECORDINGS_DIR, fileName)
      room.recording.videoUrl = `/uploads/class-recordings/${fileName}`
    }

    fs.appendFileSync(room.recording.filePath, chunk)
    room.recording.chunksCount += 1
    room.recording.fileSize += chunk.length

    const now = Date.now()
    const startedAt = room.recording.startedAt || room.startedAt || room.createdAt
    const durationSeconds = Math.max(1, Math.round((now - startedAt) / 1000))
    const retentionHours = this.retentionHoursCache
    const expiresAt =
      retentionHours > 0 ? new Date(now + retentionHours * 3600 * 1000) : undefined
    room.recording.expiresAt = expiresAt ? expiresAt.getTime() : undefined

    this.persistRecordingSnapshot(room, durationSeconds, expiresAt)

    return {
      chunksCount: room.recording.chunksCount,
      fileSize: room.recording.fileSize,
      videoUrl: room.recording.videoUrl,
    }
  }

  static addParticipant(
    roomId: string,
    participant: INativeParticipant,
    formAnswers?: Record<string, any>
  ): { added: boolean; autoStartedRecording: boolean } {
    const room = this.rooms.get(roomId)
    if (!room) return { added: false, autoStartedRecording: false }

    if (room.participants.size >= room.maxParticipants && !room.participants.has(participant.peerId)) {
      return { added: false, autoStartedRecording: false }
    }

    const wasEmpty = room.participants.size === 0
    room.participants.set(participant.peerId, participant)

    // Track cumulative attendee presence (low-overhead in-memory + DB sync)
    this.trackAttendeeJoin(roomId, participant, formAnswers)
    ServerTelemetrySampler.onRoomParticipantChange(room)

    let autoStartedRecording = false
    if (!room.isTestRoom && (wasEmpty || (!room.recording.isRecording && room.recording.status === 'idle'))) {
      this.startRecording(roomId, 'auto', {
        peerId: participant.peerId,
        name: participant.name,
        role: participant.role,
      })
      autoStartedRecording = true
    } else if (room.recording.isRecording) {
      this.assignRecorderPeer(room)
    }

    this.appendRecordingLog(roomId, {
      type: 'participant_joined',
      actorId: participant.peerId,
      actorName: participant.name,
      actorRole: participant.role,
      message: `${roleLabelFa(participant.role)} «${participant.name}» وارد کلاس شد`,
      metadata: {
        role: participant.role,
        participantsCount: room.participants.size,
      },
    })

    // Async log participant to DB if connected
    if (mongoose.connection.readyState === 1) {
      ClassroomSession.updateOne(
        { roomName: roomId },
        {
          $push: {
            participantsLog: {
              identity: participant.peerId,
              name: participant.name,
              role: participant.role,
              joinedAt: new Date(participant.joinedAt),
              clientPlatform: 'native_webrtc_web',
            },
          },
        }
      ).catch(err => logger.error(`[RoomManager] Failed to log participant in DB:`, err))
    }

    return { added: true, autoStartedRecording }
  }

  static removeParticipant(roomId: string, peerId: string): INativeParticipant | undefined {
    const room = this.rooms.get(roomId)
    if (!room) return undefined

    const participant = room.participants.get(peerId)
    if (participant) {
      participant.connectionState = 'disconnected'
      room.participants.delete(peerId)

      this.appendRecordingLog(roomId, {
        type: 'participant_left',
        actorId: participant.peerId,
        actorName: participant.name,
        actorRole: participant.role,
        message: `${roleLabelFa(participant.role)} «${participant.name}» از کلاس خارج شد`,
        metadata: {
          role: participant.role,
          remainingParticipants: room.participants.size,
        },
      })

      if (room.recording.isRecording) {
        this.assignRecorderPeer(room)
      }

      this.trackAttendeeLeave(roomId, peerId, participant.attendeeKey)
      ServerTelemetrySampler.onRoomParticipantChange(room)

      // Update leftAt in DB if connected
      if (mongoose.connection.readyState === 1) {
        ClassroomSession.updateOne(
          { roomName: roomId, 'participantsLog.identity': peerId },
          { $set: { 'participantsLog.$.leftAt': new Date() } }
        ).catch(err => logger.error(`[RoomManager] Failed to update participant leftAt in DB:`, err))
      }
    }

    return participant
  }

  static updateMicrophoneState(
    roomId: string,
    peerId: string,
    state: MicrophoneState
  ): INativeParticipant | undefined {
    const room = this.rooms.get(roomId)
    if (!room) return undefined

    const participant = room.participants.get(peerId)
    if (participant) {
      participant.micState = state
      const stateStr = String(state)
      const actionDesc =
        stateStr === 'enabled' || stateStr === 'unmuted'
          ? 'روشن کرد 🎙️'
          : stateStr === 'blocked'
            ? 'قفل شد 🔒'
            : 'خاموش کرد 🔇'
      this.appendRecordingLog(roomId, {
        type: 'mic_changed',
        actorId: participant.peerId,
        actorName: participant.name,
        actorRole: participant.role,
        message: `${roleLabelFa(participant.role)} «${participant.name}» میکروفون را ${actionDesc}`,
        metadata: { micState: state },
      })
      return participant
    }
    return undefined
  }

  static updateCameraState(
    roomId: string,
    peerId: string,
    enabled: boolean
  ): INativeParticipant | undefined {
    const room = this.rooms.get(roomId)
    if (!room) return undefined

    const participant = room.participants.get(peerId)
    if (participant) {
      participant.cameraEnabled = enabled
      this.appendRecordingLog(roomId, {
        type: 'camera_changed',
        actorId: participant.peerId,
        actorName: participant.name,
        actorRole: participant.role,
        message: `${roleLabelFa(participant.role)} «${participant.name}» وب‌کم را ${
          enabled ? 'روشن کرد 📹' : 'خاموش کرد'
        }`,
        metadata: { cameraEnabled: enabled },
      })
      return participant
    }
    return undefined
  }

  static updateScreenShareState(
    roomId: string,
    peerId: string,
    enabled: boolean
  ): INativeParticipant | undefined {
    const room = this.rooms.get(roomId)
    if (!room) return undefined

    const participant = room.participants.get(peerId)
    if (participant) {
      participant.screenShareEnabled = enabled
      this.appendRecordingLog(roomId, {
        type: 'screen_share_changed',
        actorId: participant.peerId,
        actorName: participant.name,
        actorRole: participant.role,
        message: `${roleLabelFa(participant.role)} «${participant.name}» اشتراک صفحه را ${
          enabled ? 'آغاز کرد 🖥️' : 'متوقف کرد'
        }`,
        metadata: { screenShareEnabled: enabled },
      })
      return participant
    }
    return undefined
  }

  static appendChatMessage(roomId: string, chatMsg: IChatMessage): IChatMessage | undefined {
    const room = this.rooms.get(roomId)
    if (!room) return undefined

    const baseStart = room.recording.startedAt || room.startedAt || room.createdAt
    const offsetMs = Math.max(0, chatMsg.timestamp - baseStart)
    const enriched: IChatMessage = {
      ...chatMsg,
      offsetMs,
    }
    room.chatMessages.push(enriched)

    this.appendRecordingLog(roomId, {
      type: 'chat_message',
      actorId: chatMsg.senderId,
      actorName: chatMsg.senderName,
      actorRole: chatMsg.senderRole,
      message: `پیام چت از ${roleLabelFa(chatMsg.senderRole)} «${chatMsg.senderName}»: ${chatMsg.message}`,
      metadata: { chatId: chatMsg.id },
    })

    if (mongoose.connection.readyState === 1) {
      ClassroomSession.updateOne(
        { roomName: roomId },
        {
          $push: {
            'recording.chatLog': {
              id: enriched.id,
              senderId: enriched.senderId,
              senderName: enriched.senderName,
              senderRole: enriched.senderRole,
              message: enriched.message,
              timestamp: new Date(enriched.timestamp),
              offsetMs,
            },
          },
        }
      ).catch(err => logger.error(`[RoomManager] Failed to push chat message to DB:`, err))
    }

    return enriched
  }

  static endRoom(
    roomId: string,
    actor?: { peerId?: string; name?: string; role?: 'teacher' | 'student' | 'admin' | 'system' }
  ): boolean {
    const room = this.rooms.get(roomId)
    if (!room) return false

    this.appendRecordingLog(roomId, {
      type: 'room_ended',
      actorId: actor?.peerId,
      actorName: actor?.name || 'استاد / سیستم',
      actorRole: actor?.role || 'system',
      message: `کلاس توسط ${actor?.name || 'استاد / سیستم'} به پایان رسید`,
    })

    // Close all active attendee sessions before closing the room
    const nowDate = new Date()
    const attendeeMap = this.roomAttendees.get(roomId)
    if (attendeeMap) {
      for (const att of attendeeMap.values()) {
        if (att.isOnline) {
          for (const sess of att.sessions) {
            if (!sess.leftAt) {
              sess.leftAt = nowDate
              sess.durationSeconds = Math.max(
                0,
                Math.round((nowDate.getTime() - new Date(sess.joinedAt).getTime()) / 1000)
              )
              att.totalDurationSeconds += sess.durationSeconds
            }
          }
          att.lastLeftAt = nowDate
          att.isOnline = false
          att.activePeerIds = []
        }
      }
      this.syncAttendeesToDb(roomId, attendeeMap)
    }

    this.stopRecording(roomId, actor, `پایان کلاس و ذخیره نهایی ضبط`)

    room.status = 'ended'
    room.endedAt = Date.now()
    const totalDuration = Math.max(1, Math.round((room.endedAt - (room.startedAt || room.createdAt)) / 1000))
    this.rooms.delete(roomId)
    ServerTelemetrySampler.flushAndCleanupRoom(roomId)

    // Mark as completed in DB if connected
    if (mongoose.connection.readyState === 1) {
      ClassroomSession.updateOne(
        { roomName: roomId },
        {
          $set: {
            status: 'completed',
            endedAt: new Date(room.endedAt),
            durationSeconds: totalDuration,
          },
        }
      ).catch(err => logger.error(`[RoomManager] Failed to mark room ended in DB:`, err))
    }

    return true
  }

  private static resolveAttendeeKey(participant: {
    attendeeKey?: string
    userId?: string
    peerId: string
    name: string
    role: string
  }): string {
    if (participant.attendeeKey?.trim()) return participant.attendeeKey.trim()
    if (participant.userId && !participant.userId.startsWith('guest_')) {
      return `user:${participant.userId}`
    }
    return `peer:${participant.name.trim()}:${participant.role}`
  }

  static trackAttendeeRegistration(
    roomId: string,
    attendeeKey: string,
    displayName: string,
    formAnswers?: Record<string, any>
  ) {
    let attendeeMap = this.roomAttendees.get(roomId)
    if (!attendeeMap) {
      attendeeMap = new Map<string, ISeminarAttendeeRecord>()
      this.roomAttendees.set(roomId, attendeeMap)
    }
    const existing = attendeeMap.get(attendeeKey)
    const now = new Date()
    if (existing) {
      existing.displayName = displayName || existing.displayName
      if (formAnswers && Object.keys(formAnswers).length > 0) {
        existing.formAnswers = { ...(existing.formAnswers || {}), ...formAnswers }
      }
    } else {
      attendeeMap.set(attendeeKey, {
        attendeeKey,
        displayName,
        role: 'student',
        formAnswers: formAnswers || {},
        registeredAt: now,
        joinCount: 0,
        totalDurationSeconds: 0,
        isOnline: false,
        activePeerIds: [],
        sessions: [],
      })
    }
  }

  private static trackAttendeeJoin(
    roomId: string,
    participant: INativeParticipant,
    formAnswers?: Record<string, any>
  ) {
    const key = this.resolveAttendeeKey(participant)
    participant.attendeeKey = key

    let attendeeMap = this.roomAttendees.get(roomId)
    if (!attendeeMap) {
      attendeeMap = new Map<string, ISeminarAttendeeRecord>()
      this.roomAttendees.set(roomId, attendeeMap)
    }

    const now = new Date(participant.joinedAt || Date.now())
    let record = attendeeMap.get(key)
    if (!record) {
      record = {
        attendeeKey: key,
        displayName: participant.name,
        role: participant.role,
        formAnswers: formAnswers || {},
        firstJoinedAt: now,
        lastJoinedAt: now,
        joinCount: 1,
        totalDurationSeconds: 0,
        isOnline: true,
        activePeerIds: [participant.peerId],
        sessions: [{ peerId: participant.peerId, joinedAt: now, durationSeconds: 0 }],
      }
      attendeeMap.set(key, record)
    } else {
      record.displayName = participant.name || record.displayName
      record.role = participant.role || record.role
      if (formAnswers && Object.keys(formAnswers).length > 0) {
        record.formAnswers = { ...(record.formAnswers || {}), ...formAnswers }
      }
      if (!record.firstJoinedAt) record.firstJoinedAt = now
      record.lastJoinedAt = now
      record.joinCount += 1
      record.isOnline = true
      if (!record.activePeerIds.includes(participant.peerId)) {
        record.activePeerIds.push(participant.peerId)
      }
      record.sessions.push({ peerId: participant.peerId, joinedAt: now, durationSeconds: 0 })
    }

    this.syncAttendeesToDb(roomId, attendeeMap)
  }

  private static trackAttendeeLeave(roomId: string, peerId: string, attendeeKey?: string) {
    const attendeeMap = this.roomAttendees.get(roomId)
    if (!attendeeMap) return

    let record = attendeeKey ? attendeeMap.get(attendeeKey) : undefined
    if (!record) {
      for (const att of attendeeMap.values()) {
        if (att.activePeerIds.includes(peerId) || att.sessions.some(s => s.peerId === peerId && !s.leftAt)) {
          record = att
          break
        }
      }
    }
    if (!record) return

    const now = new Date()
    record.activePeerIds = record.activePeerIds.filter(id => id !== peerId)
    const openSession = [...record.sessions].reverse().find(s => (!peerId || s.peerId === peerId) && !s.leftAt)
    if (openSession) {
      openSession.leftAt = now
      openSession.durationSeconds = Math.max(
        0,
        Math.round((now.getTime() - new Date(openSession.joinedAt).getTime()) / 1000)
      )
      record.totalDurationSeconds += openSession.durationSeconds
    }
    record.lastLeftAt = now
    record.isOnline = record.activePeerIds.length > 0

    this.syncAttendeesToDb(roomId, attendeeMap)
  }

  private static syncAttendeesToDb(roomId: string, attendeeMap: Map<string, ISeminarAttendeeRecord>) {
    if (mongoose.connection.readyState !== 1) return
    const serialized = Array.from(attendeeMap.values()).map(att => ({
      ...att,
      sessions: att.sessions.slice(-50),
    }))
    ClassroomSession.updateOne(
      { roomName: roomId },
      { $set: { attendees: serialized } }
    ).catch(err => logger.error(`[RoomManager] Failed syncing attendees for room ${roomId}:`, err))
  }

  static getAttendanceSnapshot(roomId: string, dbAttendees: ISeminarAttendeeRecord[] = []) {
    const memMap = this.roomAttendees.get(roomId)
    const merged = new Map<string, ISeminarAttendeeRecord>()

    for (const dbItem of dbAttendees) {
      if (dbItem?.attendeeKey) {
        merged.set(dbItem.attendeeKey, dbItem)
      }
    }
    if (memMap) {
      for (const [k, memItem] of memMap.entries()) {
        merged.set(k, memItem)
      }
    }

    const nowMs = Date.now()
    return Array.from(merged.values()).map(att => {
      let liveExtraSeconds = 0
      if (att.isOnline) {
        for (const sess of att.sessions || []) {
          if (!sess.leftAt) {
            liveExtraSeconds += Math.max(0, Math.round((nowMs - new Date(sess.joinedAt).getTime()) / 1000))
          }
        }
      }
      return {
        ...att,
        effectiveDurationSeconds: (att.totalDurationSeconds || 0) + liveExtraSeconds,
      }
    })
  }

  static setParticipantHandRaised(roomId: string, peerId: string, raised: boolean): boolean {
    const room = this.rooms.get(roomId)
    const participant = room?.participants.get(peerId)
    if (!participant) return false
    participant.handRaised = raised
    return true
  }

  static setParticipantSpeaker(roomId: string, peerId: string, isSpeaker: boolean): INativeParticipant | null {
    const room = this.rooms.get(roomId)
    const participant = room?.participants.get(peerId)
    if (!participant) return null
    participant.isSpeaker = isSpeaker
    if (isSpeaker) {
      participant.handRaised = false
      if (participant.micState === 'blocked') {
        participant.micState = 'disabled'
      }
    } else if (room?.uiMode === 'seminar' && participant.role !== 'teacher' && participant.role !== 'admin' && !participant.isModerator) {
      participant.micState = 'blocked'
      participant.cameraEnabled = false
    }
    return participant
  }

  static setParticipantModerator(roomId: string, peerId: string, isModerator: boolean): INativeParticipant | null {
    const room = this.rooms.get(roomId)
    const participant = room?.participants.get(peerId)
    if (!participant) return null
    participant.isModerator = isModerator
    if (isModerator) {
      participant.isSpeaker = true
      participant.handRaised = false
      if (participant.micState === 'blocked') {
        participant.micState = 'disabled'
      }
    } else if (room?.uiMode === 'seminar' && participant.role !== 'teacher' && participant.role !== 'admin') {
      participant.isSpeaker = false
      participant.micState = 'blocked'
      participant.cameraEnabled = false
    }
    return participant
  }

  static createPoll(
    roomId: string,
    creator: { peerId: string; name: string },
    input: { question: string; options: string[]; allowMultiple?: boolean }
  ): INativeRoomPoll | null {
    const room = this.rooms.get(roomId)
    if (!room) return null
    const cleanQuestion = String(input.question || '').trim()
    const cleanOptions = (input.options || [])
      .map(o => String(o || '').trim())
      .filter(Boolean)
      .slice(0, 8)
    if (!cleanQuestion || cleanOptions.length < 2) return null

    const poll: INativeRoomPoll = {
      id: `poll_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      question: cleanQuestion,
      allowMultiple: !!input.allowMultiple,
      isClosed: false,
      createdByPeerId: creator.peerId,
      createdByName: creator.name,
      createdAt: Date.now(),
      options: cleanOptions.map((text, idx) => ({ id: `opt_${idx + 1}`, text })),
      votesByVoter: {},
    }
    room.polls.unshift(poll)
    this.syncPollsToDb(roomId, room.polls)
    return poll
  }

  static votePoll(roomId: string, pollId: string, voterKey: string, optionIds: string[]): boolean {
    const room = this.rooms.get(roomId)
    const poll = room?.polls.find(p => p.id === pollId)
    if (!poll || poll.isClosed) return false
    const validIds = new Set(poll.options.map(o => o.id))
    let chosen = (optionIds || []).filter(id => validIds.has(id))
    if (!poll.allowMultiple && chosen.length > 1) {
      chosen = [chosen[0]]
    }
    if (chosen.length === 0) return false
    poll.votesByVoter[voterKey] = chosen
    this.syncPollsToDb(roomId, room!.polls)
    return true
  }

  static closePoll(roomId: string, pollId: string): boolean {
    const room = this.rooms.get(roomId)
    const poll = room?.polls.find(p => p.id === pollId)
    if (!poll || poll.isClosed) return false
    poll.isClosed = true
    poll.closedAt = Date.now()
    this.syncPollsToDb(roomId, room!.polls)
    return true
  }

  static serializePolls(polls: INativeRoomPoll[] = [], myVoterKey?: string) {
    return polls.map(poll => {
      const voterEntries = Object.entries(poll.votesByVoter || {})
      const counts: Record<string, number> = {}
      for (const opt of poll.options) counts[opt.id] = 0
      for (const [, chosenIds] of voterEntries) {
        for (const oid of chosenIds || []) {
          if (counts[oid] !== undefined) counts[oid] += 1
        }
      }
      return {
        id: poll.id,
        question: poll.question,
        allowMultiple: !!poll.allowMultiple,
        isClosed: poll.isClosed,
        createdByName: poll.createdByName,
        createdAt: poll.createdAt,
        closedAt: poll.closedAt,
        totalVoters: voterEntries.length,
        myOptionIds: myVoterKey ? poll.votesByVoter?.[myVoterKey] || [] : [],
        options: poll.options.map(opt => ({
          id: opt.id,
          text: opt.text,
          votes: counts[opt.id] || 0,
        })),
      }
    })
  }

  private static syncPollsToDb(roomId: string, polls: INativeRoomPoll[]) {
    if (mongoose.connection.readyState !== 1) return
    ClassroomSession.updateOne({ roomName: roomId }, { $set: { polls } }).catch(err =>
      logger.error(`[RoomManager] Failed syncing polls for room ${roomId}:`, err)
    )
  }

  static async cleanupExpiredRecordings(): Promise<number> {
    const now = Date.now()
    let deletedCount = 0

    // 1. Clean in-memory completed rooms
    for (const [, room] of this.completedRooms.entries()) {
      if (
        room.recording.status === 'completed' &&
        room.recording.expiresAt &&
        room.recording.expiresAt <= now
      ) {
        if (room.recording.filePath && fs.existsSync(room.recording.filePath)) {
          try {
            fs.unlinkSync(room.recording.filePath)
          } catch (err) {
            logger.error('[RoomManager] Failed to unlink expired recording file:', err)
          }
        }
        room.recording.status = 'deleted'
        room.recording.videoUrl = undefined
        room.recording.serverLogs.push({
          timestamp: now,
          offsetMs: room.recording.startedAt ? Math.max(0, now - room.recording.startedAt) : 0,
          type: 'system',
          actorName: 'سیستم',
          actorRole: 'system',
          message: 'فایل ویدیوی ضبط‌شده پس از پایان مهلت نگهداری به صورت خودکار حذف شد',
        })
        deletedCount += 1
      }
    }

    // 2. Clean DB sessions
    if (mongoose.connection.readyState === 1) {
      try {
        const expiredSessions = await ClassroomSession.find({
          'recording.status': 'completed',
          'recording.expiresAt': { $lte: new Date(now) },
        })
        for (const session of expiredSessions) {
          const videoUrl = session.recording?.videoUrl
          if (videoUrl && videoUrl.startsWith('/uploads/class-recordings/')) {
            const fileName = path.basename(videoUrl)
            const fullPath = path.join(RECORDINGS_DIR, fileName)
            if (fs.existsSync(fullPath)) {
              try {
                fs.unlinkSync(fullPath)
              } catch (err) {
                logger.error('[RoomManager] Failed to unlink DB expired recording file:', err)
              }
            }
          }
          if (session.recording) {
            session.recording.status = 'deleted'
            session.recording.deletedAt = new Date(now)
            session.recording.videoUrl = undefined
            session.recording.serverLogs.push({
              timestamp: new Date(now),
              offsetMs: session.recording.startedAt
                ? Math.max(0, now - new Date(session.recording.startedAt).getTime())
                : 0,
              type: 'system',
              actorName: 'سیستم',
              actorRole: 'system',
              message: 'فایل ویدیوی ضبط‌شده پس از پایان مهلت نگهداری به صورت خودکار حذف شد',
            })
            await session.save()
            deletedCount += 1
          }
        }
      } catch (err) {
        logger.error('[RoomManager] Error cleaning expired recordings in DB:', err)
      }
    }

    return deletedCount
  }

  static getActiveParticipantsList(roomId: string): INativeParticipant[] {
    const room = this.rooms.get(roomId)
    if (!room) return []
    return Array.from(room.participants.values())
  }
}

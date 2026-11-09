import mongoose from 'mongoose'
import { INativeParticipant, INativeRoom, MicrophoneState } from '../types/native.types.js'
import { ClassroomSession } from '../../models/ClassroomSession.js'
import { logger } from '../../../../core/utils/logger.js'

export class RoomManager {
  private static rooms = new Map<string, INativeRoom>()

  /**
   * Get an existing room from memory or initialize it from database
   */
  static async getOrCreateRoom(
    roomId: string,
    initialTitle = 'کلاس آنلاین کیتایار',
    teacherId?: string,
    maxParticipants = 8
  ): Promise<INativeRoom> {
    let room = this.rooms.get(roomId)
    if (room) {
      return room
    }

    // Try loading session metadata from database if connected
    let title = initialTitle
    let dbTeacherId = teacherId
    let max = maxParticipants

    if (mongoose.connection.readyState === 1) {
      try {
        const session = await ClassroomSession.findOne({ roomName: roomId })
        if (session) {
          title = session.title || title
          dbTeacherId = session.teacherId?.toString() || dbTeacherId
          max = session.maxParticipants || max
        }
      } catch (err) {
        logger.error(`[RoomManager] Error querying db for room ${roomId}:`, err)
      }
    }

    room = {
      roomId,
      title,
      teacherId: dbTeacherId,
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
      createdAt: Date.now(),
      startedAt: Date.now(),
    }

    this.rooms.set(roomId, room)

    // Update DB status to active if connected
    if (mongoose.connection.readyState === 1) {
      ClassroomSession.updateOne(
        { roomName: roomId },
        { $set: { status: 'active', startedAt: new Date() } }
      ).catch(err => logger.error(`[RoomManager] Failed to update room start in DB:`, err))
    }

    return room
  }

  static getRoom(roomId: string): INativeRoom | undefined {
    return this.rooms.get(roomId)
  }

  static addParticipant(roomId: string, participant: INativeParticipant): boolean {
    const room = this.rooms.get(roomId)
    if (!room) return false

    if (room.participants.size >= room.maxParticipants && !room.participants.has(participant.peerId)) {
      return false
    }

    room.participants.set(participant.peerId, participant)

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

    return true
  }

  static removeParticipant(roomId: string, peerId: string): INativeParticipant | undefined {
    const room = this.rooms.get(roomId)
    if (!room) return undefined

    const participant = room.participants.get(peerId)
    if (participant) {
      participant.connectionState = 'disconnected'
      room.participants.delete(peerId)

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
      return participant
    }
    return undefined
  }

  static endRoom(roomId: string): boolean {
    const room = this.rooms.get(roomId)
    if (!room) return false

    room.status = 'ended'
    room.endedAt = Date.now()
    this.rooms.delete(roomId)

    // Mark as completed in DB if connected
    if (mongoose.connection.readyState === 1) {
      ClassroomSession.updateOne(
        { roomName: roomId },
        {
          $set: {
            status: 'completed',
            endedAt: new Date(),
            durationSeconds: Math.round((Date.now() - (room.startedAt || room.createdAt)) / 1000),
          },
        }
      ).catch(err => logger.error(`[RoomManager] Failed to mark room ended in DB:`, err))
    }

    return true
  }

  static getActiveParticipantsList(roomId: string): INativeParticipant[] {
    const room = this.rooms.get(roomId)
    if (!room) return []
    return Array.from(room.participants.values())
  }
}

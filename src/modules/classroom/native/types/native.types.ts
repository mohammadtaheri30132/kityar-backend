export type ParticipantRole = 'teacher' | 'student' | 'admin'

export type ParticipantConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'removed'

export type MicrophoneState = 'enabled' | 'disabled' | 'blocked'

export interface INativeParticipant {
  peerId: string
  userId?: string
  name: string
  role: ParticipantRole
  micState: MicrophoneState
  cameraEnabled?: boolean
  screenShareEnabled?: boolean
  connectionState: ParticipantConnectionState
  joinedAt: number
  isTeacher: boolean
}

export interface IWhiteboardState {
  currentPage: number
  totalPages: number
  gridMode: 'blank' | 'grid' | 'lined' | 'dots'
  allowStudentDraw: boolean
  pages: Record<number, any[]>
  pageBackgrounds: Record<number, string>
  activeFileName?: string
}

export interface IChatMessage {
  id: string
  senderPeerId: string
  senderName: string
  senderRole: ParticipantRole
  text: string
  fileUrl?: string
  fileName?: string
  timestamp: number
}

export interface INativeRoom {
  roomId: string
  title: string
  teacherId?: string
  status: 'scheduled' | 'active' | 'ended'
  maxParticipants: number
  participants: Map<string, INativeParticipant>
  whiteboard: IWhiteboardState
  chatMessages: IChatMessage[]
  createdAt: number
  startedAt?: number
  endedAt?: number
}

export interface SignalingIceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

export interface SignalingIncomingMessage {
  type:
    | 'join_room'
    | 'offer'
    | 'answer'
    | 'ice_candidate'
    | 'set_microphone'
    | 'set_camera'
    | 'set_screen_share'
    | 'whiteboard_action'
    | 'chat_message'
    | 'teacher_set_permission'
    | 'teacher_remove_participant'
    | 'teacher_end_room'
    | 'leave_room'
    | 'ping'
  roomId: string
  targetPeerId?: string
  sdp?: any
  candidate?: any
  enabled?: boolean
  micBlocked?: boolean
  token?: string
  ticketCode?: string
  displayName?: string
  requestedRole?: 'teacher' | 'student'
  action?: string
  text?: string
  fileUrl?: string
  fileName?: string
  payload?: any
}

export interface SignalingOutgoingMessage {
  type:
    | 'room_joined'
    | 'participant_joined'
    | 'participant_left'
    | 'offer'
    | 'answer'
    | 'ice_candidate'
    | 'microphone_state_changed'
    | 'camera_state_changed'
    | 'screen_share_state_changed'
    | 'whiteboard_update'
    | 'chat_message'
    | 'permission_state_changed'
    | 'participant_removed'
    | 'room_ended'
    | 'pong'
    | 'error'
  roomId?: string
  fromPeerId?: string
  targetPeerId?: string
  payload?: any
  timestamp?: number
}


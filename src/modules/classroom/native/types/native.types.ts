export type ParticipantRole = 'teacher' | 'student' | 'admin'

export type ParticipantConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'removed'

export type MicrophoneState = 'enabled' | 'disabled' | 'blocked'

export type NativeRoomUiMode = 'online_class' | 'seminar'

export interface INativeParticipant {
  peerId: string
  userId?: string
  attendeeKey?: string
  name: string
  role: ParticipantRole
  micState: MicrophoneState
  cameraEnabled?: boolean
  screenShareEnabled?: boolean
  handRaised?: boolean
  isSpeaker?: boolean
  isModerator?: boolean
  connectionState: ParticipantConnectionState
  joinedAt: number
  isTeacher: boolean
}

export interface INativeRoomPoll {
  id: string
  question: string
  allowMultiple?: boolean
  isClosed: boolean
  createdByPeerId?: string
  createdByName: string
  createdAt: number
  closedAt?: number
  options: Array<{ id: string; text: string }>
  votesByVoter: Record<string, string[]>
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
  senderPeerId?: string
  senderId?: string
  senderName: string
  senderRole: ParticipantRole
  text?: string
  message?: string
  fileUrl?: string
  fileName?: string
  timestamp: number
  offsetMs?: number
}

export interface IRecordingServerLog {
  id?: string
  timestamp: number
  offsetMs: number
  type:
    | 'recording_started'
    | 'recording_stopped'
    | 'participant_joined'
    | 'participant_left'
    | 'participant_removed'
    | 'mic_changed'
    | 'camera_changed'
    | 'screen_share_changed'
    | 'whiteboard_action'
    | 'chat_message'
    | 'permission_changed'
    | 'room_ended'
    | 'system'
  actorId?: string
  actorName?: string
  actorRole?: ParticipantRole | 'system'
  peerId?: string
  message: string
  metadata?: Record<string, any>
  payload?: any
}

export interface INativeRoomRecording {
  isRecording: boolean
  status: 'idle' | 'recording' | 'completed' | 'deleted'
  mode: 'auto' | 'manual_test'
  startedAt?: number
  endedAt?: number
  expiresAt?: number
  durationSeconds?: number
  videoUrl?: string
  filePath?: string
  fileSize: number
  recorderPeerId?: string
  chunksCount: number
  serverLogs: IRecordingServerLog[]
  whiteboardTimeline: Array<{
    timestamp: number
    offsetMs: number
    page?: number
    action: string
    payload?: any
  }>
}

export interface INativeRoom {
  roomId: string
  title: string
  uiMode?: NativeRoomUiMode
  teacherId?: string
  isTestRoom?: boolean
  status: 'scheduled' | 'active' | 'ended'
  maxParticipants: number
  participants: Map<string, INativeParticipant>
  whiteboard: IWhiteboardState
  chatMessages: IChatMessage[]
  polls: INativeRoomPoll[]
  recording: INativeRoomRecording
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
    | 'start_recording'
    | 'stop_recording'
    | 'teacher_set_permission'
    | 'teacher_mute_all'
    | 'teacher_remove_participant'
    | 'teacher_end_room'
    | 'raise_hand'
    | 'grant_speaker'
    | 'revoke_speaker'
    | 'grant_moderator'
    | 'revoke_moderator'
    | 'create_poll'
    | 'vote_poll'
    | 'close_poll'
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
  attendeeKey?: string
  formAnswers?: Record<string, any>
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
    | 'hand_raise_changed'
    | 'speaker_status_changed'
    | 'moderator_status_changed'
    | 'polls_sync'
    | 'seminar_attendees_sync'
    | 'whiteboard_update'
    | 'chat_message'
    | 'recording_state_changed'
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


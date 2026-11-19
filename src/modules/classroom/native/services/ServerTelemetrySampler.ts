import os from 'os'
import { monitorEventLoopDelay, IntervalHistogram } from 'perf_hooks'
import mongoose from 'mongoose'
import {
  ClassroomSession,
  ClassroomUiMode,
  ISessionTelemetrySummary,
  ITelemetrySampleSnapshot,
} from '../../models/ClassroomSession.js'
import { INativeRoom } from '../types/native.types.js'
import { logger } from '../../../../core/utils/logger.js'

interface RoomTelemetryAccumulator {
  roomId: string
  uiMode: ClassroomUiMode
  startedAt: number
  peakConcurrentParticipants: number
  peakCpuPercent: number
  peakRssMb: number
  peakEventLoopLagP95Ms: number
  wsMessagesReceived: number
  wsMessagesBroadcast: number
  samples: ITelemetrySampleSnapshot[]
}

const SAMPLE_INTERVAL_MS = 10_000
const MAX_GLOBAL_SAMPLES = 120
const MAX_ROOM_SAMPLES = 180

export class ServerTelemetrySampler {
  private static timer: NodeJS.Timeout | null = null
  private static elMonitor: IntervalHistogram | null = null
  private static prevCpuUsage = process.cpuUsage()
  private static prevHrTimeNs = process.hrtime.bigint()
  private static wsInTotal = 0
  private static wsOutTotal = 0
  private static wsInWindow = 0
  private static wsOutWindow = 0
  private static baselineCpuPercent: number | null = null
  private static baselineRssMb: number | null = null
  private static globalSamples: ITelemetrySampleSnapshot[] = []
  private static roomAccumulators = new Map<string, RoomTelemetryAccumulator>()
  private static roomsProvider: (() => Map<string, INativeRoom>) | null = null

  static registerRoomsProvider(provider: () => Map<string, INativeRoom>) {
    this.roomsProvider = provider
  }

  static recordWsIn() {
    this.wsInTotal += 1
    this.wsInWindow += 1
  }

  static recordWsOut(deliveries = 1) {
    this.wsOutTotal += deliveries
    this.wsOutWindow += deliveries
  }

  static recordRoomWs(roomId: string, direction: 'in' | 'out', count = 1) {
    if (direction === 'in') {
      this.recordWsIn()
    } else {
      this.recordWsOut(count)
    }

    const acc = this.roomAccumulators.get(roomId)
    if (acc) {
      if (direction === 'in') acc.wsMessagesReceived += count
      else acc.wsMessagesBroadcast += count
    }
  }

  static onRoomParticipantChange(room: INativeRoom) {
    let acc = this.roomAccumulators.get(room.roomId)
    if (!acc) {
      acc = {
        roomId: room.roomId,
        uiMode: room.uiMode || 'online_class',
        startedAt: room.startedAt || Date.now(),
        peakConcurrentParticipants: 0,
        peakCpuPercent: 0,
        peakRssMb: 0,
        peakEventLoopLagP95Ms: 0,
        wsMessagesReceived: 0,
        wsMessagesBroadcast: 0,
        samples: [],
      }
      this.roomAccumulators.set(room.roomId, acc)
    }
    acc.uiMode = room.uiMode || acc.uiMode
    if (room.participants.size > acc.peakConcurrentParticipants) {
      acc.peakConcurrentParticipants = room.participants.size
    }

    this.ensureSamplingIfNeeded()
    if (acc.samples.length === 0 && room.participants.size > 0) {
      this.captureSample()
    }
  }

  static estimateRoomPeerLinks(room: INativeRoom): number {
    const n = room.participants.size
    if (n <= 1) return 0
    if (room.uiMode === 'seminar') {
      // Stage broadcast topology: speakers/teachers maintain downstream links to audience (O(S * N))
      const speakers = Array.from(room.participants.values()).filter(
        p => p.isTeacher || p.role === 'teacher' || p.isSpeaker
      ).length
      const stageCount = Math.max(1, speakers)
      return Math.max(0, stageCount * (n - 1))
    }
    // Interactive online class uses P2P mesh: N * (N - 1) / 2 bidirectional peer connections
    return Math.round((n * (n - 1)) / 2)
  }

  private static ensureSamplingIfNeeded() {
    const rooms = this.roomsProvider ? this.roomsProvider() : null
    const hasActiveParticipants = rooms
      ? Array.from(rooms.values()).some(r => r.participants.size > 0)
      : this.roomAccumulators.size > 0

    if (hasActiveParticipants && !this.timer) {
      if (!this.elMonitor) {
        this.elMonitor = monitorEventLoopDelay({ resolution: 20 })
        this.elMonitor.enable()
      }
      this.prevCpuUsage = process.cpuUsage()
      this.prevHrTimeNs = process.hrtime.bigint()

      this.timer = setInterval(() => {
        this.captureSample()
      }, SAMPLE_INTERVAL_MS)
      if (this.timer.unref) this.timer.unref()
    } else if (!hasActiveParticipants && this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  static captureSample(): ITelemetrySampleSnapshot {
    const nowNs = process.hrtime.bigint()
    const elapsedUs = Math.max(1000, Number(nowNs - this.prevHrTimeNs) / 1000)
    const cpuDelta = process.cpuUsage(this.prevCpuUsage)
    this.prevCpuUsage = process.cpuUsage()
    this.prevHrTimeNs = nowNs

    const cpuCores = Math.max(1, os.cpus().length)
    // Process CPU % normalized across all available cores (0-100%)
    const totalCpuUs = cpuDelta.user + cpuDelta.system
    const cpuPercent = Number(Math.min(100, (totalCpuUs / (elapsedUs * cpuCores)) * 100).toFixed(2))

    const mem = process.memoryUsage()
    const rssMb = Number((mem.rss / 1024 / 1024).toFixed(1))
    const heapUsedMb = Number((mem.heapUsed / 1024 / 1024).toFixed(1))
    const heapTotalMb = Number((mem.heapTotal / 1024 / 1024).toFixed(1))
    const systemFreeRamMb = Number((os.freemem() / 1024 / 1024).toFixed(0))
    const loadAvg1m = Number((os.loadavg()[0] || 0).toFixed(2))

    let eventLoopLagP95Ms = 0
    if (this.elMonitor) {
      const p95Ns = this.elMonitor.percentile(95)
      eventLoopLagP95Ms = Number.isFinite(p95Ns) ? Number((p95Ns / 1e6).toFixed(2)) : 0
      this.elMonitor.reset()
    }

    const rooms = this.roomsProvider ? this.roomsProvider() : new Map<string, INativeRoom>()
    let activeParticipants = 0
    let activeRooms = 0
    let estimatedPeerLinks = 0

    for (const room of rooms.values()) {
      if (room.participants.size > 0) {
        activeRooms += 1
        activeParticipants += room.participants.size
        estimatedPeerLinks += this.estimateRoomPeerLinks(room)
      }
    }

    const elapsedSec = Math.max(1, elapsedUs / 1_000_000)
    const wsMsgsPerSec = Number(((this.wsInWindow + this.wsOutWindow) / elapsedSec).toFixed(2))
    this.wsInWindow = 0
    this.wsOutWindow = 0

    if (this.baselineCpuPercent === null || activeParticipants <= 1) {
      this.baselineCpuPercent = this.baselineCpuPercent === null ? cpuPercent : Math.min(this.baselineCpuPercent, cpuPercent)
    }
    if (this.baselineRssMb === null || activeParticipants <= 1) {
      this.baselineRssMb = this.baselineRssMb === null ? rssMb : Math.min(this.baselineRssMb, rssMb)
    }

    const snapshot: ITelemetrySampleSnapshot = {
      timestamp: Date.now(),
      cpuPercent,
      loadAvg1m,
      rssMb,
      heapUsedMb,
      heapTotalMb,
      systemFreeRamMb,
      eventLoopLagP95Ms,
      activeParticipants,
      activeRooms,
      wsMsgsPerSec,
      estimatedPeerLinks,
    }

    this.globalSamples.push(snapshot)
    if (this.globalSamples.length > MAX_GLOBAL_SAMPLES) {
      this.globalSamples.shift()
    }

    // Update per-room accumulators
    for (const room of rooms.values()) {
      if (room.participants.size === 0) continue
      const acc = this.roomAccumulators.get(room.roomId)
      if (!acc) continue

      const roomSnapshot: ITelemetrySampleSnapshot = {
        ...snapshot,
        activeParticipants: room.participants.size,
        activeRooms: 1,
        estimatedPeerLinks: this.estimateRoomPeerLinks(room),
      }
      acc.peakConcurrentParticipants = Math.max(acc.peakConcurrentParticipants, room.participants.size)
      acc.peakCpuPercent = Math.max(acc.peakCpuPercent, cpuPercent)
      acc.peakRssMb = Math.max(acc.peakRssMb, rssMb)
      acc.peakEventLoopLagP95Ms = Math.max(acc.peakEventLoopLagP95Ms, eventLoopLagP95Ms)
      acc.samples.push(roomSnapshot)
      if (acc.samples.length > MAX_ROOM_SAMPLES) {
        acc.samples.shift()
      }
    }

    if (activeParticipants === 0) {
      this.ensureSamplingIfNeeded()
    }

    return snapshot
  }

  static getRoomSummary(roomId: string): ISessionTelemetrySummary | null {
    const acc = this.roomAccumulators.get(roomId)
    if (!acc) return null
    return {
      startedAt: new Date(acc.startedAt),
      endedAt: new Date(),
      peakConcurrentParticipants: acc.peakConcurrentParticipants,
      peakCpuPercent: acc.peakCpuPercent,
      peakRssMb: acc.peakRssMb,
      peakEventLoopLagP95Ms: acc.peakEventLoopLagP95Ms,
      wsMessagesReceived: acc.wsMessagesReceived,
      wsMessagesBroadcast: acc.wsMessagesBroadcast,
      samples: acc.samples.slice(-MAX_ROOM_SAMPLES),
    }
  }

  static async flushAndCleanupRoom(roomId: string) {
    const summary = this.getRoomSummary(roomId)
    this.roomAccumulators.delete(roomId)
    this.ensureSamplingIfNeeded()

    if (summary && mongoose.connection.readyState === 1) {
      try {
        await ClassroomSession.updateOne(
          { roomName: roomId },
          { $set: { telemetrySummary: summary } }
        )
      } catch (err) {
        logger.error(`[Telemetry] Failed flushing summary for room ${roomId}:`, err)
      }
    }
  }

  static buildDeveloperReport(params?: {
    roomId?: string
    sessionDoc?: any
    liveRoom?: INativeRoom
  }) {
    const latest = this.captureSample()
    const cpus = os.cpus()
    const totalRamMb = Number((os.totalmem() / 1024 / 1024).toFixed(0))
    const freeRamMb = Number((os.freemem() / 1024 / 1024).toFixed(0))
    const usedSystemRamMb = Math.max(0, totalRamMb - freeRamMb)

    const liveAcc = params?.roomId ? this.roomAccumulators.get(params.roomId) : undefined
    const dbSummary: ISessionTelemetrySummary | undefined = params?.sessionDoc?.telemetrySummary

    const uiMode: ClassroomUiMode =
      params?.liveRoom?.uiMode ||
      liveAcc?.uiMode ||
      params?.sessionDoc?.uiMode ||
      'online_class'

    const samples: ITelemetrySampleSnapshot[] =
      (liveAcc?.samples?.length ? liveAcc.samples : undefined) ||
      (dbSummary?.samples?.length ? dbSummary.samples : undefined) ||
      this.globalSamples

    const peakParticipants = Math.max(
      params?.liveRoom?.participants.size || 0,
      liveAcc?.peakConcurrentParticipants || 0,
      dbSummary?.peakConcurrentParticipants || 0,
      latest.activeParticipants
    )
    const peakCpuPercent = Math.max(
      liveAcc?.peakCpuPercent || 0,
      dbSummary?.peakCpuPercent || 0,
      ...samples.map(s => s.cpuPercent),
      latest.cpuPercent
    )
    const avgCpuPercent = samples.length
      ? Number((samples.reduce((sum, s) => sum + s.cpuPercent, 0) / samples.length).toFixed(2))
      : latest.cpuPercent
    const peakRssMb = Math.max(
      liveAcc?.peakRssMb || 0,
      dbSummary?.peakRssMb || 0,
      ...samples.map(s => s.rssMb),
      latest.rssMb
    )
    const peakEventLoopLagP95Ms = Math.max(
      liveAcc?.peakEventLoopLagP95Ms || 0,
      dbSummary?.peakEventLoopLagP95Ms || 0,
      ...samples.map(s => s.eventLoopLagP95Ms),
      latest.eventLoopLagP95Ms
    )

    const wsMessagesReceived = liveAcc?.wsMessagesReceived ?? dbSummary?.wsMessagesReceived ?? this.wsInTotal
    const wsMessagesBroadcast = liveAcc?.wsMessagesBroadcast ?? dbSummary?.wsMessagesBroadcast ?? this.wsOutTotal

    const baselineCpu = this.baselineCpuPercent ?? Math.min(latest.cpuPercent, 1.5)
    const baselineRss = this.baselineRssMb ?? latest.rssMb

    // Empirical per-participant signaling cost when we have peak > 1, otherwise conservative benchmark defaults
    const observedDeltaParticipants = Math.max(1, peakParticipants - 1)
    const rawMarginalCpu = peakParticipants > 1 ? Math.max(0.08, (peakCpuPercent - baselineCpu) / observedDeltaParticipants) : 0.25
    const rawMarginalRamMb = peakParticipants > 1 ? Math.max(0.15, (peakRssMb - baselineRss) / observedDeltaParticipants) : 0.35

    const marginalCpuPerUserPct = Number(rawMarginalCpu.toFixed(3))
    const marginalRamPerUserMb = Number(rawMarginalRamMb.toFixed(3))

    // Capacity modeling:
    // 1. Node Signaling Server ceiling (80% safe CPU budget, 75% safe free RAM budget)
    const safeCpuHeadroomPct = Math.max(5, 80 - latest.cpuPercent)
    const safeRamHeadroomMb = Math.max(64, freeRamMb * 0.75)
    const serverSignalingLimitByCpu = Math.floor(safeCpuHeadroomPct / Math.max(0.05, marginalCpuPerUserPct))
    const serverSignalingLimitByRam = Math.floor(safeRamHeadroomMb / Math.max(0.2, marginalRamPerUserMb))
    const serverSignalingMaxAdditional = Math.max(0, Math.min(serverSignalingLimitByCpu, serverSignalingLimitByRam, 2500))

    // 2. WebRTC Media Topology ceiling (crucial distinction for engineers!)
    // - Current architecture uses WebRTC P2P Mesh / Stage-Fanout routed directly via ICE/TURN without an SFU media server.
    // - In 'online_class' (full N^2 mesh with camera+audio): practical browser/CPU mesh limit ~ 10-16 concurrent interactive video peers.
    // - In 'seminar' (audience muted & no camera, 1-2 stage speakers -> audience): signaling server easily handles hundreds, while Presenter's WebRTC upload/encoder PC becomes bottleneck around ~25-40 concurrent direct peer connections without SFU.
    const recommendedClientMeshMax = uiMode === 'seminar' ? 35 : 14
    const currentInRoom = params?.liveRoom?.participants.size || 0
    const remainingTotalSignalingCapacity = latest.activeParticipants + serverSignalingMaxAdditional
    const mediaTopologyCeiling = Math.min(remainingTotalSignalingCapacity, recommendedClientMeshMax)

    let healthStatus: 'healthy' | 'elevated' | 'critical' = 'healthy'
    if (latest.cpuPercent >= 75 || peakEventLoopLagP95Ms >= 100 || freeRamMb < 256) {
      healthStatus = 'critical'
    } else if (latest.cpuPercent >= 45 || peakEventLoopLagP95Ms >= 35 || freeRamMb < 512) {
      healthStatus = 'elevated'
    }

    const recommendations: string[] = []
    if (uiMode === 'seminar') {
      recommendations.push(
        `در حالت سمینار، مخاطبان بدون میکروفون و دوربین وارد می‌شوند که بار شبکه‌ای N² را حذف کرده و فقط سیگنالینگ وب‌سوکت روی سرور Node.js قرار می‌گیرد (ظرفیت تخمینی سیگنالینگ سرور: ~${remainingTotalSignalingCapacity} کاربر همزمان).`
      )
      recommendations.push(
        `نکته معماری WebRTC برای مهندس نرم‌افزار: به دلیل نبود مدیاسرور SFU (مانند LiveKit/Mediasoup)، مرورگر ارائه\u200cدهنده (Host) در حالت P2P باید به ازای هر مخاطب یک PeerConnection آپلود بسازد که عملاً در حدود ${recommendedClientMeshMax} تا 45 نفر به گلوگاه آپلود/CPU مرورگر میزبان می‌رسد. برای سمینارهای بالای 50 نفر، افزودن SFU توصیه می‌شود.`
      )
    } else {
      recommendations.push(
        `در حالت کلاس تعاملی (Mesh P2P)، تعداد ارتباطات برابر N*(N-1)/2 است؛ لذا برای کیفیت پایدار صدا و تصویر، سقف بهینه 10 تا ${recommendedClientMeshMax} کاربر همزمان در هر اتاق است.`
      )
    }

    if (peakEventLoopLagP95Ms > 40) {
      recommendations.push(
        `Event Loop Lag (p95) به ${peakEventLoopLagP95Ms}ms رسیده است؛ بررسی عملیات‌های همزمان سنگین یا JSON serialization حجیم توصیه می‌شود.`
      )
    } else {
      recommendations.push(
        `تاخیر Event Loop (p95 = ${latest.eventLoopLagP95Ms}ms) در وضعیت ایده‌آل است و وب‌سوکت سیگنالینگ بدون انسداد کار می‌کند.`
      )
    }

    const report = {
      generatedAt: new Date().toISOString(),
      roomId: params?.roomId || null,
      roomTitle: params?.liveRoom?.title || params?.sessionDoc?.title || 'کل سرور',
      uiMode,
      architecture: 'Node.js WebSocket Signaling + WebRTC Direct/TURN (No SFU)',
      healthStatus,
      hostHardware: {
        cpuModel: cpus[0]?.model?.trim() || 'Unknown CPU',
        cpuCores: cpus.length,
        totalRamMb,
        usedSystemRamMb,
        freeRamMb,
        platform: `${os.platform()} ${os.release()} (${os.arch()})`,
        nodeVersion: process.version,
        processUptimeSeconds: Math.round(process.uptime()),
      },
      liveMetrics: latest,
      peakMetrics: {
        peakConcurrentParticipants: peakParticipants,
        peakCpuPercent,
        avgCpuPercent,
        peakRssMb,
        peakEventLoopLagP95Ms,
        wsMessagesReceived,
        wsMessagesBroadcast,
        totalWsMessages: wsMessagesReceived + wsMessagesBroadcast,
        currentInRoom,
      },
      capacityEstimation: {
        marginalCpuPerUserPct,
        marginalRamPerUserMb,
        signalingServerMaxConcurrent: remainingTotalSignalingCapacity,
        signalingAdditionalUsersPossible: serverSignalingMaxAdditional,
        webrtcMediaTopologySafeCeiling: mediaTopologyCeiling,
        primaryBottleneck:
          serverSignalingMaxAdditional < recommendedClientMeshMax
            ? 'Node.js CPU / RAM'
            : uiMode === 'seminar'
            ? 'Presenter Upstream Bandwidth / PeerConnection Fanout (No SFU)'
            : 'Client P2P Mesh N^2 CPU & Bandwidth',
      },
      recommendations,
      samples: samples.slice(-60),
    }

    const markdownLines = [
      `# Technical Load & Capacity Telemetry Report`,
      `- **Generated At:** ${report.generatedAt}`,
      `- **Scope:** ${report.roomTitle}${report.roomId ? ` (${report.roomId})` : ''}`,
      `- **UI / Topology Mode:** ${uiMode === 'seminar' ? 'Seminar (Stage-to-Audience)' : 'Online Class (Interactive Mesh)'}`,
      `- **Health Verdict:** ${healthStatus.toUpperCase()}`,
      ``,
      `## Host Hardware & Runtime`,
      `- **CPU:** ${report.hostHardware.cpuModel} (${report.hostHardware.cpuCores} cores)`,
      `- **System RAM:** ${usedSystemRamMb} MB used / ${totalRamMb} MB total (${freeRamMb} MB free)`,
      `- **Node.js / OS:** ${report.hostHardware.nodeVersion} on ${report.hostHardware.platform} (uptime: ${report.hostHardware.processUptimeSeconds}s)`,
      ``,
      `## Measured Resource Usage (Live & Peak)`,
      `- **Active Participants (Room / Server):** ${currentInRoom} / ${latest.activeParticipants}`,
      `- **Peak Concurrent Participants:** ${peakParticipants}`,
      `- **Process CPU (Live / Avg / Peak):** ${latest.cpuPercent}% / ${avgCpuPercent}% / ${peakCpuPercent}%`,
      `- **Process Memory (RSS Peak / Heap Used):** ${peakRssMb} MB / ${latest.heapUsedMb} MB`,
      `- **Event Loop Lag p95 (Live / Peak):** ${latest.eventLoopLagP95Ms} ms / ${peakEventLoopLagP95Ms} ms`,
      `- **WS Signaling Traffic:** ${wsMessagesReceived} inbound / ${wsMessagesBroadcast} outbound (${latest.wsMsgsPerSec} msg/s)`,
      ``,
      `## Capacity & Bottleneck Estimation`,
      `- **Marginal Cost per User:** ~${marginalCpuPerUserPct}% CPU, ~${marginalRamPerUserMb} MB RAM`,
      `- **Node Signaling Additional Capacity:** ~${serverSignalingMaxAdditional} users (max ~${remainingTotalSignalingCapacity} total)`,
      `- **Safe Media Topology Ceiling (Current Architecture):** ~${mediaTopologyCeiling} concurrent users`,
      `- **Primary Bottleneck:** ${report.capacityEstimation.primaryBottleneck}`,
      ``,
      `## Engineering Recommendations`,
      ...recommendations.map((r, idx) => `${idx + 1}. ${r}`),
    ]

    return {
      ...report,
      markdownReport: markdownLines.join('\n'),
    }
  }
}

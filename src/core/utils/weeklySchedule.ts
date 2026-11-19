export const WEEKDAY_KEYS = [
  'saturday',
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
] as const

export type WeekdayKey = (typeof WEEKDAY_KEYS)[number]

export interface IWeeklyTimeRange {
  startTime: string
  endTime: string
}

export type IWeeklyScheduleMap = Record<WeekdayKey, IWeeklyTimeRange[]>

const DIGIT_MAP: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
}

export const WEEKDAY_LABELS_FA: Record<WeekdayKey, string> = {
  saturday: 'شنبه',
  sunday: 'یکشنبه',
  monday: 'دوشنبه',
  tuesday: 'سه‌شنبه',
  wednesday: 'چهارشنبه',
  thursday: 'پنج‌شنبه',
  friday: 'جمعه',
}

export function normalizeDigits(input: string | number | undefined | null): string {
  if (input === undefined || input === null) return ''
  return String(input).replace(/[۰-۹٠-٩]/g, (ch) => DIGIT_MAP[ch] ?? ch)
}

export function createEmptyWeeklySchedule(): IWeeklyScheduleMap {
  return {
    saturday: [],
    sunday: [],
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
  }
}

/**
 * Parses "HH:MM" into minutes since 00:00 [0..1440]. Returns null if invalid.
 */
export function parseTimeToMinutes(raw: string): number | null {
  const clean = normalizeDigits(raw).trim()
  const match = clean.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour === 24 && minute === 0) return 1440
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

export function formatMinutesToHHMM(totalMinutes: number): string {
  if (totalMinutes === 1440) return '24:00'
  const clamped = Math.max(0, Math.min(1439, totalMinutes))
  const hh = Math.floor(clamped / 60).toString().padStart(2, '0')
  const mm = (clamped % 60).toString().padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Validates and normalizes weeklySchedule input.
 * Rejects invalid HH:MM, startTime >= endTime, and overlapping ranges in the same day.
 */
export function validateAndNormalizeWeeklySchedule(
  rawSchedule: any
): { valid: true; schedule: IWeeklyScheduleMap } | { valid: false; error: string } {
  const normalized = createEmptyWeeklySchedule()
  if (!rawSchedule || typeof rawSchedule !== 'object') {
    return { valid: false, error: 'ساختار برنامه هفتگی نامعتبر است.' }
  }

  for (const dayKey of WEEKDAY_KEYS) {
    const rawSlots = rawSchedule[dayKey]
    if (rawSlots === undefined || rawSlots === null) {
      normalized[dayKey] = []
      continue
    }
    if (!Array.isArray(rawSlots)) {
      return { valid: false, error: `بازه زمانی روز ${WEEKDAY_LABELS_FA[dayKey]} باید به صورت آرایه باشد.` }
    }

    const parsedRanges: Array<{ startMin: number; endMin: number; startTime: string; endTime: string }> = []
    for (const slot of rawSlots) {
      if (!slot || typeof slot !== 'object') {
        return { valid: false, error: `یک بازه نامعتبر در روز ${WEEKDAY_LABELS_FA[dayKey]} وجود دارد.` }
      }
      const startMin = parseTimeToMinutes(slot.startTime)
      const endMin = parseTimeToMinutes(slot.endTime)
      if (startMin === null || endMin === null) {
        return {
          valid: false,
          error: `فرمت ساعت در روز ${WEEKDAY_LABELS_FA[dayKey]} نامعتبر است. فرمت صحیح HH:MM است.`,
        }
      }
      if (startMin >= endMin) {
        return {
          valid: false,
          error: `در روز ${WEEKDAY_LABELS_FA[dayKey]}، ساعت شروع (${formatMinutesToHHMM(startMin)}) باید قبل از ساعت پایان (${formatMinutesToHHMM(endMin)}) باشد.`,
        }
      }
      parsedRanges.push({
        startMin,
        endMin,
        startTime: formatMinutesToHHMM(startMin),
        endTime: formatMinutesToHHMM(endMin),
      })
    }

    parsedRanges.sort((a, b) => a.startMin - b.startMin)

    for (let i = 1; i < parsedRanges.length; i++) {
      const prev = parsedRanges[i - 1]
      const curr = parsedRanges[i]
      if (curr.startMin < prev.endMin) {
        return {
          valid: false,
          error: `در روز ${WEEKDAY_LABELS_FA[dayKey]}، بازه ${curr.startTime} تا ${curr.endTime} با بازه ${prev.startTime} تا ${prev.endTime} تداخل دارد.`,
        }
      }
    }

    normalized[dayKey] = parsedRanges.map((r) => ({
      startTime: r.startTime,
      endTime: r.endTime,
    }))
  }

  return { valid: true, schedule: normalized }
}

const EN_WEEKDAY_TO_KEY: Record<string, WeekdayKey> = {
  Saturday: 'saturday',
  Sunday: 'sunday',
  Monday: 'monday',
  Tuesday: 'tuesday',
  Wednesday: 'wednesday',
  Thursday: 'thursday',
  Friday: 'friday',
}

/**
 * Extracts deterministic Asia/Tehran weekday key, minutes-since-midnight, and HH:MM from any Date.
 */
export function getTehranTimeParts(date: Date): {
  weekday: WeekdayKey
  minutesOfDay: number
  hhmm: string
  dateKey: string // YYYY-MM-DD in Gregorian Tehran local
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const map: Record<string, string> = {}
  for (const p of parts) {
    map[p.type] = p.value
  }
  const hourNum = Number(map.hour) === 24 ? 0 : Number(map.hour)
  const minuteNum = Number(map.minute)
  const weekday = EN_WEEKDAY_TO_KEY[map.weekday] || 'saturday'
  const hhmm = `${hourNum.toString().padStart(2, '0')}:${minuteNum.toString().padStart(2, '0')}`
  return {
    weekday,
    minutesOfDay: hourNum * 60 + minuteNum,
    hhmm,
    dateKey: `${map.year}-${map.month}-${map.day}`,
  }
}

/**
 * Resolves a requested start Date from either:
 * - { scheduledAt } (ISO timestamp)
 * - { date: 'YYYY-MM-DD', startTime: 'HH:MM' } (interpreted in Asia/Tehran UTC+03:30)
 */
export function resolveRequestedDateTime(params: {
  scheduledAt?: string | Date
  date?: string
  startTime?: string
}): Date | null {
  if (params.date && params.startTime) {
    const cleanTime = normalizeDigits(params.startTime).trim()
    const cleanDate = normalizeDigits(params.date).trim()
    const timeMin = parseTimeToMinutes(cleanTime)
    if (timeMin !== null && /^\d{4}-\d{2}-\d{2}$/.test(cleanDate) && timeMin < 1440) {
      const hhmm = formatMinutesToHHMM(timeMin)
      const isoTehran = `${cleanDate}T${hhmm}:00+03:30`
      const d = new Date(isoTehran)
      if (!isNaN(d.getTime())) return d
    }
  }
  if (params.scheduledAt) {
    const parsed = new Date(params.scheduledAt)
    if (!isNaN(parsed.getTime())) {
      return parsed
    }
  }
  return null
}

export function isAllWeekLegacyDefaultSchedule(weeklySchedule: any): boolean {
  if (!weeklySchedule || typeof weeklySchedule !== 'object') return false
  for (const key of WEEKDAY_KEYS) {
    const arr = weeklySchedule[key]
    if (!Array.isArray(arr) || arr.length !== 1) return false
    if (arr[0]?.startTime !== '16:00' || arr[0]?.endTime !== '20:00') return false
  }
  return true
}

/**
 * Checks whether [reqStart, reqStart + durationMinutes] falls inside
 * one of the teacher's active intervals for that Tehran weekday.
 */
export function isWindowWithinWeeklySchedule(
  weeklySchedule: any,
  startDate: Date,
  durationMinutes: number,
  options?: { flexibleSingleSlot?: boolean }
): { available: boolean; weekday: WeekdayKey; startHHMM: string; endHHMM: string } {
  const { weekday, minutesOfDay, hhmm } = getTehranTimeParts(startDate)
  const reqEndMin = minutesOfDay + durationMinutes
  const endHHMM = formatMinutesToHHMM(Math.min(1440, reqEndMin))

  if (!weeklySchedule || typeof weeklySchedule !== 'object') {
    return { available: false, weekday, startHHMM: hhmm, endHHMM }
  }

  const dayRanges: IWeeklyTimeRange[] = Array.isArray(weeklySchedule[weekday])
    ? weeklySchedule[weekday]
    : []

  if (dayRanges.length === 0) {
    return { available: false, weekday, startHHMM: hhmm, endHHMM }
  }

  if (!options?.flexibleSingleSlot && reqEndMin > 1440) {
    return { available: false, weekday, startHHMM: hhmm, endHHMM }
  }

  for (const range of dayRanges) {
    const availStart = parseTimeToMinutes(range.startTime)
    const availEnd = parseTimeToMinutes(range.endTime)
    if (availStart === null || availEnd === null) continue
    if (minutesOfDay >= availStart && reqEndMin <= availEnd) {
      return { available: true, weekday, startHHMM: hhmm, endHHMM }
    }
    if (options?.flexibleSingleSlot && dayRanges.length === 1) {
      // Single daily slot: allow any class that starts within [availStart, availEnd]
      if (minutesOfDay >= availStart && minutesOfDay <= availEnd) {
        return { available: true, weekday, startHHMM: hhmm, endHHMM }
      }
      // If teacher enabled all 7 days with the default 16:00-20:00 toggle ("all week online"), allow any hour on active days
      if (isAllWeekLegacyDefaultSchedule(weeklySchedule)) {
        return { available: true, weekday, startHHMM: hhmm, endHHMM }
      }
    }
  }

  return { available: false, weekday, startHHMM: hhmm, endHHMM }
}

export function normalizePersianSubjectText(text: string): string {
  return normalizeDigits(text || '')
    .trim()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function teacherMatchesEducationLevel(
  profile: { educationLevel?: string },
  criteria: { courseName?: string }
): boolean {
  const { courseName } = criteria
  if (courseName && profile.educationLevel && profile.educationLevel !== 'both') {
    const normCourse = normalizePersianSubjectText(courseName)
    if (normCourse.includes('ابتدایی') && profile.educationLevel !== 'elementary') {
      return false
    }
    if (normCourse.includes('متوسطه') && profile.educationLevel !== 'secondary') {
      return false
    }
  }
  return true
}

/**
 * Matches teacher's configured teachingSubjects & educationLevel against student request.
 */
export function teacherMatchesAcademicCriteria(
  profile: { teachingSubjects?: string[]; educationLevel?: string },
  criteria: { subjectName?: string; courseName?: string; gradeName?: string }
): boolean {
  const { subjectName, courseName } = criteria
  if (!teacherMatchesEducationLevel(profile, { courseName })) {
    return false
  }

  if (subjectName && Array.isArray(profile.teachingSubjects) && profile.teachingSubjects.length > 0) {
    const target = normalizePersianSubjectText(subjectName)
    const matches = profile.teachingSubjects.some((ts) => {
      const norm = normalizePersianSubjectText(ts)
      if (norm === 'همه دروس' || norm === '*') return true
      return norm === target || target.includes(norm) || norm.includes(target)
    })
    if (!matches) return false
  }

  return true
}

export function extractWeeklyScheduleSummary(weeklySchedule: any): {
  schedule: IWeeklyScheduleMap
  enabledDaysCount: number
  totalSlotsCount: number
} {
  const empty = createEmptyWeeklySchedule()
  let enabledDaysCount = 0
  let totalSlotsCount = 0

  if (weeklySchedule && typeof weeklySchedule === 'object') {
    for (const dayKey of WEEKDAY_KEYS) {
      const slots = Array.isArray(weeklySchedule[dayKey]) ? weeklySchedule[dayKey] : []
      empty[dayKey] = slots.map((s: any) => ({
        startTime: String(s.startTime || ''),
        endTime: String(s.endTime || ''),
      }))
      if (empty[dayKey].length > 0) {
        enabledDaysCount += 1
        totalSlotsCount += empty[dayKey].length
      }
    }
  }

  return { schedule: empty, enabledDaysCount, totalSlotsCount }
}

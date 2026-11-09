export const DURATION_RATIOS: Record<number, number> = {
  90: 1.0,
  75: 0.84,
  60: 0.7,
  45: 0.56,
  30: 0.4,
  15: 0.2,
}

export const EXTRA_CAPACITY_PRICE_PER_STUDENT = 50000 // 50,000 Tomans
export const STUDENT_SERVICE_FEE_PERCENT = 0.1 // 10%
export const TEACHER_SERVICE_FEE_PERCENT = 0.1 // 10%

export interface DurationPriceInfo {
  minutes: number
  price: number
  label: string
  enabled: boolean
}

export class OnlineClassService {
  /**
   * Calculate price for a given duration based on 90-minute base price
   */
  static calculatePrice(basePrice90Min: number, durationMinutes: number): number {
    const ratio = DURATION_RATIOS[durationMinutes] ?? 1.0
    // Round to nearest 1,000 Tomans
    return Math.round((basePrice90Min * ratio) / 1000) * 1000
  }

  /**
   * Get all 6 calculated duration prices
   */
  static getDurationPrices(
    basePrice90Min: number,
    enabledMap?: Record<string, boolean> | Map<string, boolean>
  ): DurationPriceInfo[] {
    const durations = [90, 75, 60, 45, 30, 15]

    return durations.map((minutes) => {
      let isEnabled = true
      if (enabledMap) {
        if (enabledMap instanceof Map) {
          isEnabled = enabledMap.get(minutes.toString()) ?? true
        } else {
          isEnabled = enabledMap[minutes.toString()] ?? true
        }
      }

      return {
        minutes,
        price: this.calculatePrice(basePrice90Min, minutes),
        label: `${minutes} دقیقه`,
        enabled: isEnabled,
      }
    })
  }

  /**
   * Full quote calculation verified by server
   */
  static calculateQuote(params: {
    basePrice90Min: number
    durationMinutes: number
    capacity: number
  }) {
    const { basePrice90Min, durationMinutes, capacity } = params

    const validCapacity = Math.max(1, Math.min(10, Number(capacity) || 1))
    const baseClassPrice = this.calculatePrice(basePrice90Min, durationMinutes)
    const extraCapacityCount = Math.max(0, validCapacity - 1)
    const extraCapacityFee = extraCapacityCount * EXTRA_CAPACITY_PRICE_PER_STUDENT

    const subtotal = baseClassPrice + extraCapacityFee
    const studentServiceFee = Math.round(subtotal * STUDENT_SERVICE_FEE_PERCENT)
    const totalPrice = subtotal + studentServiceFee
    const perStudentShare = Math.round(totalPrice / validCapacity)

    // Teacher settlement logic:
    // Base class teacher fee is 10%. Extra capacity platform fee is 20% (teacher gets 80%).
    const teacherBaseFee = Math.round(baseClassPrice * TEACHER_SERVICE_FEE_PERCENT)
    const teacherExtraFee = Math.round(extraCapacityFee * 0.2)
    const teacherServiceFee = teacherBaseFee + teacherExtraFee
    const teacherEarnings = subtotal - teacherServiceFee

    return {
      baseClassPrice,
      extraCapacityCount,
      extraCapacityFee,
      subtotal,
      studentServiceFee,
      totalPrice,
      perStudentShare,
      teacherEarnings,
      teacherServiceFee,
      capacity: validCapacity,
    }
  }

  /**
   * Generate secure meeting link for self-hosted in-app online classroom
   */
  static generateMeetingInfo(bookingCode: string) {
    const cleanCode = bookingCode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    const roomName = `kitayar-class-${cleanCode}`
    const meetingLink = `/classroom/${cleanCode}`
    return {
      platform: 'in_app' as const,
      meetingLink,
      roomName,
    }
  }
}


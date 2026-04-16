/**
 * Tests for shared timecode utilities.
 * These are pure functions — no mocks needed.
 */
import { describe, it, expect } from 'vitest'
import {
  secondsToTimecode,
  timecodeToSeconds,
  framesToTimecode,
  isDropFrameRate
} from '../timecode'

describe('isDropFrameRate', () => {
  it('returns true for 29.97 fps', () => {
    expect(isDropFrameRate(29.97)).toBe(true)
  })

  it('returns true for 59.94 fps', () => {
    expect(isDropFrameRate(59.94)).toBe(true)
  })

  it('returns false for 24 fps', () => {
    expect(isDropFrameRate(24)).toBe(false)
  })

  it('returns true for 30 fps (within 0.1 tolerance of 29.97)', () => {
    // 30 is within Math.abs(30 - 29.97) = 0.03 < 0.1 tolerance
    expect(isDropFrameRate(30)).toBe(true)
  })

  it('returns false for 25 fps (PAL)', () => {
    expect(isDropFrameRate(25)).toBe(false)
  })
})

describe('framesToTimecode', () => {
  it('converts 0 frames to 00:00:00:00', () => {
    expect(framesToTimecode(0, 24)).toBe('00:00:00:00')
  })

  it('converts 24 frames at 24fps to 00:00:01:00', () => {
    expect(framesToTimecode(24, 24)).toBe('00:00:01:00')
  })

  it('converts 48 frames at 24fps to 00:00:02:00', () => {
    expect(framesToTimecode(48, 24)).toBe('00:00:02:00')
  })

  it('converts 1440 frames at 24fps to 00:01:00:00', () => {
    expect(framesToTimecode(1440, 24)).toBe('00:01:00:00')
  })

  it('converts 86400 frames at 24fps to 01:00:00:00', () => {
    expect(framesToTimecode(86400, 24)).toBe('01:00:00:00')
  })

  it('handles partial frames', () => {
    expect(framesToTimecode(25, 24)).toBe('00:00:01:01')
  })

  it('returns 00:00:00:00 for NaN', () => {
    expect(framesToTimecode(NaN, 24)).toBe('00:00:00:00')
  })

  it('returns 00:00:00:00 for negative frames', () => {
    expect(framesToTimecode(-10, 24)).toBe('00:00:00:00')
  })

  it('uses semicolon separator for drop-frame mode', () => {
    const result = framesToTimecode(0, 29.97, true)
    expect(result).toBe('00:00:00;00')
  })

  it('uses colon separator for non-drop-frame mode', () => {
    const result = framesToTimecode(0, 29.97, false)
    expect(result).toBe('00:00:00:00')
  })
})

describe('secondsToTimecode', () => {
  it('converts 0 seconds', () => {
    expect(secondsToTimecode(0, 24)).toBe('00:00:00:00')
  })

  it('converts 1 second at 24fps', () => {
    expect(secondsToTimecode(1, 24)).toBe('00:00:01:00')
  })

  it('converts 60 seconds at 24fps', () => {
    expect(secondsToTimecode(60, 24)).toBe('00:01:00:00')
  })

  it('converts 3600 seconds at 24fps', () => {
    expect(secondsToTimecode(3600, 24)).toBe('01:00:00:00')
  })

  it('converts fractional seconds to correct frame', () => {
    // 0.5 seconds at 24fps = 12 frames
    expect(secondsToTimecode(0.5, 24)).toBe('00:00:00:12')
  })

  it('defaults to 24fps when no framerate specified', () => {
    expect(secondsToTimecode(1)).toBe('00:00:01:00')
  })
})

describe('timecodeToSeconds', () => {
  it('converts 00:00:00:00 to 0', () => {
    expect(timecodeToSeconds('00:00:00:00', 24)).toBe(0)
  })

  it('converts 00:00:01:00 at 24fps to 1', () => {
    expect(timecodeToSeconds('00:00:01:00', 24)).toBe(1)
  })

  it('converts 01:00:00:00 at 24fps to 3600', () => {
    expect(timecodeToSeconds('01:00:00:00', 24)).toBe(3600)
  })

  it('handles frames correctly', () => {
    // 12 frames at 24fps = 0.5 seconds
    expect(timecodeToSeconds('00:00:00:12', 24)).toBe(0.5)
  })

  it('handles drop-frame semicolons', () => {
    const result = timecodeToSeconds('00:00:01;00', 29.97)
    expect(result).toBe(1)
  })

  it('throws on invalid format', () => {
    expect(() => timecodeToSeconds('invalid', 24)).toThrow('Invalid timecode format')
  })

  it('throws on too few parts', () => {
    expect(() => timecodeToSeconds('00:00:00', 24)).toThrow('Invalid timecode format')
  })
})

describe('round-trip: seconds → timecode → seconds', () => {
  it('24fps round trip', () => {
    const original = 125.5 // 2m 5.5s
    const tc = secondsToTimecode(original, 24)
    const result = timecodeToSeconds(tc, 24)
    expect(result).toBeCloseTo(original, 2)
  })

  it('30fps round trip', () => {
    const original = 3661.0 // 1h 1m 1s
    const tc = secondsToTimecode(original, 30)
    const result = timecodeToSeconds(tc, 30)
    expect(result).toBeCloseTo(original, 2)
  })
})

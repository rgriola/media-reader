/**
 * Tests for ffmpeg-spawn helper utilities.
 * parseFramerate is pure; binary path functions use vi.mock for fs.
 */
import { describe, it, expect, vi } from 'vitest'

// Mock electron so the module can load without Electron runtime
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn().mockReturnValue('/tmp')
  }
}))

// Mock @ffprobe-installer/ffprobe
vi.mock('@ffprobe-installer/ffprobe', () => ({
  default: { path: '/usr/local/bin/ffprobe' }
}))

// Must import after mocks are set up
import { parseFramerate, getFfmpegPath, getFfprobePath } from '../ffmpeg-spawn'

describe('parseFramerate', () => {
  it('parses 24000/1001 to ~23.976', () => {
    expect(parseFramerate('24000/1001')).toBeCloseTo(23.976, 2)
  })

  it('parses 30000/1001 to ~29.97', () => {
    expect(parseFramerate('30000/1001')).toBeCloseTo(29.97, 1)
  })

  it('parses 30/1 to 30', () => {
    expect(parseFramerate('30/1')).toBe(30)
  })

  it('parses plain number string', () => {
    expect(parseFramerate('25')).toBe(25)
  })

  it('parses decimal string', () => {
    expect(parseFramerate('23.976')).toBeCloseTo(23.976, 2)
  })
})

describe('getFfmpegPath', () => {
  it('returns a string path', () => {
    const result = getFfmpegPath()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('getFfprobePath', () => {
  it('returns a string path', () => {
    const result = getFfprobePath()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

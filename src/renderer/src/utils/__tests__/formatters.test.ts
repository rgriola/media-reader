/**
 * Tests for renderer utility formatters.
 * Pure functions — no mocks needed.
 */
import { describe, it, expect } from 'vitest'
import {
  formatFileSize,
  formatDuration,
  formatBitrate,
  getFileExtension,
  getFilenameWithoutExtension,
  isVideoFile,
  getProxyFilename,
  parseFramerate
} from '../formatters'

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500.00 B')
  })

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.00 KB')
  })

  it('formats megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.00 MB')
  })

  it('formats gigabytes', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.00 GB')
  })

  it('formats terabytes', () => {
    expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe('1.00 TB')
  })

  it('formats fractional sizes', () => {
    expect(formatFileSize(1536)).toBe('1.50 KB')
  })

  it('formats zero', () => {
    expect(formatFileSize(0)).toBe('0.00 B')
  })
})

describe('formatDuration', () => {
  it('formats seconds only', () => {
    expect(formatDuration(45)).toBe('45s')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2m 5s')
  })

  it('formats hours, minutes, seconds', () => {
    expect(formatDuration(3661)).toBe('1h 1m 1s')
  })

  it('formats zero as 0s', () => {
    expect(formatDuration(0)).toBe('0s')
  })

  it('omits zero minutes between hours and seconds', () => {
    expect(formatDuration(3601)).toBe('1h 1s')
  })
})

describe('formatBitrate', () => {
  it('formats Mbps', () => {
    expect(formatBitrate(50_000_000)).toBe('50.00 Mbps')
  })

  it('formats Kbps for sub-megabit', () => {
    expect(formatBitrate(500_000)).toBe('500.00 Kbps')
  })

  it('formats exactly 1 Mbps', () => {
    expect(formatBitrate(1_000_000)).toBe('1.00 Mbps')
  })
})

describe('getFileExtension', () => {
  it('returns lowercase extension', () => {
    expect(getFileExtension('/path/to/file.MXF')).toBe('mxf')
  })

  it('returns mp4 for proxy file', () => {
    expect(getFileExtension('/path/to/clip_proxy.mp4')).toBe('mp4')
  })

  it('returns full path when no dot present (edge case)', () => {
    // split('.').pop() returns the whole string when there's no dot
    expect(getFileExtension('/path/to/file')).toBe('/path/to/file')
  })
})

describe('getFilenameWithoutExtension', () => {
  it('strips extension', () => {
    expect(getFilenameWithoutExtension('/path/to/clip.mxf')).toBe('clip')
  })

  it('handles multiple dots', () => {
    expect(getFilenameWithoutExtension('/path/to/clip.v2.mxf')).toBe('clip.v2')
  })
})

describe('isVideoFile', () => {
  it('returns true for .mxf', () => {
    expect(isVideoFile('clip.mxf')).toBe(true)
  })

  it('returns true for .mp4', () => {
    expect(isVideoFile('video.mp4')).toBe(true)
  })

  it('returns true for .mov', () => {
    expect(isVideoFile('video.mov')).toBe(true)
  })

  it('returns false for .xml', () => {
    expect(isVideoFile('metadata.xml')).toBe(false)
  })

  it('returns false for .txt', () => {
    expect(isVideoFile('readme.txt')).toBe(false)
  })
})

describe('getProxyFilename', () => {
  it('generates suffix convention path', () => {
    expect(getProxyFilename('/Volumes/Card/XDROOT/Clip/918_0990.mxf', 'suffix')).toBe(
      '/Volumes/Card/XDROOT/Clip/918_0990_proxy.mp4'
    )
  })

  it('generates folder convention path', () => {
    expect(getProxyFilename('/Volumes/Card/XDROOT/Clip/918_0990.mxf', 'folder')).toBe(
      '/Volumes/Card/XDROOT/Clip/proxies/918_0990.mp4'
    )
  })

  it('defaults to suffix convention', () => {
    expect(getProxyFilename('/path/clip.mxf')).toBe('/path/clip_proxy.mp4')
  })
})

describe('parseFramerate', () => {
  it('parses fraction string 24000/1001', () => {
    const result = parseFramerate('24000/1001')
    expect(result).toBeCloseTo(23.976, 2)
  })

  it('parses fraction string 30000/1001', () => {
    const result = parseFramerate('30000/1001')
    expect(result).toBeCloseTo(29.97, 1)
  })

  it('parses plain number string', () => {
    expect(parseFramerate('25')).toBe(25)
  })

  it('passes through numeric input', () => {
    expect(parseFramerate(24)).toBe(24)
  })
})

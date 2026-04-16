/**
 * Tests for file path validation utility.
 * Mocks Electron's app.getPath to isolate from runtime.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron before importing path-utils
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/Users/testuser')
  }
}))

import { validateFilePath } from '../path-utils'

describe('validateFilePath', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts paths under /Volumes/', () => {
    const result = validateFilePath('/Volumes/SonyCard/XDROOT/Clip/file.mxf')
    expect(result).toBe('/Volumes/SonyCard/XDROOT/Clip/file.mxf')
  })

  it('accepts paths under home directory', () => {
    const result = validateFilePath('/Users/testuser/Documents/file.mxf')
    expect(result).toBe('/Users/testuser/Documents/file.mxf')
  })

  it('rejects paths outside allowed directories', () => {
    expect(() => validateFilePath('/tmp/evil.mxf')).toThrow('Access denied')
  })

  it('rejects /etc paths', () => {
    expect(() => validateFilePath('/etc/passwd')).toThrow('Access denied')
  })

  it('rejects /usr paths', () => {
    expect(() => validateFilePath('/usr/local/bin/ffmpeg')).toThrow('Access denied')
  })

  it('rejects root path', () => {
    expect(() => validateFilePath('/')).toThrow('Access denied')
  })

  it('resolves relative paths and then validates', () => {
    // A relative path gets resolved to cwd, which is likely outside allowed dirs
    expect(() => validateFilePath('relative/path.mxf')).toThrow('Access denied')
  })

  it('accepts /Volumes exactly (the root itself)', () => {
    const result = validateFilePath('/Volumes')
    expect(result).toBe('/Volumes')
  })
})

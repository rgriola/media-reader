/**
 * Tests for camera card detection and file path building.
 * Pure functions — no mocks needed.
 */
import { describe, it, expect } from 'vitest'
import { detectCameraCardType, buildFilePath, SonyFX6, SonyA7SIII } from '../camera-cards.config'

describe('detectCameraCardType', () => {
  it('detects Sony FX6 from SONY + XDROOT directories', () => {
    const result = detectCameraCardType(['SONY', 'XDROOT'])
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Sony FX6')
    expect(result?.type).toBe('sony')
  })

  it('detects Sony FX6 even with hidden files present', () => {
    const result = detectCameraCardType(['SONY', 'XDROOT', '.Spotlight-V100', '.fseventsd'])
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Sony FX6')
  })

  it('returns null when SONY dir is missing', () => {
    const result = detectCameraCardType(['XDROOT'])
    expect(result).toBeNull()
  })

  it('returns null when XDROOT dir is missing', () => {
    const result = detectCameraCardType(['SONY'])
    expect(result).toBeNull()
  })

  it('returns null for empty directory list', () => {
    const result = detectCameraCardType([])
    expect(result).toBeNull()
  })

  it('detects Sony card even with extra dirs from new firmware (AVF_INFO, PRIVATE)', () => {
    // FX6 firmware v6+ adds AVF_INFO and PRIVATE alongside SONY/XDROOT
    const result = detectCameraCardType(['SONY', 'XDROOT', 'AVF_INFO', 'PRIVATE'])
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Sony FX6')
  })

  it('detects Sony card with only the new AVF_INFO extra dir', () => {
    const result = detectCameraCardType(['SONY', 'XDROOT', 'AVF_INFO'])
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Sony FX6')
  })

  it('detects Sony card with extra non-hidden directories (allowOtherFiles: true)', () => {
    // SonyFX6 now has allowOtherFiles: true — extra dirs should be accepted
    const result = detectCameraCardType(['SONY', 'XDROOT', 'ExtraFolder'])
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Sony FX6')
  })

  it('returns null for generic camera structure', () => {
    const result = detectCameraCardType(['DCIM', 'MISC'])
    expect(result).toBeNull()
  })

  // --- Sony A7S III (M4ROOT) ---
  it('detects Sony A7S III from SONY + M4ROOT directories', () => {
    const result = detectCameraCardType(['SONY', 'M4ROOT'])
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Sony A7S III')
    expect(result?.type).toBe('sony')
  })

  it('detects A7S III with all real-world dirs (AVF_INFO, PRIVATE, DCIM)', () => {
    // Actual card: SONY + M4ROOT + AVF_INFO + PRIVATE + DCIM
    const result = detectCameraCardType(['SONY', 'M4ROOT', 'AVF_INFO', 'PRIVATE', 'DCIM'])
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Sony A7S III')
  })

  it('A7S III card without SONY dir returns null', () => {
    const result = detectCameraCardType(['M4ROOT'])
    expect(result).toBeNull()
  })

  it('FX6 takes priority over A7S III when XDROOT is present', () => {
    // Edge case: card with both roots should match FX6 first
    const result = detectCameraCardType(['SONY', 'XDROOT', 'M4ROOT'])
    expect(result?.name).toBe('Sony FX6')
  })
})

describe('buildFilePath', () => {
  const volumePath = '/Volumes/SonyCard'
  const basename = '918_0990'

  it('builds proxy paths with correct directory and suffix', () => {
    const paths = buildFilePath(volumePath, SonyFX6, basename, 'proxy')
    expect(paths).toHaveLength(SonyFX6.extensions.proxy.length)
    expect(paths[0]).toBe('/Volumes/SonyCard/XDROOT/Sub/918_0990S03.MP4')
    expect(paths[1]).toBe('/Volumes/SonyCard/XDROOT/Sub/918_0990S03.mp4')
  })

  it('builds XML paths with correct directory and suffix', () => {
    const paths = buildFilePath(volumePath, SonyFX6, basename, 'xml')
    expect(paths).toHaveLength(SonyFX6.extensions.xml.length)
    expect(paths[0]).toBe('/Volumes/SonyCard/XDROOT/Clip/918_0990M01.XML')
    expect(paths[1]).toBe('/Volumes/SonyCard/XDROOT/Clip/918_0990M01.xml')
  })

  it('builds thumbnail paths with correct directory and suffix', () => {
    const paths = buildFilePath(volumePath, SonyFX6, basename, 'thumbnail')
    expect(paths).toHaveLength(SonyFX6.extensions.thumbnail.length)
    expect(paths[0]).toBe('/Volumes/SonyCard/XDROOT/Thmbnl/918_0990T01.JPG')
  })

  it('handles volume paths with trailing slash', () => {
    // path.join normalizes this
    const paths = buildFilePath('/Volumes/SonyCard/', SonyFX6, basename, 'proxy')
    expect(paths[0]).toBe('/Volumes/SonyCard/XDROOT/Sub/918_0990S03.MP4')
  })
})

describe('buildFilePath — Sony A7S III', () => {
  const volumePath = '/Volumes/Untitled'
  const basename = 'C1145'

  it('builds clip paths with no suffix', () => {
    const paths = buildFilePath(volumePath, SonyA7SIII, basename, 'clip')
    expect(paths).toHaveLength(SonyA7SIII.extensions.clip.length)
    expect(paths[0]).toBe('/Volumes/Untitled/M4ROOT/CLIP/C1145.MP4')
    expect(paths[1]).toBe('/Volumes/Untitled/M4ROOT/CLIP/C1145.mp4')
  })

  it('builds proxy paths for A7S III', () => {
    const paths = buildFilePath(volumePath, SonyA7SIII, basename, 'proxy')
    expect(paths[0]).toBe('/Volumes/Untitled/M4ROOT/SUB/C1145S03.MP4')
  })

  it('builds XML paths for A7S III', () => {
    const paths = buildFilePath(volumePath, SonyA7SIII, basename, 'xml')
    expect(paths[0]).toBe('/Volumes/Untitled/M4ROOT/CLIP/C1145M01.XML')
  })

  it('builds thumbnail paths for A7S III', () => {
    const paths = buildFilePath(volumePath, SonyA7SIII, basename, 'thumbnail')
    expect(paths[0]).toBe('/Volumes/Untitled/M4ROOT/THMBNL/C1145T01.JPG')
  })
})

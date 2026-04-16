/**
 * Tests for camera card detection and file path building.
 * Pure functions — no mocks needed.
 */
import { describe, it, expect } from 'vitest'
import { detectCameraCardType, buildFilePath, SonyFX6 } from '../camera-cards.config'

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

  it('rejects Sony card with extra non-hidden directories', () => {
    // SonyFX6 has allowOtherFiles: false — extra dirs should disqualify
    const result = detectCameraCardType(['SONY', 'XDROOT', 'ExtraFolder'])
    expect(result).toBeNull()
  })

  it('returns null for generic camera structure', () => {
    const result = detectCameraCardType(['DCIM', 'MISC'])
    expect(result).toBeNull()
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

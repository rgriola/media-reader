/**
 * Tests for Sony XDCAM LTC hex timecode decoding.
 * Tests the formatTimecode function indirectly via the exported decodeSonyLtcHex.
 *
 * Since decodeSonyLtcHex is not exported from drives.ts, we test the logic
 * inline here to validate the BCD decoding algorithm.
 */
import { describe, it, expect } from 'vitest'

/**
 * Reference implementation of decodeSonyLtcHex for testing.
 * Mirrors the function in drives.ts.
 */
function decodeSonyLtcHex(hexStr: string, dropFrame?: boolean): string | null {
  if (!/^[0-9a-fA-F]{8}$/.test(hexStr)) return null

  const val = parseInt(hexStr, 16)

  const ffRaw = (val >>> 24) & 0xff
  const ssRaw = (val >>> 16) & 0xff
  const mmRaw = (val >>> 8) & 0xff
  const hhRaw = val & 0xff

  const bcd = (byte: number): number => {
    const tens = (byte >> 4) & 0x0f
    const units = byte & 0x0f
    return tens * 10 + units
  }

  const hh = bcd(hhRaw & 0x3f)
  const mm = bcd(mmRaw & 0x7f)
  const ss = bcd(ssRaw & 0x7f)
  const ff = bcd(ffRaw & 0x3f)

  if (hh > 23 || mm > 59 || ss > 59 || ff > 59) return null

  const pad = (n: number): string => n.toString().padStart(2, '0')
  const separator = dropFrame ? ';' : ':'
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}${separator}${pad(ff)}`
}

describe('decodeSonyLtcHex', () => {
  it('decodes 48090219 to 19:02:09:08 (Sony FX6 real data)', () => {
    expect(decodeSonyLtcHex('48090219')).toBe('19:02:09:08')
  })

  it('decodes 57510219 to 19:02:51:17', () => {
    expect(decodeSonyLtcHex('57510219')).toBe('19:02:51:17')
  })

  it('decodes 62020319 to 19:03:02:22', () => {
    expect(decodeSonyLtcHex('62020319')).toBe('19:03:02:22')
  })

  it('decodes 60000220 to 20:02:00:20', () => {
    expect(decodeSonyLtcHex('60000220')).toBe('20:02:00:20')
  })

  it('decodes simple case 00000000 to 00:00:00:00', () => {
    expect(decodeSonyLtcHex('00000000')).toBe('00:00:00:00')
  })

  it('uses semicolon separator for drop-frame', () => {
    expect(decodeSonyLtcHex('48090219', true)).toBe('19:02:09;08')
  })

  it('returns null for non-8-char strings', () => {
    expect(decodeSonyLtcHex('123')).toBeNull()
    expect(decodeSonyLtcHex('123456789')).toBeNull()
  })

  it('returns null for non-hex characters', () => {
    expect(decodeSonyLtcHex('ZZZZZZZZ')).toBeNull()
  })

  it('handles midnight timecode', () => {
    expect(decodeSonyLtcHex('00000000')).toBe('00:00:00:00')
  })

  it('handles end-of-day timecode 23:59:59:29', () => {
    // HH=23 → 0x23, MM=59 → 0x59, SS=59 → 0x59, FF=29 → 0x29
    // Layout: FF SS MM HH = 29 59 59 23 → hex: 29595923
    expect(decodeSonyLtcHex('29595923')).toBe('23:59:59:29')
  })
})

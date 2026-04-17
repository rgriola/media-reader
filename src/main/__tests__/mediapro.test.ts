/**
 * Unit tests for parseMediaProXML
 * Tests the pure XML parser without any filesystem access.
 */
import { describe, it, expect } from 'vitest'
import { parseMediaProXML } from '../drives'

// Minimal MEDIAPRO.XML fixture (2 clips)
const FIXTURE_TWO_CLIPS = `<?xml version="1.0" encoding="UTF-8"?>
<MediaProfile xmlns="http://xmlns.sony.net/pro/metadata/mediaprofile" createdAt="2026-04-04T20:44:47-05:00" version="2.30">
\t<Properties>
\t\t<System systemId="5026EFFFFEB9E258" systemKind="ILME-FX6V ver.5.020"/>
\t\t<Attached mediaId="64926AFF341106DAE2585026EFFFFEB9" mediaKind="ProfessionalDisc" mediaName=""/>
\t</Properties>
\t<Contents>
\t\t<Material uri="./Clip/628_1298.MXF" type="MXF" offset="0" dur="710" fps="29.97p" aspectRatio="16:9" ch="8"
\t\t\tvideoType="AVC100CBG_1920_1080_H422IP@L41" audioType="LPCM24"
\t\t\tumid="060A2B340101010501010D431300000050D96100351106DB5026EFFFFEB9E258"
\t\t\tstatus="none" flip="none">
\t\t\t<Proxy uri="./Sub/628_1298S03.MP4" type="MP4" fps="29.97p" aspectRatio="16:9" ch="2" videoType="AVC_Proxy_1920_1080_HP@L41" audioType="AAC-LC"
\t\t\t\tumid="060A2B340101010501010D4313FF000050D96100351106DB5026EFFFFEB9E258" flip="none"/>
\t\t\t<RelevantInfo uri="./Clip/628_1298M01.XML" type="XML"/>
\t\t\t<RelevantInfo uri="./Thmbnl/628_1298T01.JPG" type="JPG"/>
\t\t</Material>
\t\t<Material uri="./Clip/628_1299.MXF" type="MXF" offset="0" dur="285" fps="29.97p" aspectRatio="16:9" ch="8"
\t\t\tvideoType="AVC100CBG_1920_1080_H422IP@L41" audioType="LPCM24"
\t\t\tumid="060A2B340101010501010D4313000000E8B48100351106C45026EFFFFEB9E258"
\t\t\tstatus="none" flip="none">
\t\t\t<Proxy uri="./Sub/628_1299S03.MP4" type="MP4" fps="29.97p" aspectRatio="16:9" ch="2" videoType="AVC_Proxy_1920_1080_HP@L41" audioType="AAC-LC"
\t\t\t\tumid="060A2B340101010501010D4313FF0000E8B48100351106C45026EFFFFEB9E258" flip="none"/>
\t\t\t<RelevantInfo uri="./Clip/628_1299M01.XML" type="XML"/>
\t\t\t<RelevantInfo uri="./Thmbnl/628_1299T01.JPG" type="JPG"/>
\t\t</Material>
\t</Contents>
</MediaProfile>`

// Single-clip fixture (Material is an object, not an array in the parsed result)
const FIXTURE_ONE_CLIP = `<?xml version="1.0" encoding="UTF-8"?>
<MediaProfile xmlns="http://xmlns.sony.net/pro/metadata/mediaprofile" createdAt="2026-04-04T20:00:00-05:00" version="2.30">
\t<Properties>
\t\t<System systemId="AABBCCDDEEFF0011" systemKind="ILME-FX6V ver.4.010"/>
\t\t<Attached mediaId="DEADBEEF12345678AABBCCDDEEFF0011" mediaKind="ProfessionalDisc" mediaName=""/>
\t</Properties>
\t<Contents>
\t\t<Material uri="./Clip/001_0001.MXF" type="MXF" offset="0" dur="1800" fps="23.98p" aspectRatio="16:9" ch="4"
\t\t\tvideoType="XAVC_4K" audioType="LPCM24"
\t\t\tumid="AABBCCDD00000001"
\t\t\tstatus="none" flip="none">
\t\t\t<Proxy uri="./Sub/001_0001S03.MP4" type="MP4" fps="23.98p" aspectRatio="16:9" ch="2" videoType="AVC_Proxy" audioType="AAC-LC"
\t\t\t\tumid="AABBCCDDFF000001" flip="none"/>
\t\t\t<RelevantInfo uri="./Clip/001_0001M01.XML" type="XML"/>
\t\t\t<RelevantInfo uri="./Thmbnl/001_0001T01.JPG" type="JPG"/>
\t\t</Material>
\t</Contents>
</MediaProfile>`

const FIXTURE_EMPTY_CONTENTS = `<?xml version="1.0" encoding="UTF-8"?>
<MediaProfile xmlns="http://xmlns.sony.net/pro/metadata/mediaprofile" createdAt="2026-01-01T00:00:00Z" version="2.30">
\t<Properties>
\t\t<System systemId="0000000000000000" systemKind="ILME-FX6V ver.5.020"/>
\t\t<Attached mediaId="00000000000000000000000000000000" mediaKind="ProfessionalDisc" mediaName=""/>
\t</Properties>
\t<Contents/>
</MediaProfile>`

const FIXTURE_MALFORMED = `<?xml version="1.0" encoding="UTF-8"?>
<NotAMediaProfile>
\t<RandomData/>
</NotAMediaProfile>`

describe('parseMediaProXML', () => {
  describe('two-clip card', () => {
    it('returns a non-null result', () => {
      expect(parseMediaProXML(FIXTURE_TWO_CLIPS)).not.toBeNull()
    })

    it('extracts camera model', () => {
      const result = parseMediaProXML(FIXTURE_TWO_CLIPS)
      expect(result?.cameraModel).toBe('ILME-FX6V ver.5.020')
    })

    it('extracts card ID', () => {
      const result = parseMediaProXML(FIXTURE_TWO_CLIPS)
      expect(result?.cardId).toBe('64926AFF341106DAE2585026EFFFFEB9')
    })

    it('returns two materials', () => {
      const result = parseMediaProXML(FIXTURE_TWO_CLIPS)
      expect(result?.materials).toHaveLength(2)
    })

    it('parses first material MXF URI', () => {
      const result = parseMediaProXML(FIXTURE_TWO_CLIPS)
      expect(result?.materials[0].mxfUri).toBe('./Clip/628_1298.MXF')
    })

    it('parses proxy URI', () => {
      const result = parseMediaProXML(FIXTURE_TWO_CLIPS)
      expect(result?.materials[0].proxyUri).toBe('./Sub/628_1298S03.MP4')
    })

    it('parses XML sidecar URI', () => {
      const result = parseMediaProXML(FIXTURE_TWO_CLIPS)
      expect(result?.materials[0].xmlUri).toBe('./Clip/628_1298M01.XML')
    })

    it('parses thumbnail URI', () => {
      const result = parseMediaProXML(FIXTURE_TWO_CLIPS)
      expect(result?.materials[0].thumbnailUri).toBe('./Thmbnl/628_1298T01.JPG')
    })

    it('parses duration in frames', () => {
      const result = parseMediaProXML(FIXTURE_TWO_CLIPS)
      expect(result?.materials[0].durationFrames).toBe(710)
    })

    it('parses fps string', () => {
      const result = parseMediaProXML(FIXTURE_TWO_CLIPS)
      expect(result?.materials[0].fps).toBe('29.97p')
    })

    it('parses audio channel count', () => {
      const result = parseMediaProXML(FIXTURE_TWO_CLIPS)
      expect(result?.materials[0].audioChannels).toBe(8)
    })

    it('parses video type', () => {
      const result = parseMediaProXML(FIXTURE_TWO_CLIPS)
      expect(result?.materials[0].videoType).toBe('AVC100CBG_1920_1080_H422IP@L41')
    })

    it('parses audio type', () => {
      const result = parseMediaProXML(FIXTURE_TWO_CLIPS)
      expect(result?.materials[0].audioType).toBe('LPCM24')
    })

    it('parses second clip correctly', () => {
      const result = parseMediaProXML(FIXTURE_TWO_CLIPS)
      const clip2 = result?.materials[1]
      expect(clip2?.mxfUri).toBe('./Clip/628_1299.MXF')
      expect(clip2?.durationFrames).toBe(285)
    })
  })

  describe('single-clip card (Material as object, not array)', () => {
    it('returns one material', () => {
      const result = parseMediaProXML(FIXTURE_ONE_CLIP)
      expect(result?.materials).toHaveLength(1)
    })

    it('handles different fps correctly', () => {
      const result = parseMediaProXML(FIXTURE_ONE_CLIP)
      expect(result?.materials[0].fps).toBe('23.98p')
    })

    it('handles 4-channel audio', () => {
      const result = parseMediaProXML(FIXTURE_ONE_CLIP)
      expect(result?.materials[0].audioChannels).toBe(4)
    })

    it('extracts different camera model', () => {
      const result = parseMediaProXML(FIXTURE_ONE_CLIP)
      expect(result?.cameraModel).toBe('ILME-FX6V ver.4.010')
    })
  })

  describe('edge cases', () => {
    it('returns empty materials array for empty Contents', () => {
      const result = parseMediaProXML(FIXTURE_EMPTY_CONTENTS)
      expect(result?.materials).toHaveLength(0)
    })

    it('returns null for non-MediaProfile XML', () => {
      const result = parseMediaProXML(FIXTURE_MALFORMED)
      expect(result).toBeNull()
    })

    it('returns null for empty string', () => {
      const result = parseMediaProXML('')
      expect(result).toBeNull()
    })
  })
})

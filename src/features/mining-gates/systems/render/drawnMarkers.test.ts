import { describe, expect, it } from 'vitest'
import { gateBitsOf, GATE_STATE, MAX_GATE_KIND } from '../../../../systems/render/cellGateBits'
import {
  drawnGateOf,
  gateKindOfPattern,
  type GatePattern,
  type GateViewer,
} from '../../../../systems/render/gatePatterns'
import { drawnMarkerOf, drawnMarkerReadOf } from './drawnMarkers'

// Ticket 299: what the ground draws, read back as #142's lock-marker kinds.

const AT_MAJOR_20: GateViewer = { tipMajor: 20, isMotionReduced: false }

function drawnAs(pattern: GatePattern, viewer = AT_MAJOR_20, opensAtTipMajor?: number) {
  const look = { kind: gateKindOfPattern(pattern), state: GATE_STATE.locked }
  const bits = gateBitsOf(opensAtTipMajor === undefined ? look : { ...look, opensAtTipMajor })
  return drawnMarkerOf(drawnGateOf(bits, viewer))
}

describe('lock markers drawn in the ground', () => {
  it('reads a shut hard rim as the hard rim and an open one as the open rim', () => {
    expect(drawnAs('hard_rim', AT_MAJOR_20, 21).kind).toBe('hard_rim')
    expect(drawnAs('hard_rim', AT_MAJOR_20, 20).kind).toBe('hard_rim_open')
  })

  it("reads an ordinary cell's bare rim as the hard rim until it is gone", () => {
    expect(drawnAs('bare_rim', AT_MAJOR_20, 21).kind).toBe('hard_rim')
    expect(drawnAs('bare_rim', AT_MAJOR_20, 20).kind).toBe('none')
  })

  it('reads the cracked shell as itself', () => {
    expect(drawnAs('cracked_shell')).toEqual({
      kind: 'cracked_shell',
      motion: null,
      isGlyph: false,
    })
  })

  it('reads a surface motion by name, and as its glyph with reduce motion on', () => {
    expect(drawnAs('drip-lines')).toEqual({ kind: 'motion', motion: 'drip-lines', isGlyph: false })
    const still = drawnAs('drip-lines', { ...AT_MAJOR_20, isMotionReduced: true })
    expect(still).toEqual({ kind: 'motion', motion: 'drip-lines', isGlyph: true })
  })

  it('reads no marker on a bare cell or a kind the slice never writes', () => {
    expect(drawnMarkerOf(null).kind).toBe('none')
    const unknown = drawnGateOf(gateBitsOf({ kind: MAX_GATE_KIND, state: 0 }), AT_MAJOR_20)
    expect(drawnMarkerOf(unknown).kind).toBe('none')
  })

  it('tells a tile not drawn now from a drawn tile with no marker', () => {
    expect(drawnMarkerReadOf(null, AT_MAJOR_20)).toMatchObject({ isDrawn: false, kind: 'none' })
    expect(drawnMarkerReadOf(0, AT_MAJOR_20)).toMatchObject({ isDrawn: true, kind: 'none' })
  })
})

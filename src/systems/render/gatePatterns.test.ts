import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import { continueScriptedSession } from '../authority/scriptedSession'
import { stepOfMajor } from '../economy/upgradeSteps'
import { gateBitsOf, GATE_STATE, MAX_GATE_KIND, NO_GATE_BITS } from './cellGateBits'
import {
  drawnGateOf,
  gateKindOfPattern,
  GATE_PATTERNS,
  gatePatternDefines,
  isMovingPattern,
  writeGateViewer,
  type GateViewer,
} from './gatePatterns'

const AT_MAJOR_10: GateViewer = { tipMajor: 10, isMotionReduced: false }
const REDUCED: GateViewer = { tipMajor: 10, isMotionReduced: true }

function bitsOf(pattern: (typeof GATE_PATTERNS)[number], opensAtTipMajor?: number): number {
  const look = { kind: gateKindOfPattern(pattern), state: GATE_STATE.locked }
  return gateBitsOf(opensAtTipMajor === undefined ? look : { ...look, opensAtTipMajor })
}

describe('gate marker patterns', () => {
  it('numbers every pattern apart inside the channel, with kinds left for later acts', () => {
    const kinds = GATE_PATTERNS.map(gateKindOfPattern)
    expect(new Set(kinds).size).toBe(GATE_PATTERNS.length)
    expect(Math.max(...kinds)).toBeLessThan(MAX_GATE_KIND)
  })

  it('names each pattern for the shader by its kind', () => {
    expect(gatePatternDefines()).toMatchObject({
      GATE_HARD_RIM: gateKindOfPattern('hard_rim'),
      GATE_CRACKED_SHELL: gateKindOfPattern('cracked_shell'),
      GATE_CONCENTRIC_RINGS: gateKindOfPattern('concentric-rings'),
      GATE_BARE_RIM: gateKindOfPattern('bare_rim'),
    })
  })

  it('draws no marker on a cell with no gate', () => {
    expect(drawnGateOf(NO_GATE_BITS, AT_MAJOR_10)).toBeNull()
  })

  it('keeps a hard rim shut below its opening major and glinting open from it', () => {
    expect(drawnGateOf(bitsOf('hard_rim', 11), AT_MAJOR_10)).toMatchObject({
      pattern: 'hard_rim',
      isOpen: false,
    })
    expect(drawnGateOf(bitsOf('hard_rim', 10), AT_MAJOR_10)).toMatchObject({
      pattern: 'hard_rim',
      isOpen: true,
    })
  })

  it('takes a bare rim away once the tip opens it', () => {
    expect(drawnGateOf(bitsOf('bare_rim', 11), AT_MAJOR_10)?.pattern).toBe('bare_rim')
    expect(drawnGateOf(bitsOf('bare_rim', 3), AT_MAJOR_10)).toBeNull()
  })

  it('keeps a gate no tip opens shut at any major', () => {
    const shell = drawnGateOf(bitsOf('cracked_shell'), { ...AT_MAJOR_10, tipMajor: 4096 })
    expect(shell).toMatchObject({ pattern: 'cracked_shell', isOpen: false })
  })

  it('holds a moving pattern still as its glyph with reduce motion, and no static one', () => {
    expect(drawnGateOf(bitsOf('concentric-rings'), AT_MAJOR_10)?.isGlyph).toBe(false)
    expect(drawnGateOf(bitsOf('concentric-rings'), REDUCED)?.isGlyph).toBe(true)
    expect(drawnGateOf(bitsOf('cracked_shell'), REDUCED)?.isGlyph).toBe(false)
    expect(drawnGateOf(bitsOf('hard_rim', 0), REDUCED)?.isGlyph).toBe(false)
  })

  it("moves only the extractors' surface patterns", () => {
    const moving = GATE_PATTERNS.filter(isMovingPattern)
    expect(moving).toEqual([
      'concentric-rings',
      'vapour-wisps',
      'drip-lines',
      'filing-lines',
      'rising-ripples',
    ])
  })

  it('draws a kind past the catalogue as the placeholder', () => {
    const drawn = drawnGateOf(gateBitsOf({ kind: MAX_GATE_KIND, state: 0 }), AT_MAJOR_10)
    expect(drawn).toMatchObject({ pattern: null, kind: MAX_GATE_KIND })
  })

  it("views the ground from the tip of the player's last completed major, not its pips", () => {
    const session = continueScriptedSession(
      createAuthorityState({ planetIndex: 7, planetSeed: 1, playerIds: ['p1'] }),
    )
    const viewerAtTip = (level: number, isMotionReduced: boolean) => {
      session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_tip', level } })
      const viewer = { tipMajor: 0, isMotionReduced: false }
      return writeGateViewer(viewer, session.state(), 'p1', isMotionReduced)
    }
    expect(viewerAtTip(stepOfMajor(12) - 1, true)).toEqual({ tipMajor: 11, isMotionReduced: true })
    expect(viewerAtTip(stepOfMajor(12), false)).toEqual({ tipMajor: 12, isMotionReduced: false })
  })
})

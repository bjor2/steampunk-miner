import { describe, expect, it } from 'vitest'
import { actOf } from '../../../planet-mix'
import { paramsOn, sessionOn, setTipMajor, worldCellOfGate } from '../gateFixtures'
import { GATE_ROWS } from '../gateRows'
import type { CellGateKind } from '../gateTable'
import { lockMarkerOf, motionSignatureOf } from './lockMarkers'
import { actTintOf, hueOfHex, isReservedHue, signatureTintOf } from './markerTints'

// #142's lockMarkerOf (ticket 238): the marker a gated ore cell wears before contact.

const FIRE = 8
const FROST = 17

function markedCellOn(planet: number, kind: CellGateKind, isSignature = false) {
  const session = sessionOn(planet)
  const found = worldCellOfGate(
    paramsOn(session),
    (gate, ore) => gate.kind === kind && (ore.signature === true) === isSignature,
  )
  return { session, ...found }
}

describe('lock markers', () => {
  it('seals a dynamite cell in a cracked shell', () => {
    const { session, tile } = markedCellOn(7, 'dynamite')
    expect(lockMarkerOf(session.state(), 'p1', tile)).toEqual({
      kind: 'cracked_shell',
      motion: null,
      tint: null,
    })
  })

  it("moves an extractor cell's surface with its extractor's own motion", () => {
    const { session, tile, gate } = markedCellOn(FIRE, 'rig')
    const rigId = gate.kind === 'rig' ? gate.rig.id : ''
    expect(lockMarkerOf(session.state(), 'p1', tile)).toEqual({
      kind: 'motion',
      motion: motionSignatureOf(rigId),
      tint: null,
    })
  })

  it('gives each extractor a motion of its own', () => {
    const motions = GATE_ROWS.rigs.map((rig) => motionSignatureOf(rig.id))
    expect(motions).not.toContain(null)
    expect(new Set(motions).size).toBe(GATE_ROWS.rigs.length)
  })

  it('rims a dense cell, and opens the rim once the last major cuts it', () => {
    const { session, tile, ore } = markedCellOn(7, 'dense')
    setTipMajor(session, ore.tier)
    expect(lockMarkerOf(session.state(), 'p1', tile).kind).toBe('hard_rim')
    setTipMajor(session, ore.tier + 1)
    expect(lockMarkerOf(session.state(), 'p1', tile).kind).toBe('hard_rim_open')
  })

  it('keeps the rim shut through the pips before the major that cuts it', () => {
    const { session, tile, ore } = markedCellOn(7, 'dense')
    setTipMajor(session, ore.tier, 9)
    expect(lockMarkerOf(session.state(), 'p1', tile).kind).toBe('hard_rim')
  })

  it('leaves rock, air and an open ordinary cell unmarked', () => {
    const session = sessionOn(7)
    expect(lockMarkerOf(session.state(), 'p1', { tx: 0, ty: 0 }).kind).toBe('none')
  })

  it("tints a signature cell's marker with its act, and an ordinary one not at all", () => {
    const signature = markedCellOn(FIRE, 'rig', true)
    const lead = markedCellOn(FIRE, 'rig', false)
    expect(lockMarkerOf(signature.session.state(), 'p1', signature.tile).tint).toBe(
      signatureTintOf(FIRE, signature.ore.family),
    )
    expect(lockMarkerOf(lead.session.state(), 'p1', lead.tile).tint).toBeNull()
  })
})

describe('signature marker tints', () => {
  it('tints a Frost signature apart from a Fire one', () => {
    const fire = signatureTintOf(FIRE, actOf(FIRE).signature ?? '')
    const frost = signatureTintOf(FROST, actOf(FROST).signature ?? '')
    expect(fire).not.toBeNull()
    expect(frost).not.toBeNull()
    expect(fire).not.toBe(frost)
  })

  it("never tints an act's signature in the reserved heat hues, so Fire wears its secondary", () => {
    const planets = [3, FIRE, FROST, 25, 33, 41, 42, 43, 44, 45]
    const tints = planets.map((p) => signatureTintOf(p, actOf(p).signature ?? '') ?? '#000000')
    expect(tints.filter((tint) => isReservedHue(hueOfHex(tint)))).toEqual([])
    expect(signatureTintOf(FIRE, 'radioactive')).toBe(actTintOf('fire')?.secondary)
  })

  it("takes the secondary where the rim's hue meets the family's own (#151 hue collision)", () => {
    expect(signatureTintOf(FROST, 'alien')).toBe(actTintOf('frost')?.rim)
    expect(signatureTintOf(FROST, 'metal')).toBe(actTintOf('frost')?.secondary)
  })

  it('reads the hue of a colour in degrees', () => {
    expect([hueOfHex('#ff0000'), hueOfHex('#00ff00'), hueOfHex('#0000ff')]).toEqual([0, 120, 240])
    expect(hueOfHex('#808080')).toBe(0)
  })
})

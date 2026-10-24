import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { slotOfPartId } from '../../../systems/art/artIds'
import { lookBodyQuadsOf, lookPartIdsOf } from '../../../systems/render/lookPartQuads'
import { vehicleBodyQuadsOf } from '../../../systems/render/vehicleLook'
import { createRigLookSources } from './rigLookSource'
import { rigLookOf, SHIPPED_RIG_LOOKS, trackLookFramesOf } from './rigLooks'
import { partSwapsOf } from './render/rigLookParts'
import { everyLookFrameOf } from './render/rigLookFrames'

/**
 * The boiler's authored steps on its band edges of 5 (ticket 809): the twin-drum boiler (ticket
 * 583), then each LK2 part fitted in its socket in G&V's order (ticket 810). Past the top step the
 * finish bands keep the top part.
 */
const BAND = 5
const STEPS: readonly { from: number; part: string }[] = [
  { from: 5, part: 'twin-drum-boiler' },
  { from: 10, part: 'gauged-boiler' },
  { from: 15, part: 'whistle-boiler' },
  { from: 20, part: 'manifold-boiler' },
  { from: 25, part: 'steam-drum-boiler' },
  { from: 30, part: 'firebox-boiler' },
]
const FIRST_STEP = STEPS[0].from
const TOP = STEPS[STEPS.length - 1]
const TAIL_POINTS = [TOP.from + BAND, TOP.from + 2 * BAND, 1_000, 10_000]

const lookIdOf = (part: string) => `vehicle-look-boiler/${part}`

function swapsAt(n: number) {
  const frame = rigLookOf('boiler', n)
  return frame === null ? [] : partSwapsOf([frame], [])
}

function drawnSlotsAt(n: number, tier: number): string[] {
  return vehicleBodyQuadsOf(SHIPPED_ART, tier, [], swapsAt(n)).map((q) => slotOfPartId(q.partId))
}

function withBoilerLevel(state: AuthorityState, level: number): AuthorityState {
  const player = state.players.p1
  const vehicle = { ...player.vehicle, levels: { ...player.vehicle.levels, boiler: level } }
  return { ...state, players: { ...state.players, p1: { ...player, vehicle } } }
}

describe('boiler rig look (tickets 583 and 810)', () => {
  it('keeps the rig boiler below 5 purchases', () => {
    expect(swapsAt(FIRST_STEP - 1)).toEqual([])
    expect(drawnSlotsAt(FIRST_STEP - 1, 1)).toContain('boiler')
  })

  it('has at least 5 authored steps, one on each of the first band edges', () => {
    expect(STEPS.length).toBeGreaterThanOrEqual(5)
    STEPS.forEach((step, at) => {
      expect(step.from).toBe((at + 1) * BAND)
      expect(rigLookOf('boiler', step.from)?.step).toBe(at + 1)
    })
  })

  it.each(STEPS)(
    'swaps $part in at $from, in place of the rig boiler, to the next edge',
    (step) => {
      for (const n of [step.from, step.from + BAND - 1]) {
        expect(lookPartIdsOf(SHIPPED_ART, swapsAt(n))).toEqual([lookIdOf(step.part)])
        expect(drawnSlotsAt(n, 1)).not.toContain('boiler')
      }
    },
  )

  it.each([1, 2, 3])('draws every look part on hull.boiler at visual tier %i', (tier) => {
    for (const step of STEPS) {
      const [drawn] = lookBodyQuadsOf(SHIPPED_ART, swapsAt(step.from))
      expect(drawn.quad.partId).toBe(step.part)
      expect(drawnSlotsAt(step.from, tier)).not.toContain('boiler')
    }
  })

  it('keeps the firebox door boiler on every finish band above the top step', () => {
    for (const n of TAIL_POINTS) {
      expect(lookPartIdsOf(SHIPPED_ART, swapsAt(n))).toEqual([lookIdOf(TOP.part)])
    }
  })

  it('shows a different look on each neighbouring band from the first step on', () => {
    for (let n = FIRST_STEP - 1; n < FIRST_STEP + 60 * BAND; n += BAND) {
      expect(rigLookOf('boiler', n + BAND)).not.toEqual(rigLookOf('boiler', n))
    }
  })

  it('lights every look part itself, under the rigBody cap, so a finish shows on it', () => {
    const frames = trackLookFramesOf(SHIPPED_RIG_LOOKS, 'boiler')!
    for (const step of STEPS) {
      expect(frames.rows.glowSlots.flat()).toContain(slotOfPartId(step.part))
    }
    expect(everyLookFrameOf(frames).every((frame) => frame.glows.every((g) => g < 1))).toBe(true)
  })

  it('leaves the state digest byte-identical at the lowest and the highest look', () => {
    for (const n of [FIRST_STEP, 10_000]) {
      const state = withBoilerLevel(createScriptedSession().state(), n)
      const digest = stateDigest(state)
      for (const source of createRigLookSources()) source.lookOf(state, 'p1', 0)
      for (const tier of [1, 3]) vehicleBodyQuadsOf(SHIPPED_ART, tier, [], swapsAt(n))
      expect(stateDigest(state)).toBe(digest)
    }
  })
})

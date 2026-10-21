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

/** Systems' boiler threshold (#157 comment 6300543785): the one step, Twin-drum boiler. */
const TOP_STEP = 16
const TAIL_POINTS = [17, 18, 1_000, 10_000]

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

describe('boiler rig look (ticket 583)', () => {
  it('keeps the rig boiler below 16 purchases', () => {
    expect(swapsAt(TOP_STEP - 1)).toEqual([])
    expect(drawnSlotsAt(TOP_STEP - 1, 1)).toContain('boiler')
  })

  it('swaps the twin-drum boiler in at 16, in place of the rig boiler', () => {
    expect(rigLookOf('boiler', TOP_STEP)?.step).toBe(1)
    expect(lookPartIdsOf(SHIPPED_ART, swapsAt(TOP_STEP))).toEqual([
      'vehicle-look-boiler/twin-drum-boiler',
    ])
    expect(drawnSlotsAt(TOP_STEP, 1)).not.toContain('boiler')
  })

  it.each([1, 2, 3])('draws the twin-drum boiler on hull.boiler at visual tier %i', (tier) => {
    const [drawn] = lookBodyQuadsOf(SHIPPED_ART, swapsAt(TOP_STEP))
    expect(drawn.quad.partId).toBe('twin-drum-boiler')
    expect(drawnSlotsAt(TOP_STEP, tier)).not.toContain('boiler')
  })

  it('keeps the twin-drum boiler on every tail purchase above the top step', () => {
    for (const n of TAIL_POINTS) {
      expect(lookPartIdsOf(SHIPPED_ART, swapsAt(n))).toEqual([
        'vehicle-look-boiler/twin-drum-boiler',
      ])
    }
  })

  it('shows a different look on each neighbouring purchase from the step on', () => {
    for (let n = TOP_STEP - 1; n < TOP_STEP + 60; n += 1) {
      expect(rigLookOf('boiler', n + 1)).not.toEqual(rigLookOf('boiler', n))
    }
  })

  it('lights the twin-drum boiler itself, so a tail tint shows on the look part', () => {
    const frames = trackLookFramesOf(SHIPPED_RIG_LOOKS, 'boiler')!
    expect(frames.rows.glowSlots.flat()).toContain(slotOfPartId('twin-drum-boiler'))
    expect(everyLookFrameOf(frames).every((frame) => frame.glows.every((g) => g < 1))).toBe(true)
  })

  it('leaves the state digest byte-identical at the lowest and the highest look', () => {
    for (const n of [TOP_STEP, 10_000]) {
      const state = withBoilerLevel(createScriptedSession().state(), n)
      const digest = stateDigest(state)
      for (const source of createRigLookSources()) source.lookOf(state, 'p1', 0)
      for (const tier of [1, 3]) vehicleBodyQuadsOf(SHIPPED_ART, tier, [], swapsAt(n))
      expect(stateDigest(state)).toBe(digest)
    }
  })
})

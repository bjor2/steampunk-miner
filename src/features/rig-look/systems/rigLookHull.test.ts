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
 * Systems' hull thresholds (#157 comment 6300543785) in `levels.hull` purchases, each with the
 * #584 part Progression's name is cut from (#157 comment 6300549964).
 */
const HULL_STEPS = [
  { from: 20, part: 'riveted-plate', card: 'Riveted plate' },
  { from: 80, part: 'banded-iron', card: 'Banded iron' },
  { from: 140, part: 'brass-trimmed-armour', card: 'Brass-trimmed armour' },
  { from: 260, part: 'layered-armour', card: 'Layered armour' },
  { from: 440, part: 'filigree-armour', card: 'Filigree armour' },
] as const
const TOP_STEP = 440
const TAIL_POINTS = [441, 442, 1_000, 10_000]

function swapsAt(n: number) {
  const frame = rigLookOf('hull', n)
  return frame === null ? [] : partSwapsOf([frame], [])
}

function drawnPartIdsAt(n: number, tier: number): string[] {
  return vehicleBodyQuadsOf(SHIPPED_ART, tier, [], swapsAt(n)).map((q) => q.partId)
}

function withHullLevel(state: AuthorityState, level: number): AuthorityState {
  const player = state.players.p1
  const vehicle = { ...player.vehicle, levels: { ...player.vehicle.levels, hull: level } }
  return { ...state, players: { ...state.players, p1: { ...player, vehicle } } }
}

describe('hull rig look (ticket 585)', () => {
  it('keeps the bare rig below 20 purchases', () => {
    expect(swapsAt(19)).toEqual([])
    expect(lookPartIdsOf(SHIPPED_ART, swapsAt(19))).toEqual([])
  })

  it.each(HULL_STEPS)('lays $part over the pod from $from purchases', ({ from, part }) => {
    expect(rigLookOf('hull', from - 1)?.partId).not.toBe(part)
    expect(lookPartIdsOf(SHIPPED_ART, swapsAt(from))).toEqual([`vehicle-look-hull/${part}`])
  })

  it('names Progression’s five steps in order', () => {
    const frames = trackLookFramesOf(SHIPPED_RIG_LOOKS, 'hull')!
    expect(frames.rows.steps.map((step) => step.card)).toEqual(HULL_STEPS.map((s) => s.card))
  })

  it.each([1, 2, 3])('hides no rig part under the armour at visual tier %i', (tier) => {
    const [drawn] = lookBodyQuadsOf(SHIPPED_ART, swapsAt(TOP_STEP))
    expect(drawn.quad.partId).toBe('filigree-armour')
    expect(drawnPartIdsAt(TOP_STEP, tier)).toEqual(drawnPartIdsAt(19, tier))
  })

  it('keeps the filigree armour on every tail purchase above the top step', () => {
    for (const n of TAIL_POINTS) {
      expect(lookPartIdsOf(SHIPPED_ART, swapsAt(n))).toEqual(['vehicle-look-hull/filigree-armour'])
    }
  })

  it('shows a different look on each neighbouring purchase from the top step on', () => {
    for (let n = TOP_STEP - 1; n < TOP_STEP + 60; n += 1) {
      expect(rigLookOf('hull', n + 1)).not.toEqual(rigLookOf('hull', n))
    }
  })

  it('changes the look on each step’s first purchase', () => {
    for (const { from } of HULL_STEPS) {
      expect(rigLookOf('hull', from)).not.toEqual(rigLookOf('hull', from - 1))
    }
  })

  it('lights every armour part itself, so a tail tint shows on the plating over the pod', () => {
    const frames = trackLookFramesOf(SHIPPED_RIG_LOOKS, 'hull')!
    for (const { part } of HULL_STEPS) {
      expect(frames.rows.glowSlots.flat()).toContain(slotOfPartId(part))
    }
    expect(everyLookFrameOf(frames).every((frame) => frame.glows.every((g) => g < 1))).toBe(true)
  })

  it('leaves the state digest byte-identical at the lowest and the highest look', () => {
    const digests = [HULL_STEPS[0].from, 10_000].map((n) => {
      const state = withHullLevel(createScriptedSession().state(), n)
      const digest = stateDigest(state)
      for (const source of createRigLookSources()) source.lookOf(state, 'p1', 0)
      for (const tier of [1, 3]) vehicleBodyQuadsOf(SHIPPED_ART, tier, [], swapsAt(n))
      expect(stateDigest(state)).toBe(digest)
      return stateDigest(withHullLevel(state, 0))
    })
    expect(digests[1]).toBe(digests[0])
  })
})

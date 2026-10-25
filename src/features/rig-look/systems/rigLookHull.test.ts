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
import { everyLookFrameOf, type RigLookFrame } from './render/rigLookFrames'

const ASSET_ID = 'vehicle-look-hull'
const HULL = trackLookFramesOf(SHIPPED_RIG_LOOKS, 'hull')!

/**
 * The band edges of 120 `levels.hull` purchases (ticket 809) to about P40: #584's five parts
 * first, named by Progression (#157 comment 6300549964), then the LK7 parts of ticket 816, each
 * the filigree armour with one more part fitted in a socket: the plates, then the rivets on
 * them, then the armour skirts.
 */
const STEPS = [
  { from: 120, card: 'Riveted plate', part: 'riveted-plate' },
  { from: 240, card: 'Banded iron', part: 'banded-iron' },
  { from: 360, card: 'Brass-trimmed armour', part: 'brass-trimmed-armour' },
  { from: 480, card: 'Layered armour', part: 'layered-armour' },
  { from: 600, card: 'Filigree armour', part: 'filigree-armour' },
  { from: 720, card: 'Keel strake', part: 'keel-strake-armour' },
  { from: 840, card: 'Stern plate', part: 'stern-plated-armour' },
  { from: 960, card: 'Bow plate', part: 'bow-plated-armour' },
  { from: 1080, card: 'Corner plates', part: 'corner-plated-armour' },
  { from: 1200, card: 'Hatch ring', part: 'hatch-ringed-armour' },
  { from: 1320, card: 'Keel rivets', part: 'keel-riveted-armour' },
  { from: 1440, card: 'Cap rivets', part: 'cap-riveted-armour' },
  { from: 1560, card: 'Corner rivets', part: 'corner-riveted-armour' },
  { from: 1680, card: 'Hatch bolts', part: 'hatch-bolted-armour' },
  { from: 1800, card: 'Skirt rail', part: 'skirt-rail-armour' },
  { from: 1920, card: 'Stern skirt', part: 'stern-skirt-armour' },
  { from: 2040, card: 'Bow skirt', part: 'bow-skirt-armour' },
  { from: 2160, card: 'Full skirt', part: 'full-skirt-armour' },
  { from: 2280, card: 'Skirt bosses', part: 'bossed-skirt-armour' },
]
const FIRST = STEPS[0].from
const TOP = STEPS[STEPS.length - 1]
const BAND = 120
const VISUAL_TIERS = [1, 2, 3]
const TAIL_POINTS = [TOP.from + BAND, TOP.from + 2 * BAND, 10_000, 1_000_000]
/** The ticket's order: plates, then rivets, then armour skirts. */
const PLATE_STEPS = STEPS.slice(5, 10)
const RIVET_STEPS = STEPS.slice(10, 14)
const SKIRT_STEPS = STEPS.slice(14)

const hullAt = (n: number): RigLookFrame | null => rigLookOf('hull', n)

function swapsAt(n: number) {
  const frame = hullAt(n)
  return frame === null ? [] : partSwapsOf([frame], [])
}

function drawnPartIdsAt(n: number, tier: number): string[] {
  return vehicleBodyQuadsOf(SHIPPED_ART, tier, [], swapsAt(n)).map((q) => q.partId)
}

/** What a frame draws: its part, asset, tint, glow and finish. */
const shownOf = (frame: RigLookFrame | null): string =>
  frame === null
    ? 'bare'
    : JSON.stringify([frame.partId, frame.assetId, frame.tint, frame.glows, frame.finish])

function withHullLevel(state: AuthorityState, level: number): AuthorityState {
  const player = state.players.p1
  const vehicle = { ...player.vehicle, levels: { ...player.vehicle.levels, hull: level } }
  return { ...state, players: { ...state.players, p1: { ...player, vehicle } } }
}

describe('hull rig look (tickets 585 and 816)', () => {
  it('reads its nineteen steps from the table, one on each band edge of 120 to 2280', () => {
    expect(HULL.rows.steps.map(({ from, card, part }) => ({ from, card, part }))).toEqual(STEPS)
    expect(HULL.rows.steps.every((step) => step.asset === ASSET_ID)).toBe(true)
    expect(HULL.rows.band.edges).toEqual(STEPS.map((step) => step.from))
  })

  it('keeps #584’s five parts as the first steps and authors to about P40 (at least 5)', () => {
    expect(STEPS.slice(0, 5).map((step) => step.part)).toEqual([
      'riveted-plate',
      'banded-iron',
      'brass-trimmed-armour',
      'layered-armour',
      'filigree-armour',
    ])
    expect(STEPS.length).toBeGreaterThanOrEqual(5)
    expect(TOP.from).toBe(HULL.rows.band.edges.at(-1))
  })

  it('fits the new parts in the ticket’s order: plates, then rivets, then armour skirts', () => {
    expect(PLATE_STEPS.map((step) => step.card)).toEqual([
      'Keel strake',
      'Stern plate',
      'Bow plate',
      'Corner plates',
      'Hatch ring',
    ])
    expect(RIVET_STEPS.map((step) => step.card)).toEqual([
      'Keel rivets',
      'Cap rivets',
      'Corner rivets',
      'Hatch bolts',
    ])
    expect(SKIRT_STEPS.map((step) => step.card)).toEqual([
      'Skirt rail',
      'Stern skirt',
      'Bow skirt',
      'Full skirt',
      'Skirt bosses',
    ])
  })

  it('keeps the bare rig below 120 purchases', () => {
    expect(swapsAt(FIRST - 1)).toEqual([])
    expect(lookPartIdsOf(SHIPPED_ART, swapsAt(FIRST - 1))).toEqual([])
  })

  it.each(STEPS)(
    'lays the $card over the pod from $from purchases to the next edge',
    ({ from, part }) => {
      expect(hullAt(from - 1)?.partId).not.toBe(part)
      for (const n of [from, from + 1, from + BAND - 1]) {
        expect(lookPartIdsOf(SHIPPED_ART, swapsAt(n))).toEqual([`${ASSET_ID}/${part}`])
      }
    },
  )

  it.each(VISUAL_TIERS)('hides no rig part under any armour at visual tier %i', (tier) => {
    const bare = drawnPartIdsAt(FIRST - 1, tier)
    for (const step of STEPS) {
      const [drawn] = lookBodyQuadsOf(SHIPPED_ART, swapsAt(step.from))
      expect(drawn.quad.partId).toBe(step.part)
      expect(drawn.quad.uv).not.toBeNull()
      expect(drawnPartIdsAt(step.from, tier)).toEqual(bare)
    }
  })

  it('keeps the bossed skirt on every finish band above the top step', () => {
    for (const n of TAIL_POINTS) {
      expect(lookPartIdsOf(SHIPPED_ART, swapsAt(n))).toEqual([`${ASSET_ID}/${TOP.part}`])
    }
  })

  it('shows a different look on each neighbouring band from the top step on', () => {
    for (let n = TOP.from - 1; n < TOP.from + 60 * BAND; n += BAND) {
      expect(shownOf(hullAt(n + BAND))).not.toBe(shownOf(hullAt(n)))
    }
  })

  it('changes the look at every step, from the bare rig on', () => {
    const counts = [FIRST - 1, ...STEPS.map((step) => step.from)]
    const shown = counts.map((n) => shownOf(hullAt(n)))
    expect(new Set(shown).size).toBe(counts.length)
  })

  it('lights every armour part itself under the rig body cap, so a finish shows on it', () => {
    for (const { part } of STEPS) {
      expect(HULL.rows.glowSlots.flat()).toContain(slotOfPartId(part))
    }
    expect(everyLookFrameOf(HULL).every((frame) => frame.glows.every((g) => g < 1))).toBe(true)
  })

  it('leaves the state digest byte-identical at the lowest and the highest look', () => {
    const digests = [FIRST, TOP.from, 1_000_000].map((n) => {
      const state = withHullLevel(createScriptedSession().state(), n)
      const digest = stateDigest(state)
      for (const source of createRigLookSources()) source.lookOf(state, 'p1', 0)
      for (const tier of VISUAL_TIERS) vehicleBodyQuadsOf(SHIPPED_ART, tier, [], swapsAt(n))
      expect(stateDigest(state)).toBe(digest)
      return stateDigest(withHullLevel(state, 0))
    })
    expect(new Set(digests).size).toBe(1)
  })
})

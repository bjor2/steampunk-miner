import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { lookBodyQuadsOf, lookHeadQuadsOf } from '../../../systems/render/lookPartQuads'
import { vehicleAttachPointOf } from '../../../systems/render/mountedPartLook'
import { vehicleBodyQuadsOf } from '../../../systems/render/vehicleLook'
import { lookFrameAt, type RigLookFrame } from './render/rigLookFrames'
import { partSwapsOf } from './render/rigLookParts'
import { createRigLookSources } from './rigLookSource'
import { rigLookOf, SHIPPED_RIG_LOOKS, trackLookFramesOf } from './rigLooks'

const ASSET_ID = 'vehicle-look-engine'
const ENGINE = trackLookFramesOf(SHIPPED_RIG_LOOKS, 'engine')!

/** Systems' thresholds (#157 comment 6300543785), Progression's names (6300549964), #586's parts. */
const STEPS = [
  { from: 2, card: 'Single piston', part: 'single-piston' },
  { from: 18, card: 'Triple flywheel', part: 'triple-flywheel' },
  { from: 26, card: 'Guild turbine', part: 'guild-turbine' },
]
const TOP = 26
const VISUAL_TIERS = [1, 2, 3]

const engineAt = (n: number): RigLookFrame => rigLookOf('engine', n)!

function withEngineLevel(state: AuthorityState, level: number): AuthorityState {
  const player = state.players.p1
  const vehicle = { ...player.vehicle, levels: { ...player.vehicle.levels, engine: level } }
  return { ...state, players: { ...state.players, p1: { ...player, vehicle } } }
}

/** What a frame draws: its part, asset, tint, glow and plating. */
const shownOf = (frame: RigLookFrame): string =>
  JSON.stringify([frame.partId, frame.assetId, frame.tint, frame.glows, frame.plating])

const bodyPartIdsAt = (tier: number, looks: ReturnType<typeof partSwapsOf>): string[] =>
  vehicleBodyQuadsOf(SHIPPED_ART, tier, [], looks).map((quad) => quad.partId)

describe('engine look (ticket 587)', () => {
  it('reads its three steps from the table at 2, 18 and 26 purchases', () => {
    expect(ENGINE.rows.steps.map(({ from, card, part }) => ({ from, card, part }))).toEqual(STEPS)
    expect(ENGINE.rows.steps.every((step) => step.asset === ASSET_ID)).toBe(true)
  })

  it('swaps no part below 2 purchases, so the rig keeps its own hub cap', () => {
    expect(engineAt(1).partId).toBeNull()
    expect(partSwapsOf([engineAt(1)], [])).toEqual([])
  })

  it.each(STEPS)('lays the $card on chassis.drive from $from purchases', (step) => {
    for (const n of [step.from, step.from + 1]) {
      const [swap] = partSwapsOf([engineAt(n)], [])
      expect(swap).toEqual({
        kind: 'swap',
        attach: 'chassis.drive',
        partIds: [step.part],
        assetId: ASSET_ID,
      })
    }
  })

  it.each(VISUAL_TIERS)(
    'draws each step over the middle roller and the chassis, hiding no rig part, at tier %i',
    (tier) => {
      const bare = bodyPartIdsAt(tier, [])
      for (const step of STEPS) {
        const looks = partSwapsOf([engineAt(step.from)], [])
        const body = lookBodyQuadsOf(SHIPPED_ART, looks)
        expect(body.map((look) => [look.assetId, look.quad.partId])).toEqual([
          [ASSET_ID, step.part],
        ])
        expect(body[0].quad.uv).not.toBeNull()
        expect(body[0].quad.pivot).toEqual(vehicleAttachPointOf(SHIPPED_ART, 'chassis.drive')?.atM)
        expect(lookHeadQuadsOf(SHIPPED_ART, looks)).toEqual([])
        expect(bodyPartIdsAt(tier, looks)).toEqual(bare)
        const chassis = vehicleBodyQuadsOf(SHIPPED_ART, tier, [], looks).find((quad) =>
          quad.partId.endsWith('-chassis'),
        )!
        expect(body[0].quad.z).toBeGreaterThan(chassis.z)
      }
    },
  )

  it('keeps the Guild turbine on the tail and shows a new look on every purchase', () => {
    for (let n = TOP; n < TOP + 200; n++) {
      expect(engineAt(n + 1).partId).toBe('guild-turbine')
      expect(shownOf(engineAt(n + 1))).not.toBe(shownOf(engineAt(n)))
    }
  })

  it('changes the look at every step, from the bare rig on', () => {
    const counts = [1, ...STEPS.map((step) => step.from)]
    const shown = counts.map((n) => shownOf(engineAt(n)))
    expect(new Set(shown).size).toBe(counts.length)
  })

  it('lights the laid-on part, so the step tint and the tail show on it', () => {
    const source = createRigLookSources().find((each) => each.id === 'rig-look.engine')!
    for (const n of [2, 18, TOP + 1, TOP + 2]) {
      const state = withEngineLevel(createScriptedSession().state(), n)
      const look = source.lookOf(state, 'p1', 0)!
      expect(look.glows[0].slots).toContain(engineAt(n).partId)
    }
  })

  it('leaves the state digest as it was at the lowest and the highest look', () => {
    const digests = [STEPS[0].from, TOP, 10_000].map((n) => {
      const state = withEngineLevel(createScriptedSession().state(), n)
      const digest = stateDigest(state)
      const looks = partSwapsOf([lookFrameAt(ENGINE, n)], [])
      for (const source of createRigLookSources()) source.lookOf(state, 'p1', 0)
      for (const tier of VISUAL_TIERS) vehicleBodyQuadsOf(SHIPPED_ART, tier, [], looks)
      expect(stateDigest(state)).toBe(digest)
      return stateDigest(withEngineLevel(state, 0))
    })
    expect(new Set(digests).size).toBe(1)
  })
})

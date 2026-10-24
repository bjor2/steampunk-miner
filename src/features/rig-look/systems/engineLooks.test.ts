import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import {
  createAuthorityState,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import { CLICK_CHAIN } from '../../../systems/authority/purchaseChain'
import {
  createScriptedSession,
  dockInBay,
  WORLD_SEED,
} from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { paceScale } from '../../../systems/economy/planetEconomy'
import { toCanonical } from '../../../systems/money'
import { buyUpgradeCommand } from '../../../systems/platform/platformCommands'
import { grantMoneyCommand } from '../../../systems/startScenarioCommands'
import { setUpgradeCommand } from '../../../systems/vehicle/vehicleCommands'
import { lookBodyQuadsOf, lookHeadQuadsOf } from '../../../systems/render/lookPartQuads'
import { vehicleAttachPointOf } from '../../../systems/render/mountedPartLook'
import { vehicleBodyQuadsOf } from '../../../systems/render/vehicleLook'
import { lookFrameAt, type RigLookFrame } from './render/rigLookFrames'
import { partSwapsOf } from './render/rigLookParts'
import { createRigLookSources, rigLookOfPlayer } from './rigLookSource'
import { rigLookOf, rigLookPlaqueFactOf, SHIPPED_RIG_LOOKS, trackLookFramesOf } from './rigLooks'

const ASSET_ID = 'vehicle-look-drive'
const ENGINE = trackLookFramesOf(SHIPPED_RIG_LOOKS, 'engine')!

/**
 * The first band edges of 5 (ticket 809), Progression's names (6300549964), #731's tracks and
 * wheels, which replaced #586's drive units (GD ruling on #726), then the LK3 parts of ticket 811
 * fitted on the guild track in the ticket's order: a flywheel, then twin exhaust stacks.
 */
const STEPS = [
  { from: 5, card: 'Single piston', part: 'iron-track' },
  { from: 10, card: 'Triple flywheel', part: 'steel-track' },
  { from: 15, card: 'Guild turbine', part: 'guild-track' },
  { from: 20, card: 'Drive flywheel', part: 'flywheel-track' },
  { from: 25, card: 'Twin exhaust stacks', part: 'exhaust-track' },
]
const TOP = 25
const TOP_PART = 'exhaust-track'
const BAND = 5
const VISUAL_TIERS = [1, 2, 3]

const engineAt = (n: number): RigLookFrame => rigLookOf('engine', n)!

function withEngineLevel(state: AuthorityState, level: number): AuthorityState {
  const player = state.players.p1
  const vehicle = { ...player.vehicle, levels: { ...player.vehicle.levels, engine: level } }
  return { ...state, players: { ...state.players, p1: { ...player, vehicle } } }
}

/** What a frame draws: its part, asset, tint, glow and finish. */
const shownOf = (frame: RigLookFrame): string =>
  JSON.stringify([frame.partId, frame.assetId, frame.tint, frame.glows, frame.finish])

const bodyPartIdsAt = (tier: number, looks: ReturnType<typeof partSwapsOf>): string[] =>
  vehicleBodyQuadsOf(SHIPPED_ART, tier, [], looks).map((quad) => quad.partId)

describe('engine look (tickets 587 and 811)', () => {
  it('reads its five steps from the table, one on each of the first band edges', () => {
    expect(ENGINE.rows.steps.map(({ from, card, part }) => ({ from, card, part }))).toEqual(STEPS)
    expect(ENGINE.rows.steps.every((step) => step.asset === ASSET_ID)).toBe(true)
    expect(STEPS.length).toBeGreaterThanOrEqual(5)
    STEPS.forEach((step, at) => expect(step.from).toBe((at + 1) * BAND))
  })

  it('swaps no part below 5 purchases, so the rig keeps its own rollers and hub cap', () => {
    expect(engineAt(4).partId).toBeNull()
    expect(partSwapsOf([engineAt(4)], [])).toEqual([])
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

  it('keeps the exhaust track past the art and shows a new finish every band', () => {
    for (let n = TOP; n < TOP + 200 * BAND; n += BAND) {
      expect(engineAt(n + BAND).partId).toBe(TOP_PART)
      expect(shownOf(engineAt(n + BAND))).not.toBe(shownOf(engineAt(n)))
    }
  })

  it('changes the look at every step, from the bare rig on', () => {
    const counts = [4, ...STEPS.map((step) => step.from)]
    const shown = counts.map((n) => shownOf(engineAt(n)))
    expect(new Set(shown).size).toBe(counts.length)
  })

  it('lights the laid-on part, so the step tint and the tail show on it', () => {
    const source = createRigLookSources().find((each) => each.id === 'rig-look.engine')!
    for (const n of [5, 10, TOP + BAND, TOP + 2 * BAND]) {
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

/**
 * The drive look (ticket 726; GD ruling on #726): since #723 the engine is the only drive purchase,
 * so the tracks and wheels key on `levels.engine` with the engine row's thresholds. A drill buy
 * never moves them; the look is a pure function of (track, n), so a planet's pace row never does.
 */
describe('drive look (ticket 726)', () => {
  /** n, then the part, tint, glow and finish drawn and the plaque's fitting fact. */
  const GOLDENS: readonly (readonly [number, string])[] = [
    [0, '[null,null,null,[0],null,null]'],
    [1, '[null,null,null,[0],null,null]'],
    [6, '["iron-track","vehicle-look-drive","#d9a066",[0.3],null,"Fitting: Single piston"]'],
    [7, '["iron-track","vehicle-look-drive","#d9a066",[0.3],null,"Fitting: Single piston"]'],
    [
      101,
      '["exhaust-track","vehicle-look-drive","#4c5258",[0.74],"gunmetal","Fitting: Gunmetal · L101"]',
    ],
    [
      9_999,
      '["exhaust-track","vehicle-look-drive","#c8ccd0",[0.74],"nickel-plate","Fitting: Nickel plate · L9,999"]',
    ],
    [
      1_000_000,
      '["exhaust-track","vehicle-look-drive","#4c5258",[0.74],"gunmetal","Fitting: Gunmetal · L1,000,000"]',
    ],
  ]
  /** Planet 1 runs at pace 1, planet 8 at 1.7 (`planets.paceScale`). */
  const PACE_PLANETS = [1, 8]

  const goldenOf = (n: number): string => {
    const frame = engineAt(n)
    const plaque = rigLookPlaqueFactOf('engine', n)
    return JSON.stringify([...JSON.parse(shownOf(frame)), plaque])
  }

  function dockedSessionWith(levels: Record<string, number>) {
    const session = createScriptedSession()
    session.submit(1, grantMoneyCommand('1e60'))
    for (const [track, level] of Object.entries(levels)) {
      session.submit(1, setUpgradeCommand(track, level))
    }
    dockInBay(session, 2, 'upgrade')
    return session
  }

  /** Everything the drive look shows for p1: the frame, its swap and its paint. */
  function driveLookBytesOf(state: AuthorityState): string {
    const frame = rigLookOfPlayer(ENGINE, state, 'p1')
    const source = createRigLookSources().find((each) => each.id === 'rig-look.engine')!
    return JSON.stringify([frame, partSwapsOf([frame], []), source.lookOf(state, 'p1', 0)])
  }

  it.each(GOLDENS)('shows the committed look and plaque at %i engine purchases', (n, golden) => {
    expect(goldenOf(n)).toBe(golden)
  })

  it.each(GOLDENS)(
    'draws the same bytes at %i engine purchases on planets at different pace scales',
    (n) => {
      const [low, high] = PACE_PLANETS.map((planetIndex) =>
        createAuthorityState({ planetIndex, planetSeed: WORLD_SEED, playerIds: ['p1'] }),
      ).map((state) => driveLookBytesOf(withEngineLevel(state, n)))
      expect(toCanonical(paceScale(PACE_PLANETS[0]))).not.toBe(
        toCanonical(paceScale(PACE_PLANETS[1])),
      )
      expect(high).toBe(low)
    },
  )

  it.each([
    ['a bare rig', {}],
    ['a rig on the iron track', { engine: 7 }],
    ['a rig on the exhaust track tail', { engine: 40, drill_power: 17, drill_tip: 200 }],
  ])(
    'leaves the drive look byte-identical when %s buys drill power or a drill tip',
    (_name, levels) => {
      const session = dockedSessionWith(levels)
      const before = driveLookBytesOf(session.state())
      for (const track of ['drill_power', 'drill_tip']) {
        const events = session.submit(3, buyUpgradeCommand(track, CLICK_CHAIN))
        expect(events.map((event) => event.type)).toContain('UpgradePurchased')
        expect(driveLookBytesOf(session.state())).toBe(before)
      }
    },
  )

  it.each([
    ['onto the iron track', 4],
    ['onto the steel track', 9],
    ['onto the flywheel track', 19],
    ['onto the exhaust track', 24],
    ['onto its first finish', 29],
  ])('changes the drive look when an engine buy steps it %s', (_name, engine) => {
    const session = dockedSessionWith({ engine })
    const before = driveLookBytesOf(session.state())
    const events = session.submit(3, buyUpgradeCommand('engine', CLICK_CHAIN))
    expect(events.map((event) => event.type)).toContain('UpgradePurchased')
    expect(driveLookBytesOf(session.state())).not.toBe(before)
  })

  it('falls back to the bare rig when the drive art is missing, so a buy is never blocked', () => {
    const withoutDrive = {
      manifest: { assets: SHIPPED_ART.manifest.assets.filter((entry) => entry.id !== ASSET_ID) },
      placeholderSidecars: SHIPPED_ART.placeholderSidecars.filter(
        (sidecar) => sidecar.assetId !== ASSET_ID,
      ),
      exportedSidecars: SHIPPED_ART.exportedSidecars.filter(
        (sidecar) => sidecar.assetId !== ASSET_ID,
      ),
    }
    for (const step of STEPS) {
      const looks = partSwapsOf([engineAt(step.from)], [])
      expect(lookBodyQuadsOf(withoutDrive, looks)).toEqual([])
      expect(vehicleBodyQuadsOf(withoutDrive, 1, [], looks)).toEqual(
        vehicleBodyQuadsOf(withoutDrive, 1, [], []),
      )
    }
  })

  it('names each stage on the plaque with no level, naming the finish and level past the art', () => {
    for (const step of STEPS) {
      expect(rigLookPlaqueFactOf('engine', step.from)).toBe(`Fitting: ${step.card}`)
      expect(rigLookPlaqueFactOf('engine', step.from - 1) ?? '').not.toContain(step.card)
    }
    expect(rigLookPlaqueFactOf('engine', TOP + BAND)).toBe('Fitting: Bright brass · L30')
  })
})

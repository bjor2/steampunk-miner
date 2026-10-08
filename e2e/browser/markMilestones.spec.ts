/**
 * Mark milestones in the preview build (the GD lock on #256, build 5, ticket 276): read through
 * `steampunkDebug`, never pixels. From the committed planet-1 start scenario (seed 83921) each case
 * jumps the tree to a depth (`jumpToDepth`'s `debug.tech-tree.unlockThrough`) that researches Mark 3
 * or Mark 2 of one item, then scripts the same input through `fastForward`, so the authority acts
 * on exact ticks whatever the box's frame rate. One item per class of the #256 table:
 *
 * - charged: the sampling corer's second tap cores again (two charges spent), where Mark 2 waits;
 * - consumable: the lodestone beacon's second tap throws the beacon ahead, where Mark 2 has none left;
 * - channel: the mineral drain's second tap starts a second channel, where Mark 2 waits;
 * - toggle: the spoil auger's hold packs a plug three rows deep, where Mark 2 packs one row;
 * - always-on: the vibratory bit's crumble fires the corer's charge, where Mark 2 fires nothing.
 *
 * The tiles are seed 83921's, as the unit specs find them (`drillGearInPlay.test.ts`,
 * `drainTestSession.ts`); Mark N of an item is researched from planet `unlockTier + 3 (N - 1)`.
 */
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import type { ScriptedCommand } from '../../src/systems/fastForward'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const PLANET_1_START = readFileSync(
  new URL('../../scenarios/planet1-start.scenario.json', import.meta.url),
  'utf8',
)

const CORER = 'gear.sampling_corer'
const AUGER = 'gear.spoil_auger'
const BIT = 'gear.vibratory_bit'
const BEACON = 'consumable.lodestone_beacon'
const DRAIN = 'power.mineral_drain'

/** `FACING` in `vehiclePose.ts`. */
const FACING_RIGHT = 1
const FACING_DOWN = 2
const FACING_UP = 3

/** Planet-1 ground whose next cell down is ore, with more ore below it. */
const ABOVE_ORE = { tx: 30, ty: 280 }
/** Band-1 ground six rows under the surface, with ground below it. */
const SOFT_GROUND = { tx: 30, ty: 285 }
/** Where five ore cells lie in the drain's reach past a 1.2 m pocket (`standingTileWithOre(5)`). */
const DRAIN_ORIGIN = { tx: 12, ty: 295 }
/** The scripted session's ground column (`GROUND`): a shaft is bored down it. */
const SHAFT_TOP = { tx: 20, ty: 298 }
const SHAFT_DEPTH = 9
/** Drill tip 2.48 on planet 1: band-1 ground is under half of it, so the bit crumbles it. */
const SHARP_TIP_LEVEL = 40
const SOLID_DENSITY = 255

type Tile = { tx: number; ty: number }

async function openStartScenario(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(`/?debug&scenario=${encodeURIComponent(PLANET_1_START)}`)
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

/** A report upright over the tile (in the tile above it), at rest, drilling `drillTicks`. */
function poseOver(tile: Tile, facing: number, drillTicks = 0) {
  return {
    type: 'reportPose',
    payload: {
      x: tile.tx * 1000 + 500,
      y: (tile.ty + 1) * 1000 + 500,
      vx: 0,
      vy: 0,
      upx: 0,
      upy: 1024,
      facing,
      driving: false,
      thrusting: false,
      drilling: drillTicks > 0,
      thrustTicks: 0,
      driveTicks: 0,
      drillTicks,
      drive: { x: 0, y: 0 },
    },
  }
}

const research = (planetIndex: number) => ({
  type: 'debug.tech-tree.unlockThrough',
  payload: { planetIndex },
})
const use = (slot: string) => ({ type: 'power-up-core.use_power_up', payload: { slot } })
const hold = (slot: string) => ({ type: 'power-up-core.hold_power_up', payload: { slot } })

/** One scripted step: a command `at` ticks after the script starts. */
type Step = readonly [number, Record<string, unknown>]

/**
 * Slots `slots` (owning `owned`), then plays `steps` from the next tick and stops `endAt` ticks
 * after the script starts: the authority alone, on exact ticks.
 */
async function play(
  page: Page,
  setup: { slots: Record<string, string>; owned?: string[] },
  steps: readonly Step[],
  endAt: number,
): Promise<void> {
  await page.evaluate(
    ({ slots, owned, script, end }) => {
      const debug = window.steampunkDebug!
      const loadout = debug.setVehicleLoadout(slots, owned)
      if (!loadout.ok) throw new Error(loadout.problems.join('; '))
      const snapshot = debug.snapshot()
      if (!snapshot.ok) throw new Error('no snapshot')
      const start = snapshot.snapshot.tick + 1
      const commands = script.map(
        ([at, intent]) => ({ tick: start + at, ...intent }) as unknown as ScriptedCommand,
      )
      const played = debug.fastForward(end + 1, commands)
      if (!played.ok) throw new Error(played.problems.join('; '))
    },
    { slots: setup.slots, owned: setup.owned, script: steps, end: endAt },
  )
}

async function chargesOf(page: Page, itemId: string): Promise<number> {
  const result = await page.evaluate(
    (id) => window.steampunkDebug!.features['power-up-core'].getCharges(id),
    itemId,
  )
  return (result as unknown as { chargesLeft: number }).chargesLeft
}

/** The local player's `power-up-core` section body, from the snapshot. */
async function powerUpSection(page: Page): Promise<{ pending: { milestone?: string } | null }> {
  return page.evaluate(() => {
    const snapshot = window.steampunkDebug!.snapshot()
    if (!snapshot.ok) throw new Error('no snapshot')
    const [player] = Object.values(snapshot.snapshot.state.players)
    const section = (player?.slices ?? {})['power-up-core'] as { body: unknown } | undefined
    return (section?.body ?? { pending: null }) as { pending: { milestone?: string } | null }
  })
}

/** The tiles the spoil auger has queued to pack and not yet packed. */
async function augerTilesQueued(page: Page): Promise<number> {
  return page.evaluate(() => {
    const snapshot = window.steampunkDebug!.snapshot()
    if (!snapshot.ok) throw new Error('no snapshot')
    const edits = snapshot.snapshot.state.terrainEdits
    const tiles = edits
      .filter((edit) => edit.source === 'drill-gear.spoil_auger')
      .flatMap((edit) => edit.cells.map((cell) => `${cell.tx},${cell.ty}`))
    return new Set(tiles).size
  })
}

test.describe('Mark milestones (#256): Mark 3 against Mark 2, one item per class', () => {
  test('charged: the sampling corer cores again on a second tap only at Mark 3', async ({
    page,
  }) => {
    const errors = await openStartScenario(page)
    const corerTapped = async (planetIndex: number) => {
      await play(
        page,
        { slots: { 'drill.collar': CORER } },
        [
          [0, research(planetIndex)],
          [0, { type: 'undock', payload: {} }],
          [0, poseOver(ABOVE_ORE, FACING_DOWN)],
          [1, use('drill.collar')],
          [27, use('drill.collar')],
        ],
        60,
      )
      return chargesOf(page, CORER)
    }
    expect(await corerTapped(30)).toBe(2)
    await openStartScenario(page)
    expect(await corerTapped(27)).toBe(3)
    expect(errors).toEqual([])
  })

  test('consumable: the lodestone beacon is thrown ahead on a second tap only at Mark 3', async ({
    page,
  }) => {
    const errors = await openStartScenario(page)
    const beaconAfter = async (planetIndex: number) => {
      await play(
        page,
        { slots: { 'powerup.1': BEACON } },
        [
          [0, research(planetIndex)],
          [0, { type: 'undock', payload: {} }],
          [0, poseOver(ABOVE_ORE, FACING_RIGHT)],
          [1, use('powerup.1')],
          [21, use('powerup.1')],
        ],
        40,
      )
      const result = await page.evaluate(() =>
        window.steampunkDebug!.features['terrain-tools'].getBeacon(),
      )
      return (result as unknown as { beacon: Tile | null }).beacon
    }
    const standing = { tx: ABOVE_ORE.tx, ty: ABOVE_ORE.ty + 1 }
    expect(await beaconAfter(29)).toMatchObject({ tx: standing.tx + 12, ty: standing.ty })
    await openStartScenario(page)
    expect(await beaconAfter(26)).toMatchObject(standing)
    expect(errors).toEqual([])
  })

  test('channel: the mineral drain starts a second-tap channel only at Mark 3', async ({
    page,
  }) => {
    const errors = await openStartScenario(page)
    const centre = { x: DRAIN_ORIGIN.tx * 1000 + 500, y: DRAIN_ORIGIN.ty * 1000 + 500 }
    const standInPocket = poseOver(DRAIN_ORIGIN, FACING_UP)
    const drainTapped = async (planetIndex: number) => {
      await play(
        page,
        { slots: { 'powerup.1': DRAIN } },
        [
          [0, research(planetIndex)],
          [0, { type: 'undock', payload: {} }],
          [
            0,
            {
              type: 'debug.carveCircle',
              payload: { ...centre, radius: 1200, amount: SOLID_DENSITY },
            },
          ],
          [1, { type: 'reportPose', payload: { ...standInPocket.payload, ...centre } }],
          [10, use('powerup.1')],
          [90, use('powerup.1')],
        ],
        120,
      )
      return (await powerUpSection(page)).pending
    }
    expect(await drainTapped(15)).toMatchObject({ milestone: 'second-tap' })
    await openStartScenario(page)
    expect(await drainTapped(12)).toBeNull()
    expect(errors).toEqual([])
  })

  test('toggle: the spoil auger packs a plug three rows deep on a hold only at Mark 3', async ({
    page,
  }) => {
    const errors = await openStartScenario(page)
    const shaft = Array.from({ length: SHAFT_DEPTH }, (_, depth) => ({
      tx: SHAFT_TOP.tx,
      ty: SHAFT_TOP.ty - depth,
    }))
    const bored: Step[] = shaft.flatMap((tile, at): Step[] => [
      [10 + at * 50, poseOver(tile, FACING_DOWN)],
      [50 + at * 50, { type: 'drillTile', payload: { ...tile, ticks: 40 } }],
    ])
    const foot = { tx: SHAFT_TOP.tx, ty: SHAFT_TOP.ty - SHAFT_DEPTH }
    const augerHeld = async (planetIndex: number) => {
      await play(
        page,
        { slots: { 'drill.collar': AUGER } },
        [
          [0, research(planetIndex)],
          [0, { type: 'undock', payload: {} }],
          ...bored,
          [550, poseOver(foot, FACING_DOWN)],
          [600, use('drill.collar')],
          [601, hold('drill.collar')],
        ],
        601,
      )
      return augerTilesQueued(page)
    }
    expect(await augerHeld(14)).toBe(3)
    await openStartScenario(page)
    expect(await augerHeld(11)).toBe(1)
    expect(errors).toEqual([])
  })

  test("always-on: the vibratory bit's crumble fires the corer's charge only at Mark 3", async ({
    page,
  }) => {
    const errors = await openStartScenario(page)
    const crumbled = async (planetIndex: number) => {
      await play(
        page,
        { slots: { 'drill.head': BIT, 'drill.collar': CORER } },
        [
          [0, research(planetIndex)],
          [
            0,
            {
              type: 'debug.setUpgrade',
              payload: { upgradeId: 'drill_tip', level: SHARP_TIP_LEVEL },
            },
          ],
          [0, { type: 'undock', payload: {} }],
          [0, poseOver(SOFT_GROUND, FACING_DOWN)],
          [60, poseOver(SOFT_GROUND, FACING_DOWN, 60)],
        ],
        62,
      )
      return chargesOf(page, CORER)
    }
    expect(await crumbled(10)).toBe(3)
    await openStartScenario(page)
    expect(await crumbled(7)).toBe(4)
    expect(errors).toEqual([])
  })
})

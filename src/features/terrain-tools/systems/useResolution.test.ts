import { describe, expect, it } from 'vitest'
import {
  createAuthorityState,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { FACING, type Facing } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { chargesLeftOf, intentToHoldSlot } from '../../power-up-core'
import {
  buriedTile,
  commandsOf,
  ofType,
  oreAround,
  press,
  replayedAtEveryRate,
  researchThrough,
  roomyHoldCommand,
  standIntents,
  tilesOpenedBetween,
  type TimedIntent,
} from '../terrainTestSession'
import { LODESTONE_BEACON_ID } from './lodestoneBeacon'
import { ORE_SHIFTER_ID } from './oreShifter'
import { PRESSURE_POCKET_ID } from './pressurePocket'
import { SEAM_SPLITTER_ID } from './seamSplitter'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { GROUND, poseAbove } from '../../../systems/authority/scriptedSession'
import { describeItem } from '../../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { terrainToolsOf } from './terrainSection'

// The terrain tools' Mark milestones (the GD lock on #256, build 5), played through the real
// power-up path on the loaded slices: each tool pressed at tick 10 from a pocket underground,
// facing right, then pressed again (a second tap) or held 20 ticks after it acted. A Mark N node
// is researched from planet `unlockTier + 3 (N - 1)` (#161); every run is replayed jumped and in
// render frames of 30 and 144 a second, and must come out the same. The hold is so large that the
// movers' trip cap never binds (ticket 408): these runs say where a verb moves ore, not how much.

const PRESS_TICK = 10
const FOLLOW_GAP = 20
const END_TICK = 120
const STAND_DEPTH = 8
/** A depth whose rock past the splitter's face runs nine workable cells down. */
const SPLIT_DEPTH = 6
/** A depth with ore left on the faced side after the plain drag (23 nodules within 6 tiles). */
const ORE_RICH_DEPTH = 14

/** Mark 2 and Mark 3 of each tool, by the planet the debug grant researches through. */
const PLANET_OF_MARK: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  [ORE_SHIFTER_ID]: { 2: 9, 3: 12, 6: 21, 9: 30 },
  [SEAM_SPLITTER_ID]: { 2: 13, 3: 16, 6: 25 },
  [PRESSURE_POCKET_ID]: { 2: 17, 3: 20, 6: 29, 9: 38 },
  [LODESTONE_BEACON_ID]: { 2: 26, 3: 29, 6: 38 },
}

const WINDUP_TICKS: Readonly<Record<string, number>> = {
  [ORE_SHIFTER_ID]: 6,
  [SEAM_SPLITTER_ID]: 0,
  [PRESSURE_POCKET_ID]: 6,
  [LODESTONE_BEACON_ID]: 0,
}

type Follow = 'second-tap' | 'hold'

interface ToolRun {
  /** Every rate's result: jumped, 30 and 144 frames a second. */
  states: AuthorityState[]
  events: DomainEvent[][]
  /** The state just before the first press, and just before the follow-up. */
  beforeUse: AuthorityState
  beforeFollow: AuthorityState
  stand: TilePoint
}

function followIntent(follow: Follow) {
  return follow === 'hold' ? intentToHoldSlot('powerup.1') : press()
}

/**
 * The tool used, then followed up 20 ticks after it acted, at Mark `mark`. The miner faces right
 * unless told otherwise; facing right with no drive or latch, the side it steers toward is the
 * facing's right, below it (`facedSideOf`).
 */
function playTool(
  itemId: string,
  mark: number,
  follow: Follow,
  slots: Readonly<Record<string, string>> = {},
  depth = STAND_DEPTH,
  facing: Facing = FACING.right,
): ToolRun {
  const stand = buriedTile(depth)
  const followTick = PRESS_TICK + WINDUP_TICKS[itemId] + FOLLOW_GAP
  const setup: TimedIntent[] = [
    [0, setVehicleLoadoutCommand({ 'powerup.1': itemId, ...slots })],
    [0, researchThrough(PLANET_OF_MARK[itemId][mark])],
    [0, roomyHoldCommand()],
    [1, poseAbove(GROUND, facing)],
    ...standIntents(5, stand, facing),
    [PRESS_TICK, press()],
  ]
  const [beforeUse] = replayedAtEveryRate(commandsOf(setup.slice(0, -1)), PRESS_TICK - 1)
  const [beforeFollow] = replayedAtEveryRate(commandsOf(setup), followTick - 1)
  const runs = replayedAtEveryRate(
    commandsOf([...setup, [followTick, followIntent(follow)]]),
    END_TICK,
  )
  return {
    states: runs.map((run) => run.state),
    events: runs.map((run) => run.events),
    beforeUse: beforeUse.state,
    beforeFollow: beforeFollow.state,
    stand,
  }
}

function usedLinesOf(events: readonly DomainEvent[]) {
  return ofType(events, 'power-up-core.PowerUpUsed').map((event) =>
    event.type === 'power-up-core.PowerUpUsed' ? (event.milestone ?? 'plain') : null,
  )
}

function rejectionsOf(events: readonly DomainEvent[]) {
  return ofType(events, 'CommandRejected').map((event) =>
    event.type === 'CommandRejected' ? event.reason : null,
  )
}

function oreSpread(state: AuthorityState, stand: TilePoint): number {
  return oreAround(state, stand, 7).reduce(
    (sum, { tile }) => sum + (tile.tx - stand.tx) ** 2 + (tile.ty - stand.ty) ** 2,
    0,
  )
}

/** The same outcome on every rate: one value per rate, all equal. */
function sameAtEveryRate<T>(
  run: ToolRun,
  read: (state: AuthorityState, events: DomainEvent[]) => T,
) {
  const values = run.states.map((state, rate) => read(state, run.events[rate]))
  expect(values[1]).toEqual(values[0])
  expect(values[2]).toEqual(values[0])
  return values[0]
}

describe('terrain-tools Mark milestones (#256): Mark 3 second tap, at 30 and 144 steps/s', () => {
  it('ore-shifter: at M3 the second tap pushes the nodules out and at M2 it waits out the cooldown', () => {
    const atMark3 = playTool(ORE_SHIFTER_ID, 3, 'second-tap')
    const used3 = sameAtEveryRate(atMark3, (_state, events) => usedLinesOf(events))
    const spread3 = sameAtEveryRate(atMark3, (state) => oreSpread(state, atMark3.stand))
    expect(used3).toEqual(['plain', 'second-tap'])
    expect(spread3).toBeGreaterThan(oreSpread(atMark3.beforeFollow, atMark3.stand))

    const atMark2 = playTool(ORE_SHIFTER_ID, 2, 'second-tap')
    expect(sameAtEveryRate(atMark2, (_state, events) => usedLinesOf(events))).toEqual(['plain'])
    expect(rejectionsOf(atMark2.events[0])).toEqual(['power-up-core.cooling_down'])
    expect(oreSpread(atMark2.states[0], atMark2.stand)).toBe(
      oreSpread(atMark2.beforeFollow, atMark2.stand),
    )
  })

  it("seam splitter: at M3 the second tap splits sideways toward the side you're steering toward and at M2 along the grain", () => {
    const openedBy = (mark: number) => {
      const run = playTool(SEAM_SPLITTER_ID, mark, 'second-tap', {}, SPLIT_DEPTH)
      sameAtEveryRate(run, (_state, events) => usedLinesOf(events))
      return {
        stand: run.stand,
        opened: sameAtEveryRate(run, (state) =>
          tilesOpenedBetween(run.beforeFollow, state, run.stand, 12),
        ),
      }
    }
    const isColumn = (tiles: readonly TilePoint[]) =>
      tiles.length > 1 && new Set(tiles.map((tile) => tile.tx)).size === 1
    const atMark3 = openedBy(3)
    expect(isColumn(atMark3.opened)).toBe(true)
    expect(atMark3.opened.every((tile) => tile.ty <= atMark3.stand.ty)).toBe(true)
    expect(isColumn(openedBy(2).opened)).toBe(false)
  })

  it('pressure pocket: at M3 the second tap blows the pocket behind and at M2 it waits', () => {
    const atMark3 = playTool(PRESSURE_POCKET_ID, 3, 'second-tap')
    const opened = sameAtEveryRate(atMark3, (state) =>
      tilesOpenedBetween(atMark3.beforeFollow, state, atMark3.stand, 8),
    )
    expect(opened.length).toBeGreaterThan(0)
    expect(opened.every((tile) => tile.tx < atMark3.stand.tx)).toBe(true)

    const atMark2 = playTool(PRESSURE_POCKET_ID, 2, 'second-tap')
    expect(rejectionsOf(atMark2.events[0])).toEqual(['power-up-core.cooling_down'])
    expect(tilesOpenedBetween(atMark2.beforeFollow, atMark2.states[0], atMark2.stand, 8)).toEqual(
      [],
    )
  })

  it('lodestone beacon: at M3 the second tap throws the beacon ahead and at M2 it is refused', () => {
    const beaconAfter = (mark: number) => {
      const run = playTool(LODESTONE_BEACON_ID, mark, 'second-tap')
      return {
        run,
        beacon: sameAtEveryRate(run, (state) => terrainToolsOf(state, 'p1').beacon),
        used: sameAtEveryRate(run, (_state, events) => usedLinesOf(events)),
      }
    }
    const atMark3 = beaconAfter(3)
    expect(atMark3.used).toEqual(['plain', 'second-tap'])
    expect(atMark3.beacon?.ty).toBe(atMark3.run.stand.ty)
    expect(atMark3.beacon?.tx).toBeGreaterThan(atMark3.run.stand.tx)

    // A Mark 2 stack is the one beacon just planted: the same press finds none left.
    const atMark2 = beaconAfter(2)
    expect(atMark2.used).toEqual(['plain'])
    expect(atMark2.beacon).toMatchObject({ tx: atMark2.run.stand.tx, ty: atMark2.run.stand.ty })
    expect(rejectionsOf(atMark2.run.events[0])).toEqual(['power-up-core.no_charges'])
  })
})

describe('terrain-tools Mark milestones (#256): Mark 6 hold', () => {
  it("ore-shifter: the hold drags only nodules on the side you're steering toward", () => {
    const run = playTool(ORE_SHIFTER_ID, 6, 'hold', {}, ORE_RICH_DEPTH)
    expect(usedLinesOf(run.events[0])).toEqual(['plain', 'hold'])
    const before = oreAround(run.beforeFollow, run.stand, 7)
    const after = oreAround(run.states[0], run.stand, 7)
    const unfaced = (ore: typeof before) =>
      ore.filter(({ tile }) => tile.ty > run.stand.ty).map(({ tile }) => `${tile.tx},${tile.ty}`)
    expect(unfaced(after)).toEqual(unfaced(before))
    expect(after).not.toEqual(before)
  })

  it('seam splitter: the hold splits straight ahead of the drill', () => {
    const run = playTool(SEAM_SPLITTER_ID, 6, 'hold')
    const opened = tilesOpenedBetween(run.beforeFollow, run.states[0], run.stand, 12)
    expect(opened.length).toBeGreaterThan(1)
    expect(opened.every((tile) => tile.ty === run.stand.ty && tile.tx > run.stand.tx)).toBe(true)
  })

  it("pressure pocket: the hold blows the pocket on the side you're steering toward", () => {
    const run = playTool(PRESSURE_POCKET_ID, 6, 'hold')
    const opened = tilesOpenedBetween(run.beforeFollow, run.states[0], run.stand, 8)
    expect(opened.length).toBeGreaterThan(0)
    expect(opened.every((tile) => tile.ty < run.stand.ty)).toBe(true)
  })

  it("lodestone beacon: the hold sets the beacon out on the side you're steering toward", () => {
    const run = playTool(LODESTONE_BEACON_ID, 6, 'hold')
    const beacon = terrainToolsOf(run.states[0], 'p1').beacon
    expect(beacon?.tx).toBe(run.stand.tx)
    expect(beacon?.ty).toBeLessThan(run.stand.ty)
  })

  it('facing down, the pocket and the beacon each land the tap and the hold on different tiles', () => {
    const pocketTiles = (follow: Follow) => {
      const run = playTool(PRESSURE_POCKET_ID, 6, follow, {}, STAND_DEPTH, FACING.down)
      return tilesOpenedBetween(run.beforeFollow, run.states[0], run.stand, 8).map(
        (tile) => `${tile.tx},${tile.ty}`,
      )
    }
    const tapped = pocketTiles('second-tap')
    const held = pocketTiles('hold')
    expect(tapped.length).toBeGreaterThan(0)
    expect(held.length).toBeGreaterThan(0)
    expect(held.filter((tile) => !tapped.includes(tile)).length).toBeGreaterThan(held.length / 2)

    const beaconOf = (follow: Follow) => {
      const run = playTool(LODESTONE_BEACON_ID, 6, follow, {}, STAND_DEPTH, FACING.down)
      return terrainToolsOf(run.states[0], 'p1').beacon
    }
    const thrown = beaconOf('second-tap')
    const set = beaconOf('hold')
    expect(thrown).not.toBeNull()
    expect(set).not.toBeNull()
    expect([set?.tx, set?.ty]).not.toEqual([thrown?.tx, thrown?.ty])
  })

  it('is two actions and two charges, never a discount', () => {
    const run = playTool(ORE_SHIFTER_ID, 6, 'hold', {}, ORE_RICH_DEPTH)
    const asResearched = chargesLeftOf(run.beforeUse, 'p1', ORE_SHIFTER_ID)
    expect(chargesLeftOf(run.states[0], 'p1', ORE_SHIFTER_ID)).toBe(asResearched - 2)
  })
})

describe('terrain-tools Mark milestones (#256): Mark 9 sibling-link, the yield step', () => {
  it("the ore-shifter's act plants a slotted lodestone beacon at half its 256-swap cap", () => {
    const run = playTool(ORE_SHIFTER_ID, 9, 'second-tap', { 'powerup.2': LODESTONE_BEACON_ID })
    const fired = ofType(run.events[0], 'power-up-core.LinkFired')
    expect(fired).toMatchObject([
      { itemId: ORE_SHIFTER_ID, siblingId: LODESTONE_BEACON_ID, slot: 'powerup.2' },
    ])
    expect(terrainToolsOf(run.states[0], 'p1').beacon).toMatchObject({
      tx: run.stand.tx,
      ty: run.stand.ty,
      swapCap: 128,
    })
    expect(chargesLeftOf(run.states[0], 'p1', LODESTONE_BEACON_ID)).toBe(
      chargesLeftOf(run.beforeUse, 'p1', LODESTONE_BEACON_ID) - 1,
    )
  })

  it("the pressure pocket's act opens a seam splitter fissure at half length", () => {
    const run = playTool(PRESSURE_POCKET_ID, 9, 'second-tap', { 'powerup.2': SEAM_SPLITTER_ID })
    const fired = ofType(run.events[0], 'power-up-core.LinkFired')
    expect(fired[0]).toMatchObject({ itemId: PRESSURE_POCKET_ID, siblingId: SEAM_SPLITTER_ID })
    const fissures = ofType(run.events[0], 'terrain-tools.TerrainEdited').filter(
      (event) => event.type === 'terrain-tools.TerrainEdited' && event.itemId === SEAM_SPLITTER_ID,
    )
    expect(fissures.length).toBeGreaterThan(0)
  })

  it('does not fire with the sibling unslotted, and the use is as if unlinked', () => {
    const linked = playTool(ORE_SHIFTER_ID, 9, 'second-tap')
    expect(ofType(linked.events[0], 'power-up-core.LinkFired')).toEqual([])
    expect(terrainToolsOf(linked.states[0], 'p1').beacon).toBeNull()
  })
})

describe('terrain-tools Mark milestones (#256): the card line', () => {
  it('the card shows the next milestone verb in one line', () => {
    const state = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
    const lineAt = (itemId: string, level: number) =>
      describeItem(
        { kind: 'vehicle-item', id: itemId },
        { playerId: 'p1', planetIndex: 1, level, view: itemSnapshotViewOf(state, 'p1') },
      )?.statLines.find((line) => line.label === 'Next milestone')?.now
    expect(lineAt(ORE_SHIFTER_ID, 1)).toBe(
      'Mk III, tap twice: pushes the same nodules away from the hull',
    )
    expect(lineAt(ORE_SHIFTER_ID, 6)).toBe(
      'Mk IX, link: plants a lodestone beacon that draws in half as much ore',
    )
    expect(lineAt(SEAM_SPLITTER_ID, 6)).toBe('All reached')
  })
})

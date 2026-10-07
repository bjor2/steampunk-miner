import { describe, expect, it } from 'vitest'
import {
  createAuthorityState,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import { prepareCorridor, spawnEnemy } from '../../../systems/authority/combat/combatFixtures'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { poseAt } from '../../../systems/authority/combat/combatFixtures'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import {
  continueScriptedSession,
  createScriptedSession,
  GROUND,
  WORLD_SEED,
} from '../../../systems/authority/scriptedSession'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { isLavaCell } from '../../../systems/world/worldCell'
import { cellAt } from '../../../systems/world/worldState'
import { describeItem } from '../../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { chargesLeftOf, intentToHoldSlot, powerUpAtMarkOf } from '../../power-up-core'
import {
  commandsOf,
  ownedLoadoutIntents,
  pocketIntents,
  press,
  replayedAtEveryRate,
  researchThrough,
  type TimedIntent,
} from '../sensingTestSession'
import { BAROMETER_LINK_REACTION, LENS_LINK_REACTION } from './passiveLinks'
import { ASSAY_LENS, HAZARD_BAROMETER, THREAT_PERISCOPE } from './passiveReads'
import { boardAfterUses, EMPTY_REVEAL_BOARD } from './revealBoard'
import { echoCentreOf, echoRadiusOf, echoUntilOf, flareLandingOfUse } from './revealVerbs'
import { SHIPPED_SENSING_ITEMS } from './sensingContent'
import { ECHO_SOUNDER, FLARE_MORTAR, SIGNAL_BUOY, sensingUsesOf } from './sensingUses'

// The sensing items' Mark milestones (the GD lock on #256, build 5) through the real power-up
// path on the loaded slices. An item in slot 1 is pressed at tick 10 from a pocket underground,
// facing right, then pressed again (a second tap) or held 20 ticks after it acted. A Mark N node
// is researched from planet `unlockTier + 3 (N - 1)` (#161); each run replays jumped and in render
// frames of 30 and 144 a second. What a use reveals is derived on the client (#203), so the specs
// read the reveal from the logged uses.

const UNDERGROUND = { tx: GROUND.tx, ty: GROUND.ty - 20 }
const PRESS_TICK = 10
const FOLLOW_GAP = 20
const END_TICK = 140
/** The echo sounder's fixed radius (#162 4.2). */
const ECHO_RADIUS = 12

const PLANET_OF_MARK: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  [ECHO_SOUNDER]: { 2: 5, 3: 8, 6: 17, 9: 26 },
  [FLARE_MORTAR]: { 2: 16, 3: 19, 6: 28, 9: 37 },
  [SIGNAL_BUOY]: { 2: 24, 3: 27, 6: 36, 9: 45 },
}

type Follow = 'second-tap' | 'hold'

interface SensingRun {
  states: AuthorityState[]
  events: DomainEvent[][]
}

function setupOf(itemId: string, mark: number, slots: Readonly<Record<string, string>>) {
  return [
    [0, researchThrough(PLANET_OF_MARK[itemId][mark])],
    ...ownedLoadoutIntents({ 'powerup.1': itemId, ...slots }),
    ...pocketIntents(2, UNDERGROUND, FACING.right),
    [PRESS_TICK, press('powerup.1')],
  ] as TimedIntent[]
}

/** The item used, then followed up 20 ticks after it acted, at Mark `mark`. */
function playItem(
  itemId: string,
  mark: number,
  follow: Follow,
  slots: Readonly<Record<string, string>> = {},
): SensingRun {
  const setup = setupOf(itemId, mark, slots)
  const [first] = replayedAtEveryRate(commandsOf(setup), PRESS_TICK + 10)
  const followTick = actTickOf(first.events) + FOLLOW_GAP
  const followIntent = follow === 'hold' ? intentToHoldSlot('powerup.1') : press('powerup.1')
  const runs = replayedAtEveryRate(commandsOf([...setup, [followTick, followIntent]]), END_TICK)
  return { states: runs.map((run) => run.state), events: runs.map((run) => run.events) }
}

function actTickOf(events: readonly DomainEvent[]): number {
  const used = events.find((event) => event.type === 'power-up-core.PowerUpUsed')
  if (used === undefined) throw new Error('the first use never acted')
  return used.tick
}

/** One reading per rate, all equal. */
function sameAtEveryRate<T>(
  run: SensingRun,
  read: (state: AuthorityState, events: DomainEvent[]) => T,
) {
  const values = run.states.map((state, rate) => read(state, run.events[rate]))
  expect(values[1]).toEqual(values[0])
  expect(values[2]).toEqual(values[0])
  return values[0]
}

const usesOf = (run: SensingRun) =>
  sameAtEveryRate(run, (state, events) => sensingUsesOf(events, state))

const poseIn = (tile: TilePoint, facing: (typeof FACING)[keyof typeof FACING]) =>
  poseAt(tile, { facing })

/** The first lava tile down column 0 whose two tiles to the left are not lava (planet 8). */
function firstLavaDownColumnZero(state: AuthorityState): TilePoint {
  const params = planetParamsOf(state.planet) as PlanetParams
  const isLava = (tile: TilePoint) => isLavaCell(cellAt(state.world, params, tile))
  for (let ty = surfaceRowOfColumn(0, params.radiusTiles); ty > params.coreRadiusTiles; ty--) {
    const tile = { tx: 0, ty }
    if (isLava(tile) && !isLava({ tx: -1, ty }) && !isLava({ tx: -2, ty })) return tile
  }
  throw new Error('no lava down column 0')
}

const ofType = (events: readonly DomainEvent[], type: string) =>
  events.filter((event) => event.type === type)

function rejectionsOf(events: readonly DomainEvent[]) {
  return ofType(events, 'CommandRejected').map((event) =>
    event.type === 'CommandRejected' ? event.reason : null,
  )
}

describe('sensing Mark milestones (#256): Mark 3 second tap, at 30 and 144 steps/s', () => {
  it('echo sounder: at M3 the second tap pings one radius ahead and at M2 it waits', () => {
    const atMark3 = playItem(ECHO_SOUNDER, 3, 'second-tap')
    const uses = usesOf(atMark3)
    expect(uses.map((use) => use.milestone)).toEqual([null, 'second-tap'])
    expect(echoCentreOf(uses[0], atMark3.states[0])).toEqual(UNDERGROUND)
    expect(echoCentreOf(uses[1], atMark3.states[0])).toEqual({
      tx: UNDERGROUND.tx + ECHO_RADIUS,
      ty: UNDERGROUND.ty,
    })

    const atMark2 = playItem(ECHO_SOUNDER, 2, 'second-tap')
    expect(usesOf(atMark2).map((use) => use.milestone)).toEqual([null])
    expect(rejectionsOf(atMark2.events[0])).toEqual(['power-up-core.cooling_down'])
  })

  it('flare mortar: at M3 the second tap lobs the shell behind and at M2 ahead again', () => {
    const landingsAt = (mark: number) => {
      const run = playItem(FLARE_MORTAR, mark, 'second-tap')
      return usesOf(run).map((use) => flareLandingOfUse(use, run.states[0]).tx - UNDERGROUND.tx)
    }
    const [first, second] = landingsAt(3)
    expect(first).toBeGreaterThan(0)
    expect(second).toBe(-first)
    expect(landingsAt(2)).toEqual([first, first])
  })

  it('signal buoy: at M3 the second tap drops the buoy one ring ahead and at M2 where it stands', () => {
    const pinsAt = (mark: number) => {
      const run = playItem(SIGNAL_BUOY, mark, 'second-tap')
      return sameAtEveryRate(run, (state, events) =>
        boardAfterUses(EMPTY_REVEAL_BOARD, events, state, 'p1').pins.map((pin) => ({
          dx: pin.tile.tx - UNDERGROUND.tx,
          dy: pin.tile.ty - UNDERGROUND.ty,
          ring: pin.ringTiles,
        })),
      )
    }
    const atMark3 = pinsAt(3)
    expect(atMark3).toHaveLength(2)
    expect(atMark3[0]).toMatchObject({ dx: 0, dy: 0 })
    expect(atMark3[1]).toEqual({ dx: atMark3[1].ring, dy: 0, ring: atMark3[0].ring })
    expect(pinsAt(2).map(({ dx, dy }) => [dx, dy])).toEqual([
      [0, 0],
      [0, 0],
    ])
  })
})

describe('sensing Mark milestones (#256): Mark 6 hold', () => {
  it('echo sounder: the hold keeps its ping twice as long, at two charges', () => {
    const run = playItem(ECHO_SOUNDER, 6, 'hold')
    const [plain, held] = usesOf(run)
    expect(held.milestone).toBe('hold')
    expect(echoUntilOf(held) - held.tick).toBe(2 * (echoUntilOf(plain) - plain.tick))
    const charges = powerUpAtMarkOf(run.states[0], 'p1', ECHO_SOUNDER)?.charges ?? 0
    expect(chargesLeftOf(run.states[0], 'p1', ECHO_SOUNDER)).toBe(charges - 2)
  })

  it('flare mortar: the hold lobs the shell twice as far', () => {
    const run = playItem(FLARE_MORTAR, 6, 'hold')
    const [plain, held] = usesOf(run).map(
      (use) => flareLandingOfUse(use, run.states[0]).tx - UNDERGROUND.tx,
    )
    expect(held).toBe(2 * plain)
  })

  it('signal buoy: the hold drops the buoy one ring below the miner', () => {
    const run = playItem(SIGNAL_BUOY, 6, 'hold')
    const pins = boardAfterUses(EMPTY_REVEAL_BOARD, run.events[0], run.states[0], 'p1').pins
    expect(pins[1].tile).toEqual({ tx: UNDERGROUND.tx, ty: UNDERGROUND.ty - pins[1].ringTiles })
  })
})

describe('sensing Mark milestones (#256): Mark 9 sibling-link', () => {
  it("the echo sounder's ping drops a slotted signal buoy with half its ring", () => {
    const run = playItem(ECHO_SOUNDER, 9, 'second-tap', { 'powerup.2': SIGNAL_BUOY })
    expect(ofType(run.events[0], 'power-up-core.LinkFired')[0]).toMatchObject({
      itemId: ECHO_SOUNDER,
      siblingId: SIGNAL_BUOY,
      slot: 'powerup.2',
    })
    const linked = usesOf(run).filter((use) => use.isLinked)
    expect(linked[0]).toMatchObject({ itemId: SIGNAL_BUOY, origin: UNDERGROUND })
    const pins = boardAfterUses(EMPTY_REVEAL_BOARD, run.events[0], run.states[0], 'p1').pins
    expect(pins[0].ringTiles).toBe(2)
  })

  it("the flare mortar's shot pings a slotted echo sounder at half radius", () => {
    const run = playItem(FLARE_MORTAR, 9, 'second-tap', { 'powerup.2': ECHO_SOUNDER })
    const linked = usesOf(run).filter((use) => use.isLinked)
    expect(linked.map((use) => use.itemId)).toEqual([ECHO_SOUNDER])
    expect(echoRadiusOf(linked[0])).toBe(ECHO_RADIUS / 2)
  })

  it("the signal buoy's drop lobs a slotted flare that maps half as wide", () => {
    const run = playItem(SIGNAL_BUOY, 9, 'second-tap', { 'powerup.2': FLARE_MORTAR })
    expect(ofType(run.events[0], 'power-up-core.LinkFired')[0]).toMatchObject({
      itemId: SIGNAL_BUOY,
      siblingId: FLARE_MORTAR,
    })
  })
})

describe('sensing Mark milestones (#256): the passives link at their own moment', () => {
  /** A miner in the corridor owning every sensing item, `slots` filled, researched to `planet`. */
  function corridorSession(slots: Readonly<Record<string, string>>, planet: number) {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.right)
    const owned = SHIPPED_SENSING_ITEMS.map((item) => item.itemId)
    session.submit(start, setVehicleLoadoutCommand(slots, owned))
    session.submit(start, researchThrough(planet))
    return { session, start }
  }

  const PERISCOPE_MARK_3_PLANET = 11

  it("the threat periscope's lunge warning pings a slotted echo sounder, spending its charge", () => {
    const { session, start } = corridorSession(
      { 'powerup.1': ECHO_SOUNDER },
      PERISCOPE_MARK_3_PLANET,
    )
    const charges = chargesLeftOf(session.state(), 'p1', ECHO_SOUNDER)
    session.submit(start + 1, spawnEnemy('crawler', 1, 3))
    session.advanceTo(start + 400)
    const fired = ofType(session.events(), 'power-up-core.LinkFired')
    expect(fired[0]).toMatchObject({ itemId: THREAT_PERISCOPE, siblingId: ECHO_SOUNDER })
    expect(chargesLeftOf(session.state(), 'p1', ECHO_SOUNDER)).toBe(charges - fired.length)
  })

  it('a lunge warning before Mark 3, or with no sounder slotted, spends nothing', () => {
    const before = corridorSession({ 'powerup.1': ECHO_SOUNDER }, PERISCOPE_MARK_3_PLANET - 3)
    before.session.submit(before.start + 1, spawnEnemy('crawler', 1, 3))
    before.session.advanceTo(before.start + 400)
    expect(ofType(before.session.events(), 'power-up-core.LinkFired')).toEqual([])

    const unslotted = corridorSession({}, PERISCOPE_MARK_3_PLANET)
    unslotted.session.submit(unslotted.start + 1, spawnEnemy('crawler', 1, 3))
    unslotted.session.advanceTo(unslotted.start + 400)
    expect(ofType(unslotted.session.events(), 'power-up-core.LinkFired')).toEqual([])
  })
})

describe('sensing Mark milestones (#256): the lens and the barometer link on their moment', () => {
  const PASSIVE_MARK_3_PLANET = 13

  /** A miner owning every sensing item with `slots` filled, standing as `stand` says. */
  function standingState(
    slots: Readonly<Record<string, string>>,
    planet: number,
    session = createScriptedSession(),
  ) {
    const owned = SHIPPED_SENSING_ITEMS.map((item) => item.itemId)
    session.submit(0, setVehicleLoadoutCommand(slots, owned))
    session.submit(0, researchThrough(planet))
    return session
  }

  const oreBroken = (cause?: 'blast') =>
    ({
      type: 'TileDestroyed',
      playerId: 'p1',
      tick: 5,
      seq: 9,
      tx: UNDERGROUND.tx + 1,
      ty: UNDERGROUND.ty,
      kind: 'ore',
      ...(cause !== undefined && { cause }),
    }) as DomainEvent

  it("the assay lens's drill breaking into ore pings a slotted echo sounder", () => {
    const session = standingState({ 'powerup.1': ECHO_SOUNDER }, PASSIVE_MARK_3_PLANET)
    session.submit(2, poseIn(UNDERGROUND, FACING.right))
    const state = session.state()
    const fired = LENS_LINK_REACTION.react(state, state, [oreBroken()])
    expect(fired.events).toMatchObject([
      { type: 'power-up-core.LinkFired', itemId: ASSAY_LENS, siblingId: ECHO_SOUNDER },
    ])
    expect(LENS_LINK_REACTION.react(state, state, [oreBroken('blast')]).events).toEqual([])
  })

  it("the hazard barometer's fresh warning lobs a slotted flare, and a standing one does not", () => {
    const planetEight = continueScriptedSession(
      createAuthorityState({ planetIndex: 8, planetSeed: WORLD_SEED, playerIds: ['p1'] }),
    )
    const session = standingState({ 'powerup.1': FLARE_MORTAR }, PASSIVE_MARK_3_PLANET, planetEight)
    const lava = firstLavaDownColumnZero(session.state())
    const stand = { tx: lava.tx - 2, ty: lava.ty }
    session.submit(2, poseIn(stand, FACING.left))
    const facingAway = session.state()
    session.submit(3, poseIn(stand, FACING.right))
    const facingLava = session.state()
    const heard = [{ type: 'EnergyLow', threshold: 1, playerId: 'p1', tick: 3 } as DomainEvent]
    expect(BAROMETER_LINK_REACTION.react(facingAway, facingLava, heard).events).toMatchObject([
      { type: 'power-up-core.LinkFired', itemId: HAZARD_BAROMETER, siblingId: FLARE_MORTAR },
    ])
    expect(BAROMETER_LINK_REACTION.react(facingLava, facingLava, heard).events).toEqual([])
  })
})

describe('sensing Mark milestones (#256): the card line', () => {
  it('the card shows the next milestone verb in one line', () => {
    const state = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
    const lineAt = (itemId: string, level: number) =>
      describeItem(
        { kind: 'vehicle-item', id: itemId },
        { playerId: 'p1', planetIndex: 1, level, view: itemSnapshotViewOf(state, 'p1') },
      )?.statLines.find((line) => line.label === 'Next milestone')?.now
    expect(lineAt(ECHO_SOUNDER, 1)).toBe('Mk III, tap twice: pings one radius ahead of you')
    expect(lineAt(THREAT_PERISCOPE, 1)).toBe(
      'Mk III, link: a lunge warning pings the echo sounder at half radius',
    )
    expect(lineAt(THREAT_PERISCOPE, 3)).toBe('All reached')
  })
})

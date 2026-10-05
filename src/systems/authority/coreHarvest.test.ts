import { describe, expect, it } from 'vitest'
import { coreFragmentsNeeded } from '../economy/planetEconomy'
import { FACING, dockedPoseAt } from '../vehicle/vehiclePose'
import { coreTileCount } from '../world/planetGeometry'
import { planetParamsFor } from '../world/planetParams'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { cellAt } from '../world/worldState'
import type { DomainEvent } from './domainEvent'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import {
  coreTiles,
  createScriptedSession,
  drill,
  mineTile,
  PARAMS,
  poseAbove,
  SITE,
  surfaceOreTiles,
  typesOf,
  type ScriptedSession,
} from './scriptedSession'

const setUpgrade = (upgradeId: string, level: number) =>
  ({ type: 'debug.setUpgrade', payload: { upgradeId, level } }) as const

const dock = { type: 'dock', payload: {} } as const
const undock = { type: 'undock', payload: {} } as const

const poseAtDock = {
  type: 'reportPose',
  payload: {
    ...dockedPoseAt(SITE),
    driving: false,
    thrusting: false,
    drilling: false,
    thrustTicks: 0,
    driveTicks: 0,
    drillTicks: 0,
  },
} as const

const CORE = { tx: 0, ty: 3 }

/** Tip 7 scratches the planet-1 core (#24 acceptance 3); power 60 breaks a tile in 40 ticks. */
function equipForCore(session: ScriptedSession, cargoHold = 20): void {
  session.submit(0, setUpgrade('drill_tip', 7))
  session.submit(0, setUpgrade('drill_power', 60))
  session.submit(0, setUpgrade('cargo_hold', cargoHold))
}

function mineCore(
  session: ScriptedSession,
  startTick: number,
  tiles: ReturnType<typeof coreTiles>,
) {
  tiles.forEach((tile, index) => mineTile(session, startTick + 50 * index, tile))
  return startTick + 50 * tiles.length
}

function bringHomeAndDock(session: ScriptedSession, tick: number): DomainEvent[] {
  session.submit(tick, poseAtDock)
  return session.submit(tick, dock)
}

/** The fixed steps it takes the drill to break one core tile with the given levels. */
function ticksToBreakCore(tipLevel: number, powerLevel: number): number {
  const session = createScriptedSession()
  session.submit(0, setUpgrade('drill_tip', tipLevel))
  session.submit(0, setUpgrade('drill_power', powerLevel))
  session.submit(10, poseAbove(CORE, FACING.down))
  const events = session.submit(3010, drill(CORE, 3000))
  if (!typesOf(events).includes('TileDestroyed')) return Number.POSITIVE_INFINITY
  const damage = events.find((event) => event.type === 'DrillDamageDealt')
  return damage?.type === 'DrillDamageDealt' ? damage.ticks : Number.NaN
}

const ofType = <T extends DomainEvent['type']>(events: readonly DomainEvent[], type: T) =>
  events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type)

describe('core harvest', () => {
  it('logs core_reached once, on the first core tile, and counts the tiles that remain', () => {
    const session = createScriptedSession()
    equipForCore(session)
    mineCore(session, 10, coreTiles(3))
    expect(ofType(session.events(), 'CoreReached')).toHaveLength(1)
    expect(ofType(session.events(), 'CoreTileHarvested')).toEqual([
      expect.objectContaining({ tilesRemaining: 155, fragments: 1 }),
      expect.objectContaining({ tilesRemaining: 154, fragments: 1 }),
      expect.objectContaining({ tilesRemaining: 153, fragments: 1 }),
    ])
    expect(session.vehicle().cargo).toEqual({ ore: {}, coreFragments: 3 })
  })

  it('never gives core fragments a sale value or a resource_collected line', () => {
    const session = createScriptedSession()
    equipForCore(session)
    mineCore(session, 10, coreTiles(2))
    expect(typesOf(session.events())).not.toContain('CargoAdded')
  })

  it('destroys a core tile with a full hold, adds no fragment and still counts the tile', () => {
    const session = createScriptedSession()
    equipForCore(session, 0)
    surfaceOreTiles(10).forEach((tile, index) => mineTile(session, 10 + 50 * index, tile))
    const events = mineTile(session, 1000, coreTiles(1)[0])
    expect(typesOf(events)).toEqual([
      'DrillDamageDealt',
      'TileDestroyed',
      'CoreReached',
      'CoreTileHarvested',
      'StorageFull',
    ])
    expect(events[3]).toMatchObject({ tilesRemaining: 155, fragments: 0 })
    expect(events[4]).toMatchObject({ lostUnits: 1 })
    expect(session.vehicle().cargo.coreFragments).toBe(0)
  })

  it('cannot scratch the planet-1 core with drill_tip at level 3', () => {
    expect(ticksToBreakCore(3, 13)).toBe(Number.POSITIVE_INFINITY)
  })

  it('scratches it at tip level 4, where r is exactly 1/4, in 1453 ticks with power 13', () => {
    expect(ticksToBreakCore(4, 13)).toBe(1453)
  })

  it('breaks a core tile in 373 ticks at the planet-1 on-curve tip 7 and power 13', () => {
    expect(ticksToBreakCore(7, 13)).toBe(373)
  })

  it('keeps harvested core tiles removed through a snapshot and restore', () => {
    const session = createScriptedSession()
    equipForCore(session)
    const tiles = coreTiles(3)
    mineCore(session, 10, tiles)
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    if (!('state' in restored)) throw new Error(restored.problems.join('; '))
    const kinds = tiles.map((tile) => kindOfCell(cellAt(restored.state.world, PARAMS, tile)))
    expect(kinds).toEqual([CELL_KIND.air, CELL_KIND.air, CELL_KIND.air])
    expect(restored.state.core.harvestedTiles).toBe(3)
  })
})

describe('core completed', () => {
  it('fires once, when the bay first holds 63, and keeps the surplus banked', () => {
    const session = createScriptedSession()
    equipForCore(session, 60)
    const tiles = coreTiles(70)
    const firstTrip = mineCore(session, 10, tiles.slice(0, 62))
    expect(typesOf(bringHomeAndDock(session, firstTrip))).not.toContain('CoreCompleted')
    session.submit(firstTrip + 1, undock)
    const secondTrip = mineCore(session, firstTrip + 10, tiles.slice(62, 70))
    const atSeventy = bringHomeAndDock(session, secondTrip)
    expect(ofType(atSeventy, 'CoreCompleted')).toEqual([
      expect.objectContaining({ durationTicks: secondTrip - 50 }),
    ])
    expect(ofType(session.events(), 'CoreCompleted')).toHaveLength(1)
    expect(session.state().platform.coreBay).toBe(70)
  })

  it('reaches coreNeeded by banking over several docks with a level-0 hold', () => {
    const session = createScriptedSession()
    equipForCore(session, 0)
    const tiles = coreTiles(63)
    let tick = 10
    for (let first = 0; first < tiles.length; first += 10) {
      if (session.vehicle().mode === 'docked') session.submit(tick++, undock)
      tick = mineCore(session, tick, tiles.slice(first, first + 10))
      bringHomeAndDock(session, tick++)
    }
    expect(ofType(session.events(), 'CoreBayDeposited')).toHaveLength(Math.ceil(63 / 10))
    expect(ofType(session.events(), 'CoreCompleted')).toHaveLength(1)
    expect(session.state().platform.coreBay).toBe(63)
  })
})

describe('core is finite', () => {
  it('never needs more fragments than the core has tiles, on planets 1 to 40', () => {
    const planets = Array.from({ length: 40 }, (_, index) => planetParamsFor(1, index + 1))
    const shortfalls = planets.filter(
      (params) => coreFragmentsNeeded(coreTileCount(params)) > coreTileCount(params),
    )
    expect(shortfalls).toEqual([])
  })
})

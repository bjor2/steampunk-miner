import { describe, expect, it } from 'vitest'
import { blockHardness } from '../economy/oreEconomy'
import { drillPower, drillTip } from '../economy/vehicleStats'
import { add, div, fromCanonical, fromSafeInteger, mul, toCanonical, ZERO_MONEY } from '../money'
import { drillDamage } from '../vehicle/drillRule'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import { dockSiteOf } from '../world/dockSite'
import { planetParamsFor } from '../world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../world/worldState'
import { advanceTicks } from './advanceTicks'
import { applyCommand, type CommandOutcome } from './applyCommand'
import type { CommandIntent } from './authorityCommand'
import { createAuthorityState, vehicleOf, type AuthorityState } from './authorityState'
import type { DomainEvent } from './domainEvent'

const WORLD_SEED = 83921
const PARAMS = planetParamsFor(WORLD_SEED, 1)
const SITE = dockSiteOf(PARAMS)
const FULL_TANK = 150 * 240

/** A session that applies intents at chosen ticks and keeps every event, as a replay does. */
function createSession() {
  let outcome: CommandOutcome = {
    state: createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] }),
    events: [],
  }
  let seq = 0
  const keep = (step: CommandOutcome) => {
    outcome = { state: step.state, events: [...outcome.events, ...step.events] }
    return step.events
  }
  return {
    submit: (tick: number, intent: CommandIntent) =>
      keep(applyCommand(outcome.state, { playerId: 'p1', tick, seq: ++seq, ...intent })),
    advanceTo: (tick: number) => keep(advanceTicks(outcome.state, tick)),
    state: (): AuthorityState => outcome.state,
    vehicle: () => vehicleOf(outcome.state, 'p1'),
    events: (): DomainEvent[] => outcome.events,
  }
}

type Session = ReturnType<typeof createSession>

const typesOf = (events: readonly DomainEvent[]) => events.map((event) => event.type)

/** A band-1 ground tile on the surface, away from the pad and the starter vein. */
const GROUND: TilePoint = { tx: 20, ty: surfaceRowOfColumn(20, PARAMS.radiusTiles) }

/** The centre of a tile in mm, upright at the planet's top (the slice's surface), as a pose. */
function poseAbove(tile: TilePoint, facing: Facing, counts: Partial<ActionTicks> = {}) {
  return {
    type: 'reportPose' as const,
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
      drilling: (counts.drillTicks ?? 0) > 0,
      thrustTicks: 0,
      driveTicks: 0,
      drillTicks: 0,
      ...counts,
    },
  }
}

interface ActionTicks {
  thrustTicks: number
  driveTicks: number
  drillTicks: number
}

const drill = (tile: TilePoint, ticks: number) =>
  ({ type: 'drillTile', payload: { ...tile, ticks } }) as const

/** Ore tiles near the surface, found in the generated planet (band 1 is 10% ore, #6). */
function surfaceOreTiles(count: number): TilePoint[] {
  const tiles: TilePoint[] = []
  for (let tx = 12; tiles.length < count; tx++) {
    for (let depth = 0; depth < 6 && tiles.length < count; depth++) {
      const tile = { tx, ty: surfaceRowOfColumn(tx, PARAMS.radiusTiles) - depth }
      if (kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile)) === CELL_KIND.ore) tiles.push(tile)
    }
  }
  return tiles
}

/** Places the vehicle on a tile and drills it until it breaks, one command per tile. */
function mineTile(session: Session, tick: number, tile: TilePoint): DomainEvent[] {
  session.submit(tick, poseAbove(tile, FACING.down))
  return session.submit(tick + 40, drill(tile, 40))
}

describe('vehicle drilling', () => {
  it('breaks a band-1 tile in exactly 40 ticks at level 0', () => {
    const session = createSession()
    session.submit(10, poseAbove(GROUND, FACING.down))
    expect(typesOf(session.submit(49, drill(GROUND, 39)))).toEqual(['DrillDamageDealt'])
    expect(typesOf(session.submit(50, drill(GROUND, 1)))).toEqual([
      'DrillDamageDealt',
      'TileDestroyed',
    ])
    expect(kindOfCell(cellAt(session.state().world, PARAMS, GROUND))).toBe(CELL_KIND.air)
  })

  it('breaks the same tile in exactly 24 ticks with drill_power at level 20', () => {
    const session = createSession()
    session.submit(0, {
      type: 'debug.setUpgrade',
      payload: { upgradeId: 'drill_power', level: 20 },
    })
    session.submit(10, poseAbove(GROUND, FACING.down))
    expect(typesOf(session.submit(33, drill(GROUND, 23)))).toEqual(['DrillDamageDealt'])
    expect(typesOf(session.submit(34, drill(GROUND, 1)))).toContain('TileDestroyed')
  })

  it('charges only the ticks a tile needs, so extra drill ticks cost nothing', () => {
    const session = createSession()
    session.submit(10, poseAbove(GROUND, FACING.down))
    session.submit(60, drill(GROUND, 50))
    expect(FULL_TANK - session.vehicle().energy).toBe(40 * 4)
  })

  it('gives the same damage and energy through drillTile and a reported pose', () => {
    const scripted = createSession()
    scripted.submit(10, poseAbove(GROUND, FACING.down))
    const byCommand = scripted.submit(30, drill(GROUND, 20))
    const reported = createSession()
    reported.submit(10, poseAbove(GROUND, FACING.down))
    const byPose = reported.submit(30, poseAbove(GROUND, FACING.down, { drillTicks: 20 }))
    expect(byPose).toEqual(byCommand.map((event) => ({ ...event, seq: 2 })))
    expect(reported.vehicle().energy).toBe(scripted.vehicle().energy)
    expect(reported.state().world).toEqual(scripted.state().world)
  })

  it('sums drill_damage_dealt to the ticks times drillPower * eff / 60', () => {
    const session = createSession()
    session.submit(10, poseAbove(GROUND, FACING.down))
    const events = [10, 15, 15].flatMap((ticks, index) =>
      session.submit(30 + 20 * index, drill(GROUND, ticks)),
    )
    const damage = events.flatMap((event) =>
      event.type === 'DrillDamageDealt' ? [event.damage] : [],
    )
    const level0 = { drillPower: drillPower(0), drillTip: drillTip(0) }
    expect(damage).toEqual(
      [10, 15, 15].map((ticks) => toCanonical(drillDamage(level0, blockHardness(1, 1), ticks))),
    )
    const total = damage.reduce((sum, text) => add(sum, fromCanonical(text)), ZERO_MONEY)
    expect(total).toEqual(div(mul(fromSafeInteger(40), drillPower(0)), fromSafeInteger(60)))
  })

  it('deals no damage and drains no energy on a core tile, harder than four times the tip', () => {
    const session = createSession()
    const deep = { tx: 0, ty: 3 }
    session.submit(10, poseAbove(deep, FACING.down))
    expect(session.submit(30, drill(deep, 20))).toEqual([])
    expect(session.vehicle().energy).toBe(FULL_TANK)
  })

  it('refuses to drill the dock pad, air, or a tile out of reach', () => {
    const session = createSession()
    const pad = { tx: 0, ty: SITE.padRow }
    session.submit(10, poseAbove(pad, FACING.down))
    const reasons = [
      session.submit(20, drill(pad, 1)),
      session.submit(21, drill({ tx: 0, ty: SITE.padRow + 1 }, 1)),
      session.submit(22, drill({ tx: 3, ty: SITE.padRow }, 1)),
    ].map((events) => (events[0].type === 'CommandRejected' ? events[0].reason : events[0].type))
    expect(reasons).toEqual(['not_drillable', 'not_drillable', 'out_of_reach'])
  })

  it('refuses more drill ticks than time has passed, plus one report interval', () => {
    const session = createSession()
    session.submit(10, poseAbove(GROUND, FACING.down))
    const [refused] = session.submit(20, drill(GROUND, 23))
    expect(refused).toMatchObject({ type: 'CommandRejected', reason: 'too_many_ticks' })
  })
})

describe('vehicle cargo', () => {
  it('adds one unit per ore tile at any tier and nothing for ground', () => {
    const session = createSession()
    const [ore] = surfaceOreTiles(1)
    mineTile(session, 10, GROUND)
    const events = mineTile(session, 100, ore)
    expect(events.find((event) => event.type === 'CargoAdded')).toMatchObject({
      resourceTier: 1,
      amount: 1,
    })
    expect(session.vehicle().cargo).toEqual({ ore: { 1: 1 }, coreFragments: 0 })
  })

  it('destroys an ore tile with a full hold, keeps the cargo and logs one lost unit', () => {
    const session = createSession()
    const tiles = surfaceOreTiles(11)
    tiles.slice(0, 10).forEach((tile, index) => mineTile(session, 100 * (index + 1), tile))
    const events = mineTile(session, 2000, tiles[10])
    expect(typesOf(events)).toEqual(['DrillDamageDealt', 'TileDestroyed', 'StorageFull'])
    expect(events[2]).toMatchObject({ lostUnits: 1 })
    expect(session.vehicle().cargo.ore).toEqual({ 1: 10 })
  })
})

describe('vehicle energy', () => {
  it('charges 4, 6 and 1 quanta per reported drill, thrust and drive tick', () => {
    const session = createSession()
    session.submit(10, poseAbove(GROUND, FACING.down))
    session.submit(
      70,
      poseAbove(GROUND, FACING.down, { drillTicks: 30, thrustTicks: 60, driveTicks: 10 }),
    )
    expect(FULL_TANK - session.vehicle().energy).toBe(30 * 4 + 60 * 6 + 10)
  })

  it('is exactly one unit lower after 60 drilling ticks', () => {
    const session = createSession()
    const [ore] = surfaceOreTiles(1)
    mineTile(session, 10, GROUND)
    session.submit(100, poseAbove(ore, FACING.down))
    session.submit(120, drill(ore, 20))
    expect(FULL_TANK - session.vehicle().energy).toBe(240)
  })

  it('has no rounding drift after 10^6 ticks of mixed thrust and drive', () => {
    const session = createSession()
    session.submit(0, {
      type: 'debug.setUpgrade',
      payload: { upgradeId: 'boiler', level: 1_000_000 },
    })
    session.submit(0, { type: 'debug.setEnergy', payload: { energy: '6000150' } })
    const startEnergy = session.vehicle().energy
    for (let tick = 12; tick <= 1_000_000; tick += 12) {
      const counts = { thrustTicks: tick % 5, driveTicks: 12 - (tick % 5), drillTicks: 0 }
      session.submit(tick, poseAbove(GROUND, FACING.right, counts))
    }
    const reports = Math.floor(1_000_000 / 12)
    let spent = 0
    for (let index = 1; index <= reports; index++) {
      const thrust = (index * 12) % 5
      spent += thrust * 6 + (12 - thrust)
    }
    expect(startEnergy - session.vehicle().energy).toBe(spent)
  })

  it('logs energy_low once at 25% and once at 10% of the tank', () => {
    const session = createSession()
    session.submit(0, { type: 'debug.setEnergy', payload: { energy: '38' } })
    const at25 = session.submit(120, poseAbove(GROUND, FACING.right, { driveTicks: 120 }))
    const again = session.submit(132, poseAbove(GROUND, FACING.right, { driveTicks: 12 }))
    const at10 = session.submit(140, { type: 'debug.setEnergy', payload: { energy: '15' } })
    expect(at25.filter((event) => event.type === 'EnergyLow')).toMatchObject([{ threshold: 25 }])
    expect(typesOf(again)).toEqual([])
    expect(at10.filter((event) => event.type === 'EnergyLow')).toMatchObject([{ threshold: 10 }])
  })
})

describe('vehicle state machine', () => {
  function strandOutsideThePad(session: Session): DomainEvent[] {
    session.submit(0, { type: 'debug.setEnergy', payload: { energy: '0.05' } })
    return session.submit(12, poseAbove(GROUND, FACING.right, { driveTicks: 12 }))
  }

  it('strands an active vehicle at energy 0 outside the pad zone', () => {
    const session = createSession()
    const events = strandOutsideThePad(session)
    expect(typesOf(events)).toEqual(['EnergyDepleted', 'VehicleModeChanged'])
    expect(events[1]).toMatchObject({ from: 'active', to: 'stranded', reason: 'energy_depleted' })
    expect(session.vehicle().mode).toBe('stranded')
  })

  it('ignores thrust, drive and drill while stranded', () => {
    const session = createSession()
    strandOutsideThePad(session)
    session.submit(24, poseAbove(GROUND, FACING.down, { drillTicks: 12, thrustTicks: 12 }))
    const [refused] = session.submit(30, drill(GROUND, 6))
    expect(refused).toMatchObject({ type: 'CommandRejected', reason: 'vehicle_not_active' })
    expect(session.state().world).toEqual(EMPTY_WORLD)
  })

  it('tows a stranded vehicle after the 180-tick grace', () => {
    const session = createSession()
    strandOutsideThePad(session)
    expect(session.advanceTo(191)).toEqual([])
    const towed = session.advanceTo(192)
    expect(towed[0]).toMatchObject({ type: 'RescueTriggered', tick: 192, cause: 'stranded' })
    expect(session.vehicle().mode).toBe('docked')
  })

  it('tows a stranded vehicle at once on requestRescue', () => {
    const session = createSession()
    strandOutsideThePad(session)
    const events = session.submit(50, { type: 'requestRescue', payload: {} })
    expect(events[0]).toMatchObject({ type: 'RescueTriggered', cause: 'stranded' })
  })

  it('never strands or tows at energy 0 inside the pad zone', () => {
    const session = createSession()
    session.submit(0, { type: 'debug.setEnergy', payload: { energy: '0' } })
    session.advanceTo(1000)
    expect(session.vehicle().mode).toBe('active')
    expect(typesOf(session.events())).not.toContain('RescueTriggered')
  })

  it('destroys the vehicle when the hull reaches 0 and tows it after 120 ticks', () => {
    const session = createSession()
    const destroyed = session.submit(5, { type: 'debug.setHull', payload: { hull: '0' } })
    expect(typesOf(destroyed)).toEqual([
      'VehicleDestroyed',
      'VehicleModeChanged',
      'DebugCommandApplied',
    ])
    expect(destroyed[1]).toMatchObject({ from: 'active', to: 'destroyed' })
    expect(session.advanceTo(124)).toEqual([])
    expect(session.advanceTo(125)[0]).toMatchObject({ type: 'RescueTriggered', cause: 'destroyed' })
  })

  it('leaves the towed vehicle docked with a full hull, no ore and at least 25% energy', () => {
    const session = createSession()
    strandOutsideThePad(session)
    session.submit(13, { type: 'debug.setHull', payload: { hull: '1' } })
    session.submit(50, { type: 'requestRescue', payload: {} })
    expect(session.vehicle()).toMatchObject({ mode: 'docked', energy: 9000, cargo: { ore: {} } })
    expect(toCanonical(session.vehicle().hull)).toBe('1e+2')
  })
})

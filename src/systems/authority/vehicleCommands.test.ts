import { describe, expect, it } from 'vitest'
import { blockHardness } from '../economy/oreEconomy'
import { drillPower, drillTip } from '../economy/vehicleStats'
import { add, div, fromCanonical, fromSafeInteger, mul, toCanonical, ZERO_MONEY } from '../money'
import { drillDamage } from '../vehicle/drillRule'
import { FACING } from '../vehicle/vehiclePose'
import { cargoUnitsOf } from '../vehicle/vehicleState'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { cellDensitySum } from '../world/cellYield'
import { cellAt, EMPTY_WORLD } from '../world/worldState'
import type { CommandIntent } from './authorityCommand'
import type { DomainEvent } from './domainEvent'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  drill,
  GROUND,
  mineTile,
  PARAMS,
  poseAbove,
  SITE,
  surfaceOreTiles,
  typesOf,
  type ScriptedSession,
} from './scriptedSession'

const FULL_TANK = 150 * 240

const createSession = () => createScriptedSession()

type Session = ScriptedSession

describe('vehicle drilling', () => {
  it('clears a band-1 cell in exactly 40 ticks at level 0, yielding it once half is drilled', () => {
    const session = createSession()
    session.submit(0, poseAbove(GROUND, FACING.down))
    expect(typesOf(session.submit(20, drill(GROUND, 20)))).toEqual([
      'DrillDamageDealt',
      'GroundChanged',
    ])
    expect(typesOf(session.submit(21, drill(GROUND, 1)))).toEqual([
      'DrillDamageDealt',
      'GroundChanged',
      'TileDestroyed',
    ])
    expect(kindOfCell(cellAt(session.state().world, PARAMS, GROUND))).toBe(CELL_KIND.air)
    session.submit(39, drill(GROUND, 18))
    expect(cellDensitySum(session.state().world, PARAMS, GROUND)).toBeGreaterThan(0)
    session.submit(40, drill(GROUND, 1))
    expect(cellDensitySum(session.state().world, PARAMS, GROUND)).toBe(0)
    expect(FULL_TANK - session.vehicle().energy).toBe(40 * 4)
  })

  it('clears the same cell in exactly 24 ticks with drill_power at level 20', () => {
    const session = createSession()
    session.submit(0, {
      type: 'debug.setUpgrade',
      payload: { upgradeId: 'drill_power', level: 200 },
    })
    session.submit(0, poseAbove(GROUND, FACING.down))
    expect(typesOf(session.submit(12, drill(GROUND, 12)))).not.toContain('TileDestroyed')
    expect(typesOf(session.submit(13, drill(GROUND, 1)))).toContain('TileDestroyed')
    session.submit(23, drill(GROUND, 10))
    expect(cellDensitySum(session.state().world, PARAMS, GROUND)).toBeGreaterThan(0)
    session.submit(24, drill(GROUND, 1))
    expect(cellDensitySum(session.state().world, PARAMS, GROUND)).toBe(0)
  })

  it('charges only the ticks a tile needs, so extra drill ticks cost nothing', () => {
    const session = createSession()
    session.submit(10, poseAbove(GROUND, FACING.down))
    session.submit(60, drill(GROUND, 50))
    expect(FULL_TANK - session.vehicle().energy).toBe(40 * 4)
  })

  it('carves the 1.9 m drill stamp under a reported pose, charging only the ticks it cut', () => {
    const session = createSession()
    session.submit(10, poseAbove(GROUND, FACING.down))
    const events = session.submit(30, poseAbove(GROUND, FACING.down, { drillTicks: 20 }))
    expect(typesOf(events)).toContain('GroundChanged')
    expect(FULL_TANK - session.vehicle().energy).toBe(20 * 4)
    for (const tx of [GROUND.tx - 1, GROUND.tx, GROUND.tx + 1]) {
      const tile = { tx, ty: GROUND.ty }
      expect(cellDensitySum(session.state().world, PARAMS, tile)).toBeLessThan(16 * 255)
    }
  })

  it('charges nothing for a reported drill into open ground', () => {
    const session = createSession()
    const inClearance = { tx: 0, ty: SITE.padRow + 4 }
    session.submit(10, poseAbove(inClearance, FACING.left))
    expect(session.submit(30, poseAbove(inClearance, FACING.left, { drillTicks: 20 }))).toEqual([])
    expect(session.vehicle().energy).toBe(FULL_TANK)
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
    const level0 = { drillPower: drillPower(0), drillTip: drillTip(0), gateTip: drillTip(0) }
    expect(damage).toEqual(
      [10, 15, 15].map((ticks) => toCanonical(drillDamage(level0, blockHardness(1, 1), ticks))),
    )
    const total = damage.reduce((sum, text) => add(sum, fromCanonical(text)), ZERO_MONEY)
    expect(total).toEqual(div(mul(fromSafeInteger(40), drillPower(0)), fromSafeInteger(60)))
  })

  it('deals no damage and drains no energy on a core tile, harder than four times the tip', () => {
    const session = createSession()
    session.submit(0, FREEZE_ENEMIES)
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

  it('refuses a pose report whose drive is anything but signs, or missing (ticket 279)', () => {
    const session = createSession()
    const { payload } = poseAbove(GROUND, FACING.down)
    const { drive: _drive, ...withoutDrive } = payload
    const malformed: unknown[] = [{ x: 0.6, y: 0 }, { x: 2, y: 0 }, { x: 1 }, null]
    for (const [index, drive] of malformed.entries()) {
      const pose = { type: 'reportPose', payload: { ...payload, drive } } as CommandIntent
      const [refused] = session.submit(10 + index, pose)
      expect(refused).toMatchObject({ type: 'CommandRejected', reason: 'invalid_payload' })
    }
    const old = { type: 'reportPose', payload: withoutDrive } as unknown as CommandIntent
    expect(session.submit(20, old)).toMatchObject([{ reason: 'invalid_payload' }])
    expect(session.submit(21, poseAbove(GROUND, FACING.down, { drive: { x: -1, y: 1 } }))).toEqual(
      [],
    )
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
    // Scripted mining lays casing as a player's drill does (#115), so the last tile's wall was
    // lined by the rings behind the earlier digs and the drill cuts that lining.
    expect(typesOf(events)).toEqual([
      'DrillDamageDealt',
      'GroundChanged',
      'CasingDrilled',
      'TileDestroyed',
      'StorageFull',
    ])
    expect(events[4]).toMatchObject({ lostUnits: 1 })
    expect(session.vehicle().cargo.ore).toEqual({ 1: 10 })
  })
})

describe('vehicle core fragments', () => {
  it('carries a core tile as one fragment, counted in the same cargo units as ore', () => {
    const session = createSession()
    session.submit(0, FREEZE_ENEMIES)
    session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_tip', level: 70 } })
    session.submit(0, {
      type: 'debug.setUpgrade',
      payload: { upgradeId: 'drill_power', level: 400 },
    })
    const core = { tx: 0, ty: 3 }
    session.submit(10, poseAbove(core, FACING.down))
    const events = session.submit(200, drill(core, 190))
    expect(typesOf(events)).toEqual([
      'DrillDamageDealt',
      'GroundChanged',
      'TileDestroyed',
      'CoreReached',
      'CoreTileHarvested',
    ])
    expect(events[4]).toMatchObject({ tilesRemaining: 155, fragments: 1 })
    expect(session.vehicle().cargo).toEqual({ ore: {}, coreFragments: 1 })
    expect(cargoUnitsOf(session.vehicle().cargo)).toBe(1)
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
      payload: { upgradeId: 'boiler', level: 10_000_000 },
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

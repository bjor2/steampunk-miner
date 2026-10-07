import { describe, expect, it } from 'vitest'
import { LAVA_FLOW_STEP_TICKS } from '../../../constants/balance'
import { heatArchetype, hazardContactDamage } from '../../economy/heatEconomy'
import { sub } from '../../money'
import { heatUnitsOfPoints } from '../../vehicle/vehicleHeat'
import { statsOfVehicle } from '../../vehicle/vehicleState'
import { cellDensitySum } from '../../world/cellYield'
import { isLavaAt } from '../../world/lavaFlow'
import { SAMPLES_PER_CELL, SOLID_DENSITY } from '../../world/sampleGrid'
import { halfTileDistanceSq, type TilePoint } from '../../world/tileGrid'
import { cellAt, EMPTY_WORLD } from '../../world/worldState'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import type { CommandIntent } from '../authorityCommand'
import type { DomainEvent } from '../domainEvent'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import { stateDigest } from '../stateDigest'
import {
  AGAINST_LAVA,
  BELOW_FLOOR,
  carveHole,
  HEAT_PARAMS as PARAMS,
  HOLE,
  AWAY,
  onHeatPlanet,
  reportAt,
} from './lavaFixtures'

const lineHole: CommandIntent = {
  type: 'debug.lineCasing',
  payload: { x: HOLE.x, y: HOLE.y, grade: 5 },
}

const typesOf = (events: readonly DomainEvent[]) => events.map((event) => event.type)

describe('lava on the authority clock (#113)', () => {
  it('flows into the hole a step after it opens beside the pocket', () => {
    const session = onHeatPlanet()
    session.submit(0, reportAt(AWAY))
    session.submit(1, carveHole)
    expect(session.state().lava.nextStepTick).toBe(1 + LAVA_FLOW_STEP_TICKS)
    session.advanceTo(LAVA_FLOW_STEP_TICKS)
    expect(isLavaAt(session.state().world, PARAMS, BELOW_FLOOR)).toBe(false)
    session.advanceTo(1 + LAVA_FLOW_STEP_TICKS)
    expect(isLavaAt(session.state().world, PARAMS, BELOW_FLOOR)).toBe(true)
  })

  it('stops at a hole lined with refractory and logs lava_blocked once', () => {
    const session = onHeatPlanet()
    session.submit(0, reportAt(AWAY))
    session.submit(1, { type: 'debug.setLiningType', payload: { liningType: 'refractory' } })
    session.submit(1, carveHole)
    session.submit(1, lineHole)
    session.advanceTo(10 * LAVA_FLOW_STEP_TICKS)
    expect(isLavaAt(session.state().world, PARAMS, BELOW_FLOOR)).toBe(false)
    expect(typesOf(session.events()).filter((type) => type === 'LavaBlocked')).toHaveLength(1)
    expect(session.state().lava.nextStepTick).toBeNull()
  })

  it('lets the lava through once a wrecker breaches the refractory ring that stopped it', () => {
    const session = onHeatPlanet()
    session.submit(0, reportAt(AWAY))
    session.submit(1, { type: 'debug.setLiningType', payload: { liningType: 'refractory' } })
    session.submit(1, carveHole)
    session.submit(1, lineHole)
    session.advanceTo(5 * LAVA_FLOW_STEP_TICKS)
    expect(isLavaAt(session.state().world, PARAMS, BELOW_FLOOR)).toBe(false)
    const tick = 5 * LAVA_FLOW_STEP_TICKS + 1
    session.submit(tick, { type: 'debug.gnawCasing', payload: { x: HOLE.x, y: HOLE.y } })
    session.advanceTo(tick + 5 * LAVA_FLOW_STEP_TICKS)
    expect(isLavaAt(session.state().world, PARAMS, BELOW_FLOOR)).toBe(true)
  })

  it('passes the same hole lined with standard lining', () => {
    const session = onHeatPlanet()
    session.submit(0, reportAt(AWAY))
    session.submit(1, carveHole)
    session.submit(1, lineHole)
    session.advanceTo(10 * LAVA_FLOW_STEP_TICKS)
    expect(isLavaAt(session.state().world, PARAMS, BELOW_FLOOR)).toBe(true)
    expect(typesOf(session.events())).not.toContain('LavaBlocked')
  })

  it('keeps loose lava and its next step through a snapshot', () => {
    const session = onHeatPlanet()
    session.submit(0, reportAt(AWAY))
    session.submit(1, carveHole)
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    expect('state' in restored && restored.state.lava).toEqual(session.state().lava)
    expect('state' in restored && stateDigest(restored.state)).toBe(stateDigest(session.state()))
  })
})

/** A cell's 4-neighbours. */
const besideOf = ({ tx, ty }: TilePoint): TilePoint[] => [
  { tx, ty: ty - 1 },
  { tx: tx - 1, ty },
  { tx: tx + 1, ty },
  { tx, ty: ty + 1 },
]

const kindAt = (tile: TilePoint) => kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile))

/** Generated cave air holding at most half of a solid cell: lava can flow into it. */
function isOpenCave(tile: TilePoint): boolean {
  const density = cellDensitySum(EMPTY_WORLD, PARAMS, tile)
  return kindAt(tile) === CELL_KIND.air && density * 2 <= SAMPLES_PER_CELL * SOLID_DENSITY
}

/** An open cave cell beside and below the lava cell: the pocket could flow into it. */
function caveBelow(lava: TilePoint): TilePoint | undefined {
  return besideOf(lava).find(
    (next) =>
      isOpenCave(next) &&
      halfTileDistanceSq(next.tx, next.ty) < halfTileDistanceSq(lava.tx, lava.ty),
  )
}

/** A tile with plain ground two cells round it, so a hole there opens nothing beside lava or cave. */
function isDeepInGround(tile: TilePoint): boolean {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (kindAt({ tx: tile.tx + dx, ty: tile.ty + dy }) !== CELL_KIND.ground) return false
    }
  }
  return true
}

/**
 * Generated lava lying against a cave since the planet was made (#133), and a tile within a
 * breach's wake reach of it, deep in plain ground, for a lined hole a wrecker can breach.
 */
function pocketAgainstCave(): { lava: TilePoint; cave: TilePoint; ring: TilePoint } {
  for (let ty = 600; ty > 100; ty--) {
    for (let tx = -60; tx <= 60; tx++) {
      const lava = { tx, ty }
      const cave = kindAt(lava) === CELL_KIND.lava ? caveBelow(lava) : undefined
      const ring = cave === undefined ? undefined : ringSiteNear(lava)
      if (cave !== undefined && ring !== undefined) return { lava, cave, ring }
    }
  }
  throw new Error('no lava pocket against a cave found')
}

function ringSiteNear(lava: TilePoint): TilePoint | undefined {
  const reach = [-3, -2, -1, 0, 1, 2, 3]
  return reach
    .flatMap((dy) => reach.map((dx) => ({ tx: lava.tx + dx, ty: lava.ty + dy })))
    .find(isDeepInGround)
}

describe('lava a breach wakes (#133)', () => {
  const { lava, cave, ring } = pocketAgainstCave()
  const RING = { x: ring.tx * 1000 + 500, y: ring.ty * 1000 + 500 }

  it('leaves a pocket lying against a cave where it lay when a wrecker breaches a standard ring beside it', () => {
    const session = onHeatPlanet()
    session.submit(0, reportAt({ x: RING.x, y: RING.y - 30000 }))
    session.submit(1, { type: 'debug.carveCircle', payload: { ...RING, radius: 950, amount: 255 } })
    session.submit(1, { type: 'debug.lineCasing', payload: { ...RING, grade: 5 } })
    const gnawed = session.submit(2, { type: 'debug.gnawCasing', payload: RING })
    session.advanceTo(10 * LAVA_FLOW_STEP_TICKS)
    expect(typesOf(gnawed)).toContain('RingGnawed')
    expect(isLavaAt(session.state().world, PARAMS, lava)).toBe(true)
    expect(isLavaAt(session.state().world, PARAMS, cave)).toBe(false)
  })
})

describe('lava contact (#113)', () => {
  it('adds 25 to the gauge and takes 5% of hullMax at a touch, logged as lava_contact', () => {
    const session = onHeatPlanet()
    session.submit(0, carveHole)
    const hull = session.vehicle().hull
    const events = session.submit(1, reportAt(AGAINST_LAVA))
    expect(typesOf(events)).toContain('LavaTouched')
    expect(session.vehicle().heat.level).toBe(heatUnitsOfPoints(25))
    const damage = hazardContactDamage(heatArchetype(), statsOfVehicle(session.vehicle()).hullMax)
    expect(session.vehicle().hull).toEqual(sub(hull, damage))
  })

  it('burns at most once per hit grace', () => {
    const session = onHeatPlanet()
    session.submit(0, carveHole)
    session.submit(1, reportAt(AGAINST_LAVA))
    session.submit(13, reportAt(AGAINST_LAVA))
    expect(session.vehicle().heat.level).toBeLessThanOrEqual(heatUnitsOfPoints(25))
    session.submit(25, reportAt(AGAINST_LAVA))
    expect(session.vehicle().heat.level).toBeGreaterThan(heatUnitsOfPoints(49))
  })

  it('leaves a vehicle a metre clear of the lava untouched', () => {
    const session = onHeatPlanet()
    session.submit(0, carveHole)
    const events = session.submit(1, reportAt({ x: AGAINST_LAVA.x, y: AGAINST_LAVA.y - 1000 }))
    expect(typesOf(events)).not.toContain('LavaTouched')
  })
})

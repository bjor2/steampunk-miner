import { describe, expect, it } from 'vitest'
import { LAVA_FLOW_STEP_TICKS } from '../../../constants/balance'
import { heatArchetype, hazardContactDamage } from '../../economy/heatEconomy'
import { sub } from '../../money'
import { heatUnitsOfPoints } from '../../vehicle/vehicleHeat'
import { FACING } from '../../vehicle/vehiclePose'
import { statsOfVehicle } from '../../vehicle/vehicleState'
import { isLavaAt } from '../../world/lavaFlow'
import { bandOfTile } from '../../world/planetGeometry'
import { planetParamsFor } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import { cellAt, EMPTY_WORLD } from '../../world/worldState'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import type { CommandIntent } from '../authorityCommand'
import type { DomainEvent } from '../domainEvent'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import { stateDigest } from '../stateDigest'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  WORLD_SEED,
  type ScriptedSession,
} from '../scriptedSession'

const PARAMS = planetParamsFor(WORLD_SEED, 8)

/** A band-3 lava cell above plain ground: the floor of a pocket. */
function pocketFloor(): TilePoint {
  for (let ty = 300; ty > 100; ty--) {
    for (let tx = -40; tx <= 40; tx++) {
      const isFloor =
        bandOfTile(PARAMS, tx, ty) === 3 &&
        isLavaAt(EMPTY_WORLD, PARAMS, { tx, ty }) &&
        kindOfCell(cellAt(EMPTY_WORLD, PARAMS, { tx, ty: ty - 1 })) === CELL_KIND.ground &&
        kindOfCell(cellAt(EMPTY_WORLD, PARAMS, { tx, ty: ty - 3 })) === CELL_KIND.ground
      if (isFloor) return { tx, ty }
    }
  }
  throw new Error('no lava pocket floor found')
}

const FLOOR = pocketFloor()
const BELOW_FLOOR = { tx: FLOOR.tx, ty: FLOOR.ty - 1 }
const HOLE = { x: FLOOR.tx * 1000 + 500, y: BELOW_FLOOR.ty * 1000 + 500 }
/** Clear of the hole, far enough down that lava reaching the hole never touches it. */
const AWAY = { x: HOLE.x, y: HOLE.y - 30000 }

function onHeatPlanet(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: 8 } })
  session.submit(0, FREEZE_ENEMIES)
  return session
}

function reportAt(at: { x: number; y: number }, drillTicks = 0): CommandIntent {
  return {
    type: 'reportPose',
    payload: {
      x: at.x,
      y: at.y,
      vx: 0,
      vy: 0,
      upx: 0,
      upy: 1024,
      facing: FACING.up,
      driving: false,
      thrusting: false,
      drilling: drillTicks > 0,
      thrustTicks: 0,
      driveTicks: 0,
      drillTicks,
    },
  }
}

const carveHole: CommandIntent = {
  type: 'debug.carveCircle',
  payload: { x: HOLE.x, y: HOLE.y, radius: 950, amount: 255 },
}

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

describe('lava contact (#113)', () => {
  /** The vehicle stands against the pocket's floor from below, its body 0.5 m under the lava. */
  const AGAINST = { x: HOLE.x, y: FLOOR.ty * 1000 - 500 }

  it('adds 25 to the gauge and takes 5% of hullMax at a touch, logged as lava_contact', () => {
    const session = onHeatPlanet()
    session.submit(0, carveHole)
    const hull = session.vehicle().hull
    const events = session.submit(1, reportAt(AGAINST))
    expect(typesOf(events)).toContain('LavaTouched')
    expect(session.vehicle().heat.level).toBe(heatUnitsOfPoints(25))
    const damage = hazardContactDamage(heatArchetype(), statsOfVehicle(session.vehicle()).hullMax)
    expect(session.vehicle().hull).toEqual(sub(hull, damage))
  })

  it('burns at most once per hit grace', () => {
    const session = onHeatPlanet()
    session.submit(0, carveHole)
    session.submit(1, reportAt(AGAINST))
    session.submit(13, reportAt(AGAINST))
    expect(session.vehicle().heat.level).toBeLessThanOrEqual(heatUnitsOfPoints(25))
    session.submit(25, reportAt(AGAINST))
    expect(session.vehicle().heat.level).toBeGreaterThan(heatUnitsOfPoints(49))
  })

  it('leaves a vehicle a metre clear of the lava untouched', () => {
    const session = onHeatPlanet()
    session.submit(0, carveHole)
    const events = session.submit(1, reportAt({ x: AGAINST.x, y: AGAINST.y - 1000 }))
    expect(typesOf(events)).not.toContain('LavaTouched')
  })
})

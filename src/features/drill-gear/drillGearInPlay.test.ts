import { describe, expect, it } from 'vitest'
import {
  coreTiles,
  GROUND,
  mineTile,
  PARAMS,
  poseAbove,
  surfaceOreTiles,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { reactionToPress } from '../../systems/input/inputRouting'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { energyMaxQuantaOf } from '../../systems/vehicle/vehicleState'
import { cellDensitySum } from '../../systems/world/cellYield'
import { SAMPLES_PER_TILE, SOLID_DENSITY } from '../../systems/world/sampleGrid'
import type { TilePoint } from '../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../systems/world/worldCell'
import { EMPTY_WORLD, materialCellAt } from '../../systems/world/worldState'
import { chargesLeftOf, isToggleEngaged } from '../power-up-core'
import { drivingIn, ofType, press, sessionWith } from './drillGearTestSession'
import { CUTTERS_AND_BOOM_SOURCE } from './systems/cuttersAndBoom'

// The drill gear in play on the loaded slices (#205): KeyF and KeyC press the flank and collar
// sockets (GD lock Q1 a), the toggles switch their effects on and off, the auger draws from the
// tank and plugs the bored tunnel behind, and the corer spends a charge on a plug but none on a
// core cell (#162 acceptance 3).

const CUTTERS = 'gear.side_cutters'
const AUGER = 'gear.spoil_auger'
const CORER = 'gear.sampling_corer'
const BOOM = 'gear.reach_boom'
const DRILL_TICKS = 60
/** Planet-1 ground whose next cell down is an ore cell. */
const ABOVE_ORE: TilePoint = { tx: 30, ty: 280 }
const FULL_TILE_DENSITY = SAMPLES_PER_TILE * SAMPLES_PER_TILE * SOLID_DENSITY

const isEngaged = (session: ScriptedSession, itemId: string) =>
  isToggleEngaged(session.state(), 'p1', itemId)

const energyOf = (session: ScriptedSession) => session.state().players.p1.vehicle.energy

/** A surface ore cell and the downward drill target with that ore right beside the bore. */
function oreBesideBore() {
  const [ore] = surfaceOreTiles(1)
  return { ore, target: { tx: ore.tx - 1, ty: ore.ty - 1 } }
}

/** Drills the target for one report and answers whether the ore beside it was cut. */
function isOreBesideCut(session: ScriptedSession, ore: TilePoint, target: TilePoint): boolean {
  const events = session.submit(10 + DRILL_TICKS, {
    ...poseAbove(target, FACING.down, { drillTicks: DRILL_TICKS }),
  })
  return ofType(events, 'TileDestroyed').some(
    (event) => event.type === 'TileDestroyed' && event.tx === ore.tx && event.ty === ore.ty,
  )
}

describe('drill-gear keys', () => {
  it('presses drill.flank with use_drill_flank and drill.collar with use_drill_collar', () => {
    const slots = { 'drill.flank': CUTTERS, 'drill.collar': CORER }
    const session = sessionWith(slots, GROUND, FACING.down)
    const situation = drivingIn(session.state())
    expect(reactionToPress('use_drill_flank', situation)).toEqual({
      kind: 'submit',
      intent: press('drill.flank'),
    })
    expect(reactionToPress('use_drill_collar', situation)).toEqual({
      kind: 'submit',
      intent: press('drill.collar'),
    })
  })

  it('does nothing for an empty socket, so nothing is buffered or logged', () => {
    const session = sessionWith({}, GROUND, FACING.down)
    expect(reactionToPress('use_drill_flank', drivingIn(session.state()))).toEqual({ kind: 'none' })
    expect(reactionToPress('use_drill_collar', drivingIn(session.state()))).toEqual({
      kind: 'none',
    })
  })
})

describe('drill-gear toggles', () => {
  it('switches the side cutters on and off with the flank socket', () => {
    const session = sessionWith({ 'drill.flank': CUTTERS }, GROUND, FACING.down)
    session.submit(2, press('drill.flank'))
    expect(isEngaged(session, CUTTERS)).toBe(true)
    session.submit(3, press('drill.flank'))
    expect(isEngaged(session, CUTTERS)).toBe(false)
  })

  it('widens the bore round the ore beside it only while the cutters are on', () => {
    const { ore, target } = oreBesideBore()
    const off = sessionWith({ 'drill.flank': CUTTERS }, target, FACING.down)
    expect(isOreBesideCut(off, ore, target)).toBe(false)
    const on = sessionWith({ 'drill.flank': CUTTERS }, target, FACING.down)
    on.submit(2, press('drill.flank'))
    expect(isOreBesideCut(on, ore, target)).toBe(true)
  })

  it('asks the drill for one cell ahead while the boom is on, and nothing once off', () => {
    const session = sessionWith({ 'drill.collar': BOOM }, GROUND, FACING.down)
    const ask = () => CUTTERS_AND_BOOM_SOURCE.gearOf(session.state(), 'p1')
    expect(ask()).toBeNull()
    session.submit(2, press('drill.collar'))
    expect(ask()).toEqual({ aheadCells: 1 })
    session.submit(3, press('drill.collar'))
    expect(ask()).toBeNull()
  })
})

describe('drill-gear spoil auger', () => {
  it('draws 0.3% of the tank a second while on, beside a session with it off', () => {
    const on = sessionWith({ 'drill.collar': AUGER }, GROUND, FACING.down)
    const off = sessionWith({ 'drill.collar': AUGER }, GROUND, FACING.down)
    on.submit(2, press('drill.collar'))
    on.advanceTo(302)
    off.advanceTo(302)
    const max = energyMaxQuantaOf(on.state().players.p1.vehicle)
    const perTick = Math.ceil((max * 3) / (1000 * TICKS_PER_SECOND))
    expect(energyOf(off) - energyOf(on)).toBe(300 * perTick)
  })

  it('plugs the bored shaft at least 2 m behind the hull with packed plain ground', () => {
    const shaft = Array.from({ length: 8 }, (_, depth) => ({
      tx: GROUND.tx,
      ty: GROUND.ty - depth,
    }))
    const session = sessionWith({ 'drill.collar': AUGER }, GROUND, FACING.down)
    shaft.forEach((tile, at) => mineTile(session, 10 + at * 50, tile))
    const bottom = shaft[shaft.length - 1]
    session.submit(500, poseAbove({ tx: bottom.tx, ty: bottom.ty - 1 }, FACING.down))
    session.submit(501, press('drill.collar'))
    const filled = ofType(session.advanceTo(520), 'drill-gear.TunnelBackfilled')
    expect(filled.length).toBeGreaterThan(0)
    for (const event of filled) {
      if (event.type !== 'drill-gear.TunnelBackfilled') continue
      const tile = { tx: event.tx, ty: event.ty }
      expect(shaft).toContainEqual(tile)
      expect(tile.ty).toBeGreaterThanOrEqual(bottom.ty + 2)
      const world = session.state().world
      expect(cellDensitySum(world, PARAMS, tile)).toBe(FULL_TILE_DENSITY)
      expect(kindOfCell(materialCellAt(world, PARAMS, tile))).toBe(CELL_KIND.ground)
    }
  })

  it('fills nothing while switched off', () => {
    const session = sessionWith({ 'drill.collar': AUGER }, GROUND, FACING.down)
    mineTile(session, 10, GROUND)
    session.submit(60, poseAbove({ tx: GROUND.tx, ty: GROUND.ty - 4 }, FACING.down))
    expect(ofType(session.advanceTo(90), 'drill-gear.TunnelBackfilled')).toEqual([])
  })
})

describe('drill-gear sampling corer', () => {
  it('winds up, then plugs the ore ahead and spends one of its four charges', () => {
    const session = sessionWith({ 'drill.collar': CORER }, ABOVE_ORE, FACING.down)
    session.submit(2, press('drill.collar'))
    const sampled = ofType(session.advanceTo(10), 'drill-gear.OreSampled')
    expect(sampled).toMatchObject([{ tick: 8, tx: ABOVE_ORE.tx, ty: ABOVE_ORE.ty - 1 }])
    expect(chargesLeftOf(session.state(), 'p1', CORER)).toBe(3)
  })

  // #162 acceptance 3 in play: the gate is the core itself, so no probe slice is needed.
  it('is blocked by a core cell: the cell stays, the gate is logged and no charge is spent', () => {
    const [core] = coreTiles(1)
    const session = sessionWith(
      { 'drill.collar': CORER },
      { tx: core.tx, ty: core.ty + 1 },
      FACING.down,
    )
    session.submit(2, press('drill.collar'))
    const events = session.advanceTo(10)
    expect(ofType(events, 'power-up-core.PowerUpBlocked')).toMatchObject([
      { itemId: CORER, gateKind: 'core', tx: core.tx, ty: core.ty },
    ])
    expect(ofType(events, 'drill-gear.OreSampled')).toEqual([])
    expect(chargesLeftOf(session.state(), 'p1', CORER)).toBe(4)
    const world = session.state().world
    expect(cellDensitySum(world, PARAMS, core)).toBe(cellDensitySum(EMPTY_WORLD, PARAMS, core))
  })
})

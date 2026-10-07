import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { DrillGearAsk } from '../economy/drillGearCaps'
import type { GateOutcome } from '../registries/gateChecks'
import { drillGearCellsAt } from '../vehicle/drillGearCells'
import { drillStampOf } from '../vehicle/drillStamp'
import { FACING, type Facing, type VehiclePose } from '../vehicle/vehiclePose'
import { cellDensitySum } from '../world/cellYield'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { cellAt, EMPTY_WORLD, type WorldState } from '../world/worldState'
import type { DomainEvent } from './domainEvent'
import { createScriptedSession, PARAMS, poseAbove, surfaceOreTiles } from './scriptedSession'
import { stateDigest } from './stateDigest'

// Slice drill gear on the reported drill (ticket 234, the GD lock on #205): fake slices register
// through withRegistrations, so no real slice is imported.

/** Band-1 ground six rows under the surface east of the dock. */
const TARGET: TilePoint = { tx: 30, ty: 285 }
const DRILL_TICKS = 60

function gearSlice(ask: DrillGearAsk | null): SliceDefinition {
  return {
    id: 'gear-probe',
    register: (r) => r.drillGear({ id: 'gear-probe.gear', gearOf: () => ask }),
  }
}

/** A gate on one ore tile only, the way #142's dynamite shell refuses the drill. */
function shellSlice(shell: TilePoint, outcome: GateOutcome): SliceDefinition {
  return {
    id: 'shell-probe',
    register: (r) =>
      r.gateCheck({
        id: 'shell-probe.one-tile',
        check: ({ tile }) =>
          tile.tx === shell.tx && tile.ty === shell.ty
            ? { outcome, gateKind: 'dynamite', required: '1', have: '0' }
            : null,
      }),
  }
}

/** The pose `poseAbove` reports, as the authority reads it. */
function poseOver(tile: TilePoint, facing: Facing): VehiclePose {
  const { x, y, vx, vy, upx, upy } = poseAbove(tile, facing).payload
  return { x, y, vx, vy, upx, upy, facing }
}

function gearCellsOver(tile: TilePoint, facing: Facing, ask: Required<DrillGearAsk>) {
  const pose = poseOver(tile, facing)
  return drillGearCellsAt(pose, drillStampOf(pose, false), ask)
}

/** One reported drill command of `DRILL_TICKS` over `tile`, with only `slices` registered. */
function drillWith(
  slices: readonly SliceDefinition[],
  tile: TilePoint = TARGET,
  facing: Facing = FACING.down,
) {
  return withRegistrations(slices, () => {
    const session = createScriptedSession()
    session.submit(1, poseAbove(tile, facing))
    const before = session.vehicle().energy
    const events = session.submit(
      1 + DRILL_TICKS,
      poseAbove(tile, facing, { drillTicks: DRILL_TICKS }),
    )
    return {
      events,
      world: session.state().world,
      spent: before - session.vehicle().energy,
      digest: stateDigest(session.state()),
    }
  })
}

const FULL_CELL = cellDensitySum(EMPTY_WORLD, PARAMS, TARGET)

function densityOf(world: WorldState, tile: TilePoint): number {
  return cellDensitySum(world, PARAMS, tile)
}

function cargoAddedOf(events: readonly DomainEvent[]) {
  return events.filter((event) => event.type === 'CargoAdded')
}

function drillGatedOf(events: readonly DomainEvent[]) {
  return events.filter((event) => event.type === 'DrillGated')
}

/** A surface ore cell and the drill target that puts it `step + 1` cells beside the bore. */
function oreBesideBore(step: number) {
  const [ore] = surfaceOreTiles(1)
  return { ore, target: { tx: ore.tx - 1 - step, ty: ore.ty - 1 } }
}

describe('drill gear cut', () => {
  it('drills exactly as before when the gear adds no cell', () => {
    const plain = drillWith([])
    expect(drillWith([gearSlice(null)])).toEqual(plain)
    expect(drillWith([gearSlice({ sideEnergyShareBp: 20000 })])).toEqual(plain)
    expect(drillWith([gearSlice({ aheadCells: 0, sideCells: 0 })])).toEqual(plain)
  })

  it('cuts a cell on each side of the bore in the same ticks as the bit', () => {
    const [oneSide, otherSide] = gearCellsOver(TARGET, FACING.down, {
      aheadCells: 0,
      sideCells: 1,
      sideEnergyShareBp: 0,
    }).side
    const plain = drillWith([])
    const widened = drillWith([gearSlice({ sideCells: 1 })])
    expect(densityOf(widened.world, oneSide)).toBeLessThan(densityOf(plain.world, oneSide))
    expect(densityOf(widened.world, otherSide)).toBeLessThan(densityOf(plain.world, otherSide))
    expect(widened.spent).toBeGreaterThan(plain.spent)
  })

  it('charges each side cell its share of the drill energy, never under a whole share', () => {
    const plain = drillWith([]).spent
    const whole = drillWith([gearSlice({ sideCells: 1, sideEnergyShareBp: 10000 })]).spent
    const half = drillWith([gearSlice({ sideCells: 1, sideEnergyShareBp: 5000 })]).spent
    const double = drillWith([gearSlice({ sideCells: 1, sideEnergyShareBp: 20000 })]).spent
    expect(half).toBe(whole)
    expect(double - plain).toBe(2 * (whole - plain))
  })

  it('cuts the cell past the bit, and only that one however many are asked', () => {
    const next = { tx: TARGET.tx, ty: TARGET.ty - 1 }
    const beyond = { tx: TARGET.tx, ty: TARGET.ty - 2 }
    const plain = drillWith([])
    const reach = drillWith([gearSlice({ aheadCells: 1 })])
    expect(densityOf(reach.world, next)).toBeLessThan(densityOf(plain.world, next))
    expect(densityOf(reach.world, beyond)).toBe(FULL_CELL)
    expect(drillWith([gearSlice({ aheadCells: 4 })])).toEqual(reach)
  })

  // The floor circle follows the planet's curve, so the floor cell's top edge may be trimmed to
  // the same ramp the disc leaves; the cell itself never comes out from under the wheels.
  it('keeps a widened level tunnel floor where the wheels run', () => {
    const [roof, floor] = gearCellsOver(TARGET, FACING.right, {
      aheadCells: 0,
      sideCells: 1,
      sideEnergyShareBp: 0,
    }).side
    const widened = drillWith([gearSlice({ sideCells: 1 })], TARGET, FACING.right)
    expect(roof.ty).toBeGreaterThan(floor.ty)
    expect(densityOf(widened.world, roof)).toBe(0)
    expect(densityOf(widened.world, floor)).toBeGreaterThan((FULL_CELL * 9) / 10)
    expect(kindOfCell(cellAt(widened.world, PARAMS, floor))).toBe(CELL_KIND.ground)
  })

  it('collects the ore of a side cell into the hold, as the bit would', () => {
    const { ore, target } = oreBesideBore(1)
    const cut = drillWith([gearSlice({ sideCells: 2 })], target)
    expect(cut.events).toContainEqual(expect.objectContaining({ type: 'TileDestroyed', ...ore }))
    expect(cargoAddedOf(cut.events).length).toBeGreaterThan(
      cargoAddedOf(drillWith([], target).events).length,
    )
  })

  it.each<GateOutcome>(['refused', 'lost'])(
    'leaves a gated ore cell beside the bore standing when its gate says %s',
    (outcome) => {
      const { ore, target } = oreBesideBore(1)
      const ask = { aheadCells: 0, sideCells: 2, sideEnergyShareBp: 0 }
      expect(gearCellsOver(target, FACING.down, ask).side).toContainEqual(ore)
      const cut = drillWith([gearSlice(ask), shellSlice(ore, outcome)], target)
      expect(densityOf(cut.world, ore)).toBe(densityOf(EMPTY_WORLD, ore))
      expect(kindOfCell(cellAt(cut.world, PARAMS, ore))).toBe(CELL_KIND.ore)
    },
  )

  it('reports a dynamite shell beside the bore as refused and widens round it', () => {
    const { ore, target } = oreBesideBore(1)
    const nearer = { tx: ore.tx - 1, ty: ore.ty }
    const cut = drillWith([gearSlice({ sideCells: 2 }), shellSlice(ore, 'refused')], target)
    expect(drillGatedOf(cut.events)).toEqual([
      expect.objectContaining({ ...ore, gateKind: 'dynamite', outcome: 'refused' }),
    ])
    expect(densityOf(cut.world, nearer)).toBeLessThan(densityOf(EMPTY_WORLD, nearer))
  })
})

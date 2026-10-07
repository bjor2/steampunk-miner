import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { AheadBearing, DrillGearAsk } from '../economy/drillGearCaps'
import { stepOfMajor } from '../economy/upgradeSteps'
import type { GateOutcome } from '../registries/gateChecks'
import { drillGearCellsAt, type DrillGearReach } from '../vehicle/drillGearCells'
import { drillStampOf } from '../vehicle/drillStamp'
import { NO_DRIVE, signOfPush, type DriveSign, type DriveSigns } from '../vehicle/driveSigns'
import { FACING, type Facing, type VehiclePose } from '../vehicle/vehiclePose'
import { cellDensitySum } from '../world/cellYield'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { cellAt, EMPTY_WORLD, type WorldState } from '../world/worldState'
import type { CommandIntent } from './authorityCommand'
import type { DomainEvent } from './domainEvent'
import {
  coreTiles,
  createScriptedSession,
  FREEZE_ENEMIES,
  PARAMS,
  poseAbove,
  surfaceOreTiles,
} from './scriptedSession'
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

/** A gate refusing every ore cell; gates never hold core or plain ground. */
const REFUSE_ALL_ORE: SliceDefinition = {
  id: 'refuse-probe',
  register: (r) =>
    r.gateCheck({
      id: 'refuse-probe.all-ore',
      check: () => ({ outcome: 'refused', gateKind: 'dynamite', required: '1', have: '0' }),
    }),
}

/** A track at major `level`, sent as its step (#180). */
const setUpgrade = (upgradeId: string, level: number) =>
  ({ type: 'debug.setUpgrade', payload: { upgradeId, level: stepOfMajor(level) } }) as const

/** Tip 7 and power 60 break a planet-1 core tile in 40 ticks (`coreHarvest.test.ts`). */
const CORE_DRILL: readonly CommandIntent[] = [
  FREEZE_ENEMIES,
  setUpgrade('drill_tip', 7),
  setUpgrade('drill_power', 60),
]

function gearCellsOver(tile: TilePoint, facing: Facing, ask: DrillGearReach) {
  const pose = poseOver(tile, facing)
  return drillGearCellsAt(pose, drillStampOf(pose, false), ask)
}

/** One reported drill command of `DRILL_TICKS` over `tile`, with only `slices` registered. */
function drillWith(
  slices: readonly SliceDefinition[],
  tile: TilePoint = TARGET,
  facing: Facing = FACING.down,
  setup: readonly CommandIntent[] = [],
  drive: DriveSigns = NO_DRIVE,
) {
  return withRegistrations(slices, () => {
    const session = createScriptedSession()
    for (const intent of setup) session.submit(0, intent)
    session.submit(1, poseAbove(tile, facing))
    const before = session.vehicle().energy
    const events = session.submit(
      1 + DRILL_TICKS,
      poseAbove(tile, facing, { drillTicks: DRILL_TICKS, drive }),
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

/** The twin bit (#257): one cell ahead, turned by the drive. */
const TWIN_BIT = gearSlice({ aheadCells: 1, aheadAim: 'drive' })

/** Drilling down while pushing to one side: 1 the vehicle's right, -1 its left. */
const pushingSide = (x: DriveSign): DriveSigns => ({ x, y: -1 })

/** The push that turns the ahead cell to `bearing` while drilling down. */
const PUSH_OF_BEARING = { left: pushingSide(1), right: pushingSide(-1) } as const

/** The cell one column to the side of the straight cell under the bit, `dx` 1 the screen right. */
function cellBesideStraight(dx: number): TilePoint {
  return { tx: TARGET.tx + dx, ty: TARGET.ty - 1 }
}

/** The drill target, facing down, whose diagonal cell on `bearing` is `cell`. */
function targetWithDiagonalOn(cell: TilePoint, bearing: AheadBearing): TilePoint {
  const ask = { aheadCells: 1, sideCells: 0, aheadBearing: bearing }
  const [diagonal] = gearCellsOver(TARGET, FACING.down, ask).ahead
  return { tx: cell.tx + TARGET.tx - diagonal.tx, ty: cell.ty + TARGET.ty - diagonal.ty }
}

function kindAt(tile: TilePoint): number {
  return kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile))
}

/** A cell the twin bit's diagonal reaches from a drill target of the `targetKind` the bit cuts. */
function cellUnderDiagonal(cells: readonly TilePoint[], bearing: AheadBearing, targetKind: number) {
  const cell = cells.find((tile) => kindAt(targetWithDiagonalOn(tile, bearing)) === targetKind)
  if (cell === undefined) throw new Error('no cell under a diagonal from the target kind')
  return { cell, target: targetWithDiagonalOn(cell, bearing) }
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
      const ask = { aheadCells: 0, sideCells: 2 }
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

  it('cuts the diagonal cell instead of the cell past the bit', () => {
    const next = { tx: TARGET.tx, ty: TARGET.ty - 1 }
    const [diagonal] = gearCellsOver(TARGET, FACING.down, {
      aheadCells: 1,
      sideCells: 0,
      aheadBearing: 'right',
    }).ahead
    const plain = drillWith([])
    const twin = drillWith([TWIN_BIT], TARGET, FACING.down, [], PUSH_OF_BEARING.right)
    expect(densityOf(twin.world, diagonal)).toBeLessThan(densityOf(plain.world, diagonal))
    expect(densityOf(twin.world, next)).toBe(densityOf(plain.world, next))
  })

  it('a gated diagonal cell is refused through canMine and reported in DrillGated', () => {
    const { cell: ore, target } = cellUnderDiagonal(surfaceOreTiles(40), 'left', CELL_KIND.ground)
    const push = PUSH_OF_BEARING.left
    expect(densityOf(drillWith([TWIN_BIT], target, FACING.down, [], push).world, ore)).toBeLessThan(
      densityOf(EMPTY_WORLD, ore),
    )
    const cut = drillWith([TWIN_BIT, shellSlice(ore, 'refused')], target, FACING.down, [], push)
    expect(densityOf(cut.world, ore)).toBe(densityOf(EMPTY_WORLD, ore))
    expect(kindOfCell(cellAt(cut.world, PARAMS, ore))).toBe(CELL_KIND.ore)
    expect(drillGatedOf(cut.events)).toEqual([
      expect.objectContaining({ ...ore, gateKind: 'dynamite', outcome: 'refused' }),
    ])
  })

  it('a core cell under the diagonal follows canMine', () => {
    // The bit sits in core too, so the disc still cuts with every ore cell refused.
    const { cell: core, target } = cellUnderDiagonal(coreTiles(40), 'right', CELL_KIND.core)
    const push = PUSH_OF_BEARING.right
    const plain = drillWith([REFUSE_ALL_ORE], target, FACING.down, CORE_DRILL)
    const cut = drillWith([TWIN_BIT, REFUSE_ALL_ORE], target, FACING.down, CORE_DRILL, push)
    expect(densityOf(cut.world, core)).toBeLessThan(densityOf(plain.world, core))
    expect(cut.events).toContainEqual(expect.objectContaining({ type: 'TileDestroyed', ...core }))
    expect(drillGatedOf(cut.events)).not.toContainEqual(expect.objectContaining(core))
  })

  it('a side push of 0.4 while drilling down cuts straight down', () => {
    const plain = drillWith([])
    const twin = drillWith([TWIN_BIT], TARGET, FACING.down, [], pushingSide(signOfPush(0.4)))
    const straight = cellBesideStraight(0)
    expect(densityOf(twin.world, straight)).toBeLessThan(densityOf(plain.world, straight))
    for (const dx of [-1, 1]) {
      expect(densityOf(twin.world, cellBesideStraight(dx))).toBe(FULL_CELL)
    }
  })

  it('a side push of 0.6 while drilling down cuts diagonally on the same side', () => {
    const plain = drillWith([])
    const right = drillWith([TWIN_BIT], TARGET, FACING.down, [], pushingSide(signOfPush(0.6)))
    const left = drillWith([TWIN_BIT], TARGET, FACING.down, [], pushingSide(signOfPush(-0.6)))
    expect(densityOf(right.world, cellBesideStraight(1))).toBeLessThan(FULL_CELL)
    expect(densityOf(right.world, cellBesideStraight(-1))).toBe(FULL_CELL)
    expect(densityOf(left.world, cellBesideStraight(-1))).toBeLessThan(FULL_CELL)
    expect(densityOf(right.world, cellBesideStraight(0))).toBe(
      densityOf(plain.world, cellBesideStraight(0)),
    )
  })

  it("flipping the drive mid-cell keeps the current cell's bearing and turns the next cell", () => {
    withRegistrations([TWIN_BIT], () => {
      const session = createScriptedSession()
      const left = cellBesideStraight(-1)
      const right = cellBesideStraight(1)
      const report = (tick: number, x: DriveSign) =>
        session.submit(
          tick,
          poseAbove(TARGET, FACING.down, { drillTicks: 12, drive: pushingSide(x) }),
        )
      session.submit(1, poseAbove(TARGET, FACING.down))
      report(13, -1)
      expect(densityOf(session.state().world, left)).toBeLessThan(FULL_CELL)
      const events = report(25, 1)
      expect(events).toContainEqual(expect.objectContaining({ type: 'TileDestroyed', ...left }))
      expect(densityOf(session.state().world, right)).toBe(FULL_CELL)
      report(37, 1)
      expect(densityOf(session.state().world, right)).toBeLessThan(FULL_CELL)
    })
  })

  it('leaves the reach boom on the facing whatever the drive', () => {
    const boom = gearSlice({ aheadCells: 1 })
    const pushed = drillWith([boom], TARGET, FACING.down, [], pushingSide(1))
    expect(pushed.digest).toBe(drillWith([boom]).digest)
    expect(densityOf(pushed.world, cellBesideStraight(1))).toBe(FULL_CELL)
  })

  it('cuts the same with any drive when no gear is registered', () => {
    expect(drillWith([], TARGET, FACING.down, [], pushingSide(1)).digest).toBe(drillWith([]).digest)
  })
})

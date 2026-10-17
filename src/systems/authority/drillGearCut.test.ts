import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { AheadBearing, DrillGearAsk } from '../economy/drillGearCaps'
import { NO_TICKS, reportPoseIntent } from '../bot/botPose'
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
import { cutEnergyNumeratorOf } from './cutCarryFixtures'
import { stateDigest } from './stateDigest'

// Slice drill gear on the reported drill (ticket 234, the GD lock on #205): fake slices register
// through withRegistrations, so no real slice is imported.

/** Band-1 ground six rows under the surface east of the dock. */
const TARGET: TilePoint = { tx: 30, ty: 285 }
const DRILL_TICKS = 60

function gearSlice(ask: DrillGearAsk | null, id = 'gear-probe'): SliceDefinition {
  return {
    id,
    register: (r) => r.drillGear({ id: `${id}.gear`, gearOf: () => ask }),
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
    const beforeVehicle = session.vehicle()
    const before = beforeVehicle.energy
    const events = session.submit(
      1 + DRILL_TICKS,
      poseAbove(tile, facing, { drillTicks: DRILL_TICKS, drive }),
    )
    return {
      events,
      world: session.state().world,
      spent: before - session.vehicle().energy,
      /** What the cut charged in the carry's numerator (ticket 535), exact below a quantum. */
      charged: cutEnergyNumeratorOf(beforeVehicle, session.vehicle()),
      digest: stateDigest(session.state()),
    }
  })
}

/** The bot's reports down the column from just above `TARGET`: a few short drills on each row. */
const DESCENT_ROWS = 4
const DESCENT_REPORTS_PER_ROW = 6
const DESCENT_DRILL_TICKS = 12

/** Each report's events as the bot drills straight down, its drive the one it sends (`botPose`). */
function botDescentWith(slices: readonly SliceDefinition[]): DomainEvent[][] {
  return withRegistrations(slices, () => {
    const session = createScriptedSession()
    const reports: DomainEvent[][] = []
    let tick = 1
    for (let row = 0; row < DESCENT_ROWS; row++) {
      const tile = { tx: TARGET.tx, ty: TARGET.ty + 1 - row }
      session.submit(tick, reportPoseIntent(tile, FACING.down))
      for (let report = 0; report < DESCENT_REPORTS_PER_ROW; report++) {
        tick += DESCENT_DRILL_TICKS
        const ticks = { ...NO_TICKS, drillTicks: DESCENT_DRILL_TICKS }
        reports.push(session.submit(tick, reportPoseIntent(tile, FACING.down, ticks)))
      }
    }
    return reports
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

/** The twin bit with the up-diagonal allowed, as the ceiling anchor asks while clinging (#288). */
const UP_TWIN_BIT = gearSlice({ aheadCells: 1, aheadAim: 'drive', extraBearings: ['up'] })

/** Drilling up while lifting and pushing to one side: 1 the vehicle's right. */
const lifting = (x: DriveSign): DriveSigns => ({ x, y: 1 })

/** The cell past the bit over `TARGET` facing up, along `bearing`. */
function upCellOf(bearing: AheadBearing): TilePoint {
  const ask = { aheadCells: 1, sideCells: 0, aheadBearing: bearing }
  return gearCellsOver(TARGET, FACING.up, ask).ahead[0]
}

/** `cell` (found over `TARGET`) as seen from `target` instead. */
function shiftedBy(cell: TilePoint, target: TilePoint): TilePoint {
  return { tx: cell.tx + target.tx - TARGET.tx, ty: cell.ty + target.ty - TARGET.ty }
}

/** A surface ore cell standing where `crossed` sits over a plain ground target, and that target. */
function groundTargetCrossing(crossed: TilePoint) {
  const targetUnder = (ore: TilePoint) => ({
    tx: ore.tx + TARGET.tx - crossed.tx,
    ty: ore.ty + TARGET.ty - crossed.ty,
  })
  const ore = surfaceOreTiles(40).find((tile) => kindAt(targetUnder(tile)) === CELL_KIND.ground)
  if (ore === undefined) throw new Error('no ore cell over a ground target')
  return { cell: ore, target: targetUnder(ore) }
}

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
    expect(twin.events).toEqual(plain.events)
    expect(twin.spent).toBe(plain.spent)
    for (const dx of [-1, 0, 1]) {
      const cell = cellBesideStraight(dx)
      expect(densityOf(twin.world, cell)).toBe(densityOf(plain.world, cell))
    }
  })

  it("cuts the bot's straight-down path tick for tick as the bare drill with the twin bit", () => {
    const plain = botDescentWith([])
    const twin = botDescentWith([TWIN_BIT])
    expect(plain.flat().filter((event) => event.type === 'TileDestroyed').length).toBeGreaterThan(0)
    expect(twin).toEqual(plain)
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

  it('cuts the up-diagonal on the pushed side facing up only with up allowed (ticket 372)', () => {
    const plain = drillWith([], TARGET, FACING.up)
    for (const [x, bearing] of [
      [1, 'right'],
      [-1, 'left'],
    ] as const) {
      const diagonal = upCellOf(bearing)
      const anchored = drillWith([UP_TWIN_BIT], TARGET, FACING.up, [], lifting(x))
      expect(densityOf(anchored.world, diagonal)).toBeLessThan(densityOf(plain.world, diagonal))
      const bare = drillWith([TWIN_BIT], TARGET, FACING.up, [], lifting(x))
      expect(bare.digest).toBe(drillWith([TWIN_BIT], TARGET, FACING.up).digest)
      expect(densityOf(bare.world, diagonal)).toBe(densityOf(plain.world, diagonal))
    }
  })

  it('cuts as the bare drill facing up with up allowed and no side pushed', () => {
    const still = drillWith([UP_TWIN_BIT], TARGET, FACING.up, [], lifting(0))
    expect(still.digest).toBe(drillWith([TWIN_BIT], TARGET, FACING.up, [], lifting(0)).digest)
  })

  it('refuses the up-diagonal through canMine when a gate holds a cell it crosses', () => {
    const offsets = { ceiling: upCellOf('facing'), diagonal: upCellOf('right') }
    for (const crossed of [offsets.diagonal, offsets.ceiling]) {
      const { cell: ore, target } = groundTargetCrossing(crossed)
      const diagonal = shiftedBy(offsets.diagonal, target)
      const open = drillWith([UP_TWIN_BIT], target, FACING.up, [], lifting(1))
      expect(densityOf(open.world, diagonal)).toBeLessThan(densityOf(EMPTY_WORLD, diagonal))
      const slices = [UP_TWIN_BIT, shellSlice(ore, 'refused')]
      const cut = drillWith(slices, target, FACING.up, [], lifting(1))
      expect(densityOf(cut.world, diagonal)).toBe(densityOf(EMPTY_WORLD, diagonal))
      expect(kindOfCell(cellAt(cut.world, PARAMS, ore))).toBe(CELL_KIND.ore)
    }
  })

  it('stops the up-cut on the tick up drops and turns the next read to the facing', () => {
    const diagonal = upCellOf('right')
    let isAnchored = true
    const anchor: SliceDefinition = {
      id: 'anchor-probe',
      register: (r) =>
        r.drillGear({
          id: 'anchor-probe.gear',
          gearOf: () => (isAnchored ? { extraBearings: ['up'] } : null),
        }),
    }
    withRegistrations([TWIN_BIT, anchor], () => {
      const session = createScriptedSession()
      const report = (tick: number) =>
        session.submit(tick, poseAbove(TARGET, FACING.up, { drillTicks: 4, drive: lifting(1) }))
      session.submit(1, poseAbove(TARGET, FACING.up))
      report(5)
      const started = densityOf(session.state().world, diagonal)
      expect(started).toBeLessThan(densityOf(EMPTY_WORLD, diagonal))
      expect(started).toBeGreaterThan(0)
      expect(session.vehicle().aheadLatch).toEqual({ bearing: 'right', tile: diagonal })
      isAnchored = false
      report(9)
      expect(densityOf(session.state().world, diagonal)).toBe(started)
      expect(session.vehicle().aheadLatch?.bearing).toBe('facing')
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

  it("cuts only the side the drive steers toward for the side cutters' hold (ticket 276)", () => {
    const plain = drillWith([]).world
    const steeringRight = drillWith([SIDE_HOLD], TARGET, FACING.down, [], pushingSide(1)).world
    expect(densityOf(steeringRight, cellBesideBore(1))).toBeLessThan(
      densityOf(plain, cellBesideBore(1)),
    )
    expect(densityOf(steeringRight, cellBesideBore(-1))).toBe(densityOf(plain, cellBesideBore(-1)))
    const steeringLeft = drillWith([SIDE_HOLD], TARGET, FACING.down, [], pushingSide(-1)).world
    expect(densityOf(steeringLeft, cellBesideBore(-1))).toBeLessThan(
      densityOf(plain, cellBesideBore(-1)),
    )
    expect(densityOf(steeringLeft, cellBesideBore(1))).toBe(densityOf(plain, cellBesideBore(1)))
  })

  it('charges each flank its own side cell, the two together what both side cells cost', () => {
    // Since ticket 535 a cut is charged on the density it removed, so the two flanks' cells cost
    // what each removed at its share, not half of a tick count: the right and the left flank
    // beyond the plain cut sum exactly to both side cells beyond it, in the carry's numerator.
    const plain = drillWith([]).charged
    const both = drillWith([gearSlice({ sideCells: 1 })]).charged
    const right = drillWith([SIDE_HOLD], TARGET, FACING.down, [], pushingSide(1)).charged
    const left = drillWith([SIDE_HOLD], TARGET, FACING.down, [], pushingSide(-1)).charged
    expect(right - plain).toBeGreaterThan(0)
    expect(left - plain).toBeGreaterThan(0)
    expect(right - plain + (left - plain)).toBe(both - plain)
  })

  it('cuts exactly one flank with no drive: the seed, else the facing right', () => {
    const plain = drillWith([]).world
    const unseeded = drillWith([SIDE_HOLD]).world
    expect(densityOf(unseeded, cellBesideBore(-1))).toBeLessThan(
      densityOf(plain, cellBesideBore(-1)),
    )
    expect(densityOf(unseeded, cellBesideBore(1))).toBe(densityOf(plain, cellBesideBore(1)))
    const seeded = drillWith([gearSlice({ ...SIDE_HOLD_ASK, sideSeed: { x: 1, y: 0 } })]).world
    expect(densityOf(seeded, cellBesideBore(1))).toBeLessThan(densityOf(plain, cellBesideBore(1)))
    expect(densityOf(seeded, cellBesideBore(-1))).toBe(densityOf(plain, cellBesideBore(-1)))
  })

  it('cuts the plain ask on the other flank when the hold and a both-sided ask are on', () => {
    const both = drillWith([gearSlice({ sideCells: 1 })])
    const withPlain = [SIDE_HOLD, gearSlice({ sideCells: 1 }, 'gear-plain')]
    expect(drillWith(withPlain, TARGET, FACING.down, [], pushingSide(1)).world).toEqual(both.world)
  })

  it('keeps the latched side on the vehicle, and none without a drive-aimed side ask', () => {
    const latchAfter = (slice: SliceDefinition) =>
      withRegistrations([slice], () => {
        const session = createScriptedSession()
        session.submit(1, poseAbove(TARGET, FACING.down))
        const report = { drillTicks: 12, drive: pushingSide(1) }
        session.submit(13, poseAbove(TARGET, FACING.down, report))
        return session.vehicle().sideLatch
      })
    expect(latchAfter(SIDE_HOLD)).toEqual({ side: 'left', tile: { tx: 30, ty: 284 } })
    expect(latchAfter(gearSlice({ sideCells: 1 }))).toBeUndefined()
  })
})

/** The side cutters' Mark 3 hold (TD lock on #276): one side cell, on the side the drive faces. */
const SIDE_HOLD_ASK: DrillGearAsk = { sideCells: 1, sideAim: 'drive' }
const SIDE_HOLD = gearSlice(SIDE_HOLD_ASK)

/** The cell beside the bore level with the stamp, `dx` 1 the screen right. */
function cellBesideBore(dx: number): TilePoint {
  const [screenRight, screenLeft] = gearCellsOver(TARGET, FACING.down, {
    aheadCells: 0,
    sideCells: 1,
  }).side
  return dx === 1 ? screenRight : screenLeft
}

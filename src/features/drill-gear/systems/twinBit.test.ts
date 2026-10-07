import { describe, expect, it } from 'vitest'
import type { AuthorityCommand, CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { hardnessOfTile } from '../../../systems/authority/groundDrill'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  PARAMS,
  poseAbove,
  WORLD_SEED,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { NO_TICKS, reportPoseIntent } from '../../../systems/bot/botPose'
import { replayRun } from '../../../systems/replay/replayRun'
import type { DriveSigns } from '../../../systems/vehicle/driveSigns'
import { ENERGY_QUANTA_PER_TICK } from '../../../systems/vehicle/energyQuanta'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { EMPTY_WORLD, materialCellAt } from '../../../systems/world/worldState'
import { ofType, press } from '../drillGearTestSession'
import { REACH_BOOM_ID } from './cuttersAndBoom'
import { TWIN_BIT_ID } from './twinBit'

// The twin-bit head on the loaded slices (GD lock on #257, ticket 280): mounted in `drill.head`,
// drilling down with a side pushed cuts the cell diagonally below the bit on that side.

/** Band-1 ground six rows under the surface east of the dock, ground all round it. */
const TARGET: TilePoint = { tx: 30, ty: 285 }
/** Drilling down pushing to the vehicle's right: the cell one column right, one row below the bit. */
const PUSH_RIGHT: DriveSigns = { x: 1, y: -1 }
const DRILL_DOWN: DriveSigns = { x: 0, y: -1 }
const REPORT_TICKS = 6
const REPORTS_TO_BREAK = 40

const below = (tile: TilePoint, dx: number): TilePoint => ({ tx: tile.tx + dx, ty: tile.ty - 1 })

/** A session at tick 1 with `setup` applied and the miner above `TARGET`. */
function sessionAboveTarget(setup: readonly CommandIntent[]): ScriptedSession {
  const session = createScriptedSession()
  for (const intent of setup) session.submit(0, intent)
  session.submit(1, poseAbove(TARGET, FACING.down))
  return session
}

const MOUNTED_HEAD = [setVehicleLoadoutCommand({ 'drill.head': TWIN_BIT_ID })]
/** The same command with nothing slotted, so both runs stamp the same `seq`s. */
const BARE_HEAD = [setVehicleLoadoutCommand({})]
const BOOM_ON = [setVehicleLoadoutCommand({ 'drill.collar': REACH_BOOM_ID }), press('drill.collar')]

/** One short drill report over `TARGET`, the `report`th since tick 1. */
function drillReport(session: ScriptedSession, report: number, drive: DriveSigns): DomainEvent[] {
  const counts = { drillTicks: REPORT_TICKS, drive }
  return session.submit(1 + report * REPORT_TICKS, poseAbove(TARGET, FACING.down, counts))
}

/** Short drill reports over `TARGET` until `cell` breaks: the reports, ticks and energy it took. */
function drillUntilBroken(setup: readonly CommandIntent[], drive: DriveSigns, cell: TilePoint) {
  const session = sessionAboveTarget(setup)
  const before = session.vehicle().energy
  for (let report = 1; report <= REPORTS_TO_BREAK; report++) {
    if (isDestroyedIn(drillReport(session, report, drive), cell)) {
      return { reports: report, spent: before - session.vehicle().energy }
    }
  }
  throw new Error(`(${cell.tx}, ${cell.ty}) never broke`)
}

/** The energy the bare drill spends on the same `reports`. */
function bareSpentOver(reports: number, drive: DriveSigns): number {
  const session = sessionAboveTarget([])
  const before = session.vehicle().energy
  for (let report = 1; report <= reports; report++) drillReport(session, report, drive)
  return before - session.vehicle().energy
}

function isDestroyedIn(events: readonly DomainEvent[], cell: TilePoint): boolean {
  return ofType(events, 'TileDestroyed').some(
    (event) => event.type === 'TileDestroyed' && event.tx === cell.tx && event.ty === cell.ty,
  )
}

function hardnessAt(tile: TilePoint) {
  return hardnessOfTile(PARAMS, tile, materialCellAt(EMPTY_WORLD, PARAMS, tile))
}

/** The bot's straight-down descent from just above `TARGET`: each report's events. */
function botDescentWith(setup: readonly CommandIntent[]): DomainEvent[][] {
  const session = createScriptedSession()
  for (const intent of setup) session.submit(0, intent)
  const reports: DomainEvent[][] = []
  let tick = 1
  for (let row = 0; row < DESCENT_ROWS; row++) {
    const tile = { tx: TARGET.tx, ty: TARGET.ty + 1 - row }
    session.submit(tick, reportPoseIntent(tile, FACING.down))
    for (let report = 0; report < REPORTS_PER_STEP; report++) {
      tick += REPORT_TICKS
      const ticks = { ...NO_TICKS, drillTicks: REPORT_TICKS }
      reports.push(session.submit(tick, reportPoseIntent(tile, FACING.down, ticks)))
    }
  }
  return reports
}

const DESCENT_ROWS = 4
const STAIR_STEPS = 5
/** Enough short reports on each step for its diagonal cell to break. */
const REPORTS_PER_STEP = 6

/** The miner stepping down a 45-degree staircase: on each step it drills pushing right. */
function staircaseCommands(): AuthorityCommand[] {
  const intents: { tick: number; intent: CommandIntent }[] = [{ tick: 0, intent: MOUNTED_HEAD[0] }]
  let tick = 1
  for (let step = 0; step < STAIR_STEPS; step++) {
    const bit = { tx: TARGET.tx + step, ty: TARGET.ty - step }
    intents.push({ tick, intent: poseAbove(bit, FACING.down) })
    for (let report = 0; report < REPORTS_PER_STEP; report++) {
      tick += REPORT_TICKS
      const counts = { drillTicks: REPORT_TICKS, drive: PUSH_RIGHT }
      intents.push({ tick, intent: poseAbove(bit, FACING.down, counts) })
    }
  }
  return intents.map(({ tick, intent }, index) => ({
    playerId: 'p1',
    seq: index + 1,
    tick,
    ...intent,
  }))
}

type DiagonalCellCut = Extract<DomainEvent, { type: 'drill-gear.DiagonalCellCut' }>

function diagonalCutsOf(events: readonly DomainEvent[]): DiagonalCellCut[] {
  return events.filter(
    (event): event is DiagonalCellCut => event.type === 'drill-gear.DiagonalCellCut',
  )
}

describe('twin-bit head', () => {
  it("the diagonal cell costs at least the bit's energy", () => {
    const diagonal = below(TARGET, 1)
    const cut = drillUntilBroken(MOUNTED_HEAD, PUSH_RIGHT, diagonal)
    const extra = cut.spent - bareSpentOver(cut.reports, PUSH_RIGHT)
    // The cell lost something in every tick until it broke, each at the drill's own rate or more.
    expect(extra).toBeGreaterThanOrEqual(cut.reports * REPORT_TICKS * ENERGY_QUANTA_PER_TICK.drill)
  })

  it('the diagonal cell takes full hardness ticks', () => {
    // The reach boom's cell along the facing is cut at a whole share and its own full hardness.
    const diagonal = below(TARGET, 1)
    const straight = below(TARGET, 0)
    expect(hardnessAt(diagonal)).toEqual(hardnessAt(straight))
    const twin = drillUntilBroken(MOUNTED_HEAD, PUSH_RIGHT, diagonal)
    const boom = drillUntilBroken(BOOM_ON, DRILL_DOWN, straight)
    expect(twin.reports).toBe(boom.reports)
    expect(twin.spent).toBe(boom.spent)
  })

  it('driving straight down with the head mounted cuts as without it', () => {
    const bare = botDescentWith(BARE_HEAD)
    const mounted = botDescentWith(MOUNTED_HEAD)
    expect(bare.flat().filter((event) => event.type === 'TileDestroyed').length).toBeGreaterThan(0)
    expect(mounted).toEqual(bare)
  })

  it('a diagonal step drops one row per cell at 30 and 144 steps/s', () => {
    const commands = staircaseCommands()
    const jumped = diagonalCutsOf(replayRun(WORLD_SEED, commands).events)
    expect(jumped.map((event) => ({ tx: event.tx, ty: event.ty }))).toEqual(
      Array.from({ length: STAIR_STEPS }, (_, step) => ({
        tx: TARGET.tx + step + 1,
        ty: TARGET.ty - step - 1,
      })),
    )
    for (const framesPerSecond of [30, 144]) {
      expect(diagonalCutsOf(replayRun(WORLD_SEED, commands, { framesPerSecond }).events)).toEqual(
        jumped,
      )
    }
  })

  it('logs nothing diagonal while it cuts straight down', () => {
    expect(diagonalCutsOf(botDescentWith(MOUNTED_HEAD).flat())).toEqual([])
  })
})

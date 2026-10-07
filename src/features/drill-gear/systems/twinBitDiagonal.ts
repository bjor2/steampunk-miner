/**
 * The scenario `drill-gear.twin-bit-diagonal` (GD lock on #257, build 3, ticket 281): a P19
 * loadout with the twin-bit head, then a down-left and a down-right bore from the surface east of
 * the pad. On each step the miner drills down pushing to the bore's side, so the head cuts the
 * cell diagonally below the bit, and the next step stands one column over and one row lower: a
 * 45-degree bore with a one-row drop per cell. It is a `fastForward` script, written here and
 * played by whoever asks for it (the debug action for the `npm run dev` eye check, the specs), so
 * it replays and logs like any scenario command.
 */
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { FREEZE_ENEMIES, poseAbove, WORLD_SEED } from '../../../systems/authority/scriptedSession'
import { UPGRADE_IDS } from '../../../systems/economy/economyDefinition'
import { onCurveSteps } from '../../../systems/economy/vehicleStats'
import type { ScriptedCommand } from '../../../systems/fastForward'
import { setPlanetCommand, setPlanetSeedCommand } from '../../../systems/startScenarioCommands'
import type { DriveSign, DriveSigns } from '../../../systems/vehicle/driveSigns'
import { setUpgradeCommand } from '../../../systems/vehicle/vehicleCommands'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { padLastColumnOf, planetParamsFor } from '../../../systems/world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { TWIN_BIT_ID } from './twinBit'

export const TWIN_BIT_DIAGONAL_SCENARIO_ID = 'drill-gear.twin-bit-diagonal'

/** The head's node planet (#257). */
export const TWIN_BIT_DIAGONAL_PLANET = 19

/** Cells in each bore. */
export const DIAGONAL_STEPS = 6

/** Short drill reports on each step, enough for its diagonal cell to break on-curve. */
const REPORTS_PER_STEP = 10
const REPORT_TICKS = 6

/** Columns past the pad's last column where the down-right bore starts; the down-left one east of it. */
const RIGHT_BORE_COLUMNS_PAST_PAD = 10
const LEFT_BORE_COLUMNS_PAST_RIGHT = 2 * DIAGONAL_STEPS + 4

/** Which way a bore runs on screen. The logged bearing is the facing's: down-right is its left. */
export type BoreSide = 'down-right' | 'down-left'

const COLUMN_STEP_OF: Readonly<Record<BoreSide, DriveSign>> = { 'down-right': 1, 'down-left': -1 }

/** One bore: the side it runs to and the bit's tile on its first step. */
export interface DiagonalBore {
  side: BoreSide
  firstBit: TilePoint
}

export interface TwinBitDiagonalScript {
  commands: ScriptedCommand[]
  /** The tick of the script's last command, where the `fastForward` should end. */
  endTick: number
  bores: DiagonalBore[]
}

/** The scenario as a script whose first command is at `firstTick`. */
export function twinBitDiagonalScriptOf(firstTick: number): TwinBitDiagonalScript {
  const bores = diagonalBores()
  const setup = loadoutAt(firstTick)
  const right = boreCommands(bores[0], firstTick + 1)
  const left = boreCommands(bores[1], lastTickOf(right) + 1)
  const commands = [...setup, ...right, ...left]
  return { commands, endTick: lastTickOf(commands), bores }
}

/** The bit's tile on `step` (0 is the first) of `bore`: one column over and one row down a step. */
export function bitOnStep(bore: DiagonalBore, step: number): TilePoint {
  return {
    tx: bore.firstBit.tx + COLUMN_STEP_OF[bore.side] * step,
    ty: bore.firstBit.ty - step,
  }
}

/** The cell the head cuts on `step`: diagonally below the bit on the bore's side. */
export function diagonalCellOnStep(bore: DiagonalBore, step: number): TilePoint {
  return bitOnStep(bore, step + 1)
}

/** The down-right bore, then the down-left one east of it, each from its column's surface. */
function diagonalBores(): DiagonalBore[] {
  const { radiusTiles } = planetParamsFor(WORLD_SEED, TWIN_BIT_DIAGONAL_PLANET)
  const rightColumn = padLastColumnOf(TWIN_BIT_DIAGONAL_PLANET) + RIGHT_BORE_COLUMNS_PAST_PAD
  const leftColumn = rightColumn + LEFT_BORE_COLUMNS_PAST_RIGHT
  return [
    { side: 'down-right', firstBit: surfaceTileOf(rightColumn, radiusTiles) },
    { side: 'down-left', firstBit: surfaceTileOf(leftColumn, radiusTiles) },
  ]
}

function surfaceTileOf(tx: number, radiusTiles: number): TilePoint {
  return { tx, ty: surfaceRowOfColumn(tx, radiusTiles) }
}

/** P19 on the scenario seed, the on-curve levels, enemies frozen and the head in `drill.head`. */
function loadoutAt(tick: number): ScriptedCommand[] {
  const steps = onCurveSteps(TWIN_BIT_DIAGONAL_PLANET)
  return [
    setPlanetCommand(TWIN_BIT_DIAGONAL_PLANET),
    setPlanetSeedCommand(WORLD_SEED),
    FREEZE_ENEMIES,
    ...UPGRADE_IDS.map((id) => setUpgradeCommand(id, steps[id])),
    setVehicleLoadoutCommand({ 'drill.head': TWIN_BIT_ID }),
  ].map((intent) => ({ tick, ...intent }))
}

/** Each step: stand above the bit, then drill down pushing to the bore's side. */
function boreCommands(bore: DiagonalBore, firstTick: number): ScriptedCommand[] {
  return Array.from({ length: DIAGONAL_STEPS }, (_, step) =>
    stepCommands(bitOnStep(bore, step), driveOf(bore.side), stepStartTick(firstTick, step)),
  ).flat()
}

/** Drilling down, pushing to the bore's side. */
function driveOf(side: BoreSide): DriveSigns {
  return { x: COLUMN_STEP_OF[side], y: -1 }
}

function stepStartTick(firstTick: number, step: number): number {
  return firstTick + step * (REPORTS_PER_STEP + 1) * REPORT_TICKS
}

function stepCommands(bit: TilePoint, drive: DriveSigns, tick: number): ScriptedCommand[] {
  const drilling = { drillTicks: REPORT_TICKS, drive }
  const reports = Array.from({ length: REPORTS_PER_STEP }, (_, report) => ({
    tick: tick + (report + 1) * REPORT_TICKS,
    ...poseAbove(bit, FACING.down, drilling),
  }))
  return [{ tick, ...poseAbove(bit, FACING.down) }, ...reports]
}

function lastTickOf(commands: readonly ScriptedCommand[]): number {
  return commands[commands.length - 1].tick
}

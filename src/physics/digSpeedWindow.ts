/**
 * A read window over a live-loop leg for the dig-speed STOP of ticket 514 (the Vertical Scaler's
 * four bars, 6226431087, as the TD's v2 ruling 6226459471 quotes them), one fixed tick at a time:
 * - law work: Σ(density removed × hardness) read from the ground before and after each tick
 *   (`lawWorkFixtures.ts`), round the body;
 * - energy: the quanta the tick's commands took from the tank, less what its pose reports charged
 *   for driving and thrust, so the drill's own charge;
 * - heat: the drill ticks the authority heats for at each report, read as the `reportPose` rule
 *   reads them (`reportedDrillTicksOf` in `vehicleCommandRules.ts`): the swept steps' summed dig
 *   time since the last report when steps cut, else the report's own `drillTicks`. Planet 1 has no
 *   heat gauge, so this is the charge's input, not a gauge reading;
 * - cells yielded, drilled ticks and the body's path.
 * Test support for `digSpeedStop.lane.test.ts`; the spec installs the memory sink it reads.
 */
import { PHYSICS_TIMESTEP } from '../constants/physics'
import type { MemorySink } from '../logging/eventSink'
import { readAuthorityState } from '../store/authorityLink'
import { readLocalVehicle, useGameStore } from '../store/gameStore'
import type { AuthorityCommand } from '../systems/authority/authorityCommand'
import {
  addLawWork,
  lawWorkOfChange,
  NO_LAW_WORK,
  tilesAround,
  type ChargedLawWork,
} from '../systems/authority/lawWorkFixtures'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { drillQuantumAt } from '../systems/authority/stepBoundRead'
import type { Vector2 } from '../systems/vehicle/localFrame'
import { ENERGY_QUANTA_PER_TICK } from '../systems/vehicle/energyQuanta'
import { stepDigTicksOf } from '../systems/vehicle/sweptCut'
import type { TickRead } from './cutFollowFixtures'

/** Cells this far round the body, each way, are read for density each tick. */
const WATCH_CELLS = 3

/** What a window read, summed. */
export interface DigSpeedSums extends ChargedLawWork {
  seconds: number
  drilledTicks: number
}

export interface DigSpeedWindow {
  note: (read: TickRead) => void
  sums: () => DigSpeedSums
}

/** A window from now; `sink` is the run log's memory sink the loop's commands land in. */
export function openDigSpeedWindow(sink: MemorySink): DigSpeedWindow {
  const positions: Vector2[] = []
  let before = readAuthorityState()
  let commandsSeen = sink.commands.length
  let lastReportTick = before.tick
  let law = NO_LAW_WORK
  let spent = 0
  let movement = 0
  let heatTicks = 0
  let drilledTicks = 0
  const note = (read: TickRead) => {
    const params = planetParamsOf(before.planet)
    if (params !== null) {
      const tiles = tilesAround(positions.at(-1) ?? read.position, WATCH_CELLS)
      const after = readAuthorityState().world
      const quantum = drillQuantumAt(before, playerId())
      const change = lawWorkOfChange(before, after, params, playerId(), tiles, quantum)
      law = addLawWork(law, change)
    }
    for (const report of reportsOf(sink.commands.slice(commandsSeen))) {
      movement += movementQuantaOf(report)
      heatTicks += heatTicksOf(report, lastReportTick)
      lastReportTick = report.tick
    }
    commandsSeen = sink.commands.length
    spent += read.energySpent
    drilledTicks += read.result.flags.isDrilling ? 1 : 0
    positions.push(read.position)
    before = readAuthorityState()
  }
  const sums = (): DigSpeedSums => ({
    law,
    metres: pathLengthOf(positions),
    seconds: positions.length * PHYSICS_TIMESTEP,
    drillEnergy: spent - movement,
    heatTicks,
    drilledTicks,
  })
  return { note, sums }
}

function playerId(): string {
  return useGameStore.getState().playerId
}

function reportsOf(commands: readonly AuthorityCommand[]): AuthorityCommand<'reportPose'>[] {
  return commands.filter(
    (command): command is AuthorityCommand<'reportPose'> => command.type === 'reportPose',
  )
}

function movementQuantaOf({ payload }: AuthorityCommand<'reportPose'>): number {
  return (
    payload.thrustTicks * ENERGY_QUANTA_PER_TICK.thrust +
    payload.driveTicks * ENERGY_QUANTA_PER_TICK.drive
  )
}

/** The drill ticks the report heats for; the drill step comes before a tick's report. */
function heatTicksOf(report: AuthorityCommand<'reportPose'>, lastReportTick: number): number {
  const cursor = readLocalVehicle().sweptCut
  const isCutBySteps = cursor !== undefined && cursor.tick > lastReportTick
  return isCutBySteps ? stepDigTicksOf(cursor) : report.payload.drillTicks
}

function pathLengthOf(positions: readonly Vector2[]): number {
  let metres = 0
  for (let i = 1; i < positions.length; i++) {
    metres += Math.hypot(positions[i].x - positions[i - 1].x, positions[i].y - positions[i - 1].y)
  }
  return metres
}

/**
 * The no-free-cell check as a reusable harness (GD lock on #206, VS pin 1; ticket 323): #281's
 * exact test, which the twin bit passed, for every combo and twist. The pacing bot arrives on
 * planets 7 and 10 with the on-curve levels and plays to the core on each pacing seed twice: once
 * with a bare setup and once with the items owned, none slotted and no slot pressed. It drives
 * straight down (drive 0), so an item that only changes how a lane item plays must leave the run
 * exactly as it was: the same cells dug on the same ticks, the same ore banked for the same value,
 * the same core tick. An exact match, not the 0.98x pace tolerance.
 *
 * The kernel spec runs it with every combo owned (`itemHookNoFreeCell.test.ts`); the lane consults
 * and the combo and twist builds call it with their own setups. Only specs use it, and it is long:
 * twelve bot runs, for the box Tester.
 */
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { CommandIntent } from '../authority/authorityCommand'
import { createAuthorityState } from '../authority/authorityState'
import type { DomainEvent } from '../authority/domainEvent'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { stepOfMajor } from '../economy/upgradeSteps'
import { onCurveLevel } from '../economy/vehicleStats'
import { setPlanetCommand, setPlanetSeedCommand } from '../startScenarioCommands'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import { playSlice, type SliceRun } from './playSlice'

export const NO_FREE_CELL_PLANETS = [7, 10] as const
/** 83921, 31415 and 27182. */
export const NO_FREE_CELL_SEEDS = PACING_WORLD_SEEDS['bot-slice']

/** Two hours on one planet: room for a slow core on either run. */
const BUDGET_TICKS = 2 * 60 * 60 * TICKS_PER_SECOND
const ARRIVAL_MONEY = '20000'

/**
 * What each run sends after the arrival, before the first trip. Both lists hold as many commands,
 * so the two runs stamp the same `seq`s.
 */
export interface NoFreeCellSetups {
  bare: readonly CommandIntent[]
  owned: readonly CommandIntent[]
}

/** What the check compares between the two runs. */
export interface MinedTrace {
  coreTicks: number
  mined: MinedStep[]
}

export type MinedStep =
  | { tick: number; tx: number; ty: number; kind: string }
  | { tick: number; oreId: string; value: string }

export interface NoFreeCellRuns {
  planet: number
  seed: number
  bare: MinedTrace
  owned: MinedTrace
}

/** Both runs on every pacing seed of `planet`. */
export function noFreeCellRunsOn(planet: number, setups: NoFreeCellSetups): NoFreeCellRuns[] {
  refuseUnevenSetups(setups)
  return NO_FREE_CELL_SEEDS.map((seed) => ({
    planet,
    seed,
    bare: minedTraceOf(coreRunOn(planet, seed, setups.bare)),
    owned: minedTraceOf(coreRunOn(planet, seed, setups.owned)),
  }))
}

/** The run's core tick and each cell dug and ore unit banked, in order, with its tick. */
export function minedTraceOf(run: SliceRun): MinedTrace {
  return { coreTicks: coreTicksOf(run), mined: minedSequenceOf(run.events) }
}

export function minedSequenceOf(events: readonly DomainEvent[]): MinedStep[] {
  return events.flatMap(minedStepsOf)
}

/** One line per seed for the Tester's log. */
export function noFreeCellLineOf({ planet, seed, bare, owned }: NoFreeCellRuns): string {
  return `P${planet} seed ${seed}: bare ${bare.coreTicks}, owned ${owned.coreTicks} ticks`
}

function refuseUnevenSetups({ bare, owned }: NoFreeCellSetups): void {
  if (bare.length === owned.length) return
  throw new RangeError(
    `the bare and owned setups must send as many commands (${bare.length} and ${owned.length})`,
  )
}

/** The bot from arrival on `planet` to its core, with `setup` sent before the first trip. */
function coreRunOn(planet: number, worldSeed: number, setup: readonly CommandIntent[]): SliceRun {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: worldSeed, playerIds: ['p1'] })
  return playSlice(start, {
    maxTicks: BUDGET_TICKS,
    lastPlanet: planet,
    startCommands: [...arrivalOn(planet, worldSeed), ...setup],
  })
}

/** On `planet` with the on-curve levels and a little money, as a bot arriving there. */
function arrivalOn(planet: number, worldSeed: number): CommandIntent[] {
  return [
    setPlanetCommand(planet),
    setPlanetSeedCommand(worldSeed),
    { type: 'debug.setMoney', payload: { amount: ARRIVAL_MONEY } },
    ...UPGRADE_IDS.map((id) => setUpgradeCommand(id, stepOfMajor(onCurveLevel(id, planet)))),
  ]
}

/** Ticks from arrival to the planet's core; the whole budget when the core is never reached. */
function coreTicksOf(run: SliceRun): number {
  return run.isFinished ? run.state.tick : BUDGET_TICKS
}

function minedStepsOf(event: DomainEvent): MinedStep[] {
  if (event.type === 'TileDestroyed') {
    return [{ tick: event.tick, tx: event.tx, ty: event.ty, kind: event.kind }]
  }
  if (event.type === 'CargoAdded') {
    return [{ tick: event.tick, oreId: event.oreId, value: event.value }]
  }
  return []
}

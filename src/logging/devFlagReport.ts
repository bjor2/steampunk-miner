/**
 * The flag set a run ran with, for every pacing, perf, bench and bot report (ticket 547, VS on
 * #547: "Every pacing, perf, bench and bot report prints the flag set it ran with", the defaults
 * included), and the refusal the paired and compared runs make: a run marked by `debug.setFlags`
 * (its delta, or the sticky `devFlagsEverSet` after a flip back) is never pacing, perf or
 * paired-run evidence, so it is refused outright, never compared against a default run.
 *
 * Bots, benches, lanes and goldens build their sessions on the shipped defaults with no delta, so
 * their line reads "shipped defaults"; a harness handed a delta says so on the same line.
 */
import { DEV_FLAGS, type AuthorityDevFlags, type DevFlags } from '../constants/devFlags'
import {
  deltaOfFlags,
  flagsOf,
  isDevFlagTainted,
  type CarriesDevFlags,
} from '../systems/authority/devFlagState'

/** A run a report compares, named for the refusal. */
export interface FlaggedRun {
  label: string
  state: CarriesDevFlags
}

/**
 * One line: whether the runs are on the shipped defaults or tainted, then every flag's value, the
 * client loop's as `client` reads them and the authority's as the first run's state has them.
 */
export function devFlagSetLine(
  states: readonly CarriesDevFlags[],
  client: DevFlags = DEV_FLAGS,
): string {
  const first = states[0] ?? {}
  return `dev flags: ${taintWordsOf(states)}; ${flagWordsOf(client)} | ${flagWordsOf(flagsOf(first))}`
}

/** Why the runs cannot be compared: one line per run that a `debug.setFlags` marked. */
export function taintedRunProblems(runs: readonly FlaggedRun[]): string[] {
  return runs
    .filter((run) => isDevFlagTainted(run.state))
    .map((run) => `${run.label} ran with dev flags set (${deltaWordsOf(run.state)}): not evidence`)
}

/** Throws before a paired or compared report reads a tainted run (VS 1 on #547). */
export function refuseTaintedRuns(report: string, runs: readonly FlaggedRun[]): void {
  const problems = taintedRunProblems(runs)
  if (problems.length > 0) throw new Error(`${report} refused: ${problems.join('; ')}`)
}

function taintWordsOf(states: readonly CarriesDevFlags[]): string {
  const tainted = states.filter(isDevFlagTainted)
  if (tainted.length === 0) return 'shipped defaults, never set'
  return `TAINTED, ${tainted.length} of ${states.length} runs set flags (${deltaWordsOf(tainted[0])}), not evidence`
}

function deltaWordsOf(state: CarriesDevFlags): string {
  const entries = Object.entries(deltaOfFlags(flagsOf(state)))
  if (entries.length === 0) return 'flipped back to the defaults'
  return entries.map(([id, isOn]) => `${id} ${isOn ? 'on' : 'off'}`).join(', ')
}

function flagWordsOf(flags: DevFlags | AuthorityDevFlags): string {
  return Object.entries(flags)
    .map(([id, isOn]) => `${id} ${isOn ? 'on' : 'off'}`)
    .join(', ')
}

/** A bot run as the balance scripts hold it: its end state, and its world seed when seeded. */
interface BotRunOfSeed {
  worldSeed?: number
  run: { state: CarriesDevFlags }
}

/** The runs of one arm of a report, each named by its arm and seed. */
export function flaggedRunsOf(arm: string, runs: readonly BotRunOfSeed[]): FlaggedRun[] {
  return runs.map((run) => ({
    label: run.worldSeed === undefined ? arm : `${arm} seed ${run.worldSeed}`,
    state: run.run.state,
  }))
}

/** A report's "Dev flags" section, once no run of it is tainted. */
export function devFlagSectionOf(report: string, runs: readonly FlaggedRun[]): string {
  refuseTaintedRuns(report, runs)
  return `### Dev flags\n\n${devFlagSetLine(runs.map((run) => run.state))}`
}

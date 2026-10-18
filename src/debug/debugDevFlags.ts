/**
 * The debug API's dev flags (ticket 548, the TD ruling on #547 section 4): `ui.setDevFlags` sets
 * flags through the same command path the panel (#549) uses, so a Playwright spec drives them
 * without the panel and without `localStorage`; unlike the rest of `ui` it sends a logged
 * `debug.setFlags`, as every flag change marks the run. `ui.getDevFlags` is an unlogged read.
 */
import type { AuthorityDevFlags } from '../constants/devFlags'
import { readAuthorityState } from '../store/authorityLink'
import { useGameStore, vehicleDebugProblems } from '../store/gameStore'
import { flagsOf } from '../systems/authority/devFlagState'
import type { ClientDevFlags } from '../systems/devFlags/clientDevFlags'
import {
  authorityPartOf,
  devFlagChoiceProblems,
  setFlagsCommandOf,
} from '../systems/devFlags/devFlagChoice'
import type {
  DevFlagChoice,
  DevFlagId,
  DevFlagOverrides,
} from '../systems/devFlags/devFlagOverrides'
import type { DebugResult } from './debugScreens'

/** The flags the session runs with, what waits for an idle drill, and what the browser remembers. */
export interface DevFlagsReport {
  client: ClientDevFlags
  authority: AuthorityDevFlags
  /** The sticky taint (ticket 547): a `debug.setFlags` was accepted in this session. */
  isEverSet: boolean
  overrides: DevFlagOverrides
  changedDefaults: readonly DevFlagId[]
}

export interface DebugDevFlags {
  /**
   * Sets the flags named, live: the authority's as one `debug.setFlags`, the client loop's
   * locally, `drill.sweptCut` pending until the drill is idle. Refused whole on any problem.
   */
  setDevFlags(choice: unknown): DebugResult
  getDevFlags(): DebugResult<{ flags: DevFlagsReport }>
}

const game = () => useGameStore.getState()

export function createDebugDevFlags(): DebugDevFlags {
  return {
    setDevFlags: setDevFlagsUnlessRefused,
    getDevFlags: () => ({ ok: true, flags: readDevFlagsReport() }),
  }
}

function setDevFlagsUnlessRefused(choice: unknown): DebugResult {
  const problems = setDevFlagsProblems(choice)
  if (problems.length > 0) return { ok: false, problems }
  game().setDevFlags(choice as DevFlagChoice)
  return { ok: true }
}

/** The choice's own problems, then the authority's dry-run refusal of the flags it would send. */
function setDevFlagsProblems(choice: unknown): string[] {
  const problems = devFlagChoiceProblems(choice)
  if (problems.length > 0) return problems
  const delta = authorityPartOf(choice as DevFlagChoice)
  if (Object.keys(delta).length === 0) return []
  return vehicleDebugProblems(setFlagsCommandOf(delta))
}

function readDevFlagsReport(): DevFlagsReport {
  const state = readAuthorityState()
  return {
    client: game().clientDevFlags,
    authority: flagsOf(state),
    isEverSet: state.devFlagsEverSet === true,
    overrides: game().devFlagOverrides,
    changedDefaults: game().changedDevFlagDefaults,
  }
}

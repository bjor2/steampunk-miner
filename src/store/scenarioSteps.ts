/**
 * How the store plays a scenario and a fast-forward through the authority (#11 sections 4 and 5):
 * the start's `debug.*` commands, the script's steps and the fast-forward's command list, each
 * submitted or advanced through `authorityLink` like any other play.
 */
import type { CommandIntent } from '../systems/authority/authorityCommand'
import type { FastForwardStep } from '../systems/fastForward'
import type { ScriptStep } from '../systems/scenario'
import { advanceAuthorityTo, readAuthorityState, submitCommand } from './authorityLink'

export function submitEach(playerId: string, intents: readonly CommandIntent[]): void {
  for (const intent of intents) submitCommand(playerId, intent)
}

/**
 * Script ticks count from tick 0, where the scenario's session starts; a step whose tick an
 * earlier fast-forward already passed runs at once, so time never goes backwards.
 */
export function runScenarioScript(
  script: readonly ScriptStep[],
  fastForward: (ticks: number) => void,
): void {
  for (const step of script) {
    advanceAuthorityTo(Math.max(step.tick, readAuthorityState().tick))
    fastForward(step.args.ticks)
  }
}

export function runFastForwardSteps(playerId: string, steps: readonly FastForwardStep[]): void {
  for (const step of steps) {
    if (step.kind === 'advance') advanceAuthorityTo(step.tick)
    else submitCommand(playerId, step.intent)
  }
}

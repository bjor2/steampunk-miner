/**
 * A choice of dev flags split by who runs them (ticket 548, the TD ruling on #547): the client
 * loop's flags stay on this machine, the authority's go out as one logged `debug.setFlags`. Flags
 * only, never numbers (VS 6): a choice naming anything else, or any value but a boolean, is
 * refused whole.
 */
import { AUTHORITY_DEV_FLAGS, DEV_FLAGS, type DevFlags } from '../../constants/devFlags'
import type { CommandIntent } from '../authority/authorityCommand'
import {
  deltaOfFlags,
  flagsOf,
  isAuthorityFlagId,
  isDevFlagTainted,
  type AuthorityFlagId,
  type CarriesDevFlags,
  type DevFlagDelta,
} from '../authority/devFlagState'
import { isDevFlagId, type DevFlagChoice } from './devFlagOverrides'

export type ClientFlagChoice = Readonly<Partial<DevFlags>>

/** Why `choice` cannot be applied: every problem, none when it names only flags with booleans. */
export function devFlagChoiceProblems(choice: unknown): string[] {
  if (typeof choice !== 'object' || choice === null || Array.isArray(choice))
    return ['the flags must be an object of flag ids and booleans']
  return Object.entries(choice).flatMap(([id, value]) => choiceEntryProblems(id, value))
}

function choiceEntryProblems(id: string, value: unknown): string[] {
  if (!isDevFlagId(id)) return [`"${id}" is not a dev flag`]
  return typeof value === 'boolean' ? [] : [`"${id}" must be true or false`]
}

export function clientPartOf(choice: DevFlagChoice): ClientFlagChoice {
  return Object.fromEntries(Object.entries(choice).filter(([id]) => Object.hasOwn(DEV_FLAGS, id)))
}

/** The authority's flags the choice names, as `debug.setFlags` takes them. */
export function authorityPartOf(choice: DevFlagChoice): DevFlagDelta {
  return Object.fromEntries(Object.entries(choice).filter(([id]) => isAuthorityFlagId(id)))
}

/**
 * The `debug.setFlags` delta a choice sends, or null when none is needed:
 *
 * - the authority flags it changes in the session;
 * - else, when it changes only the client loop's flags, an empty delta while the session is
 *   unmarked, so the run and its save carry the taint (VS on #547);
 * - nothing when it changes nothing, so a choice at the running values, and a default session's
 *   start with no override, leave every digest as it was.
 *
 * `client` is what the loop runs or will run once its pending flips land; a session start passes
 * the shipped client flags, which it starts the loop on.
 */
export function setFlagsDeltaOf(
  choice: DevFlagChoice,
  state: CarriesDevFlags,
  client: DevFlags,
): DevFlagDelta | null {
  const delta = changedAuthorityPartOf(choice, state)
  if (Object.keys(delta).length > 0) return delta
  if (!changesClientFlags(choice, client) || isDevFlagTainted(state)) return null
  return {}
}

function changedAuthorityPartOf(choice: DevFlagChoice, state: CarriesDevFlags): DevFlagDelta {
  const flags = flagsOf(state)
  return Object.fromEntries(
    Object.entries(authorityPartOf(choice)).filter(
      ([id, isOn]) => flags[id as AuthorityFlagId] !== isOn,
    ),
  )
}

/** Whether `choice` names a client flag at another value than `client` has it. */
export function changesClientFlags(choice: DevFlagChoice, client: DevFlags): boolean {
  return Object.entries(clientPartOf(choice)).some(
    ([id, isOn]) => client[id as keyof DevFlags] !== isOn,
  )
}

export function setFlagsCommandOf(delta: DevFlagDelta): CommandIntent<'debug.setFlags'> {
  return { type: 'debug.setFlags', payload: { delta } }
}

/**
 * What the reset button chooses: every client flag at its shipped value, and each authority flag
 * the session runs off its default back to it. Flags at their defaults are not named, so a
 * shared session's guest resets its own loop without asking for the host's rules.
 */
export function resetChoiceOf(state: CarriesDevFlags): DevFlagChoice {
  const offDefault = Object.keys(deltaOfFlags(flagsOf(state))) as AuthorityFlagId[]
  return {
    ...DEV_FLAGS,
    ...Object.fromEntries(offDefault.map((id) => [id, AUTHORITY_DEV_FLAGS[id]])),
  }
}

/** The client flags off their shipped defaults, for the run log header. */
export function clientDeltaOf(flags: DevFlags): ClientFlagChoice {
  return Object.fromEntries(
    Object.entries(flags).filter(([id, isOn]) => DEV_FLAGS[id as keyof DevFlags] !== isOn),
  )
}

/** The authority's and the client's flags off their defaults, as one map (the run log header). */
export function runFlagDeltaOf(state: CarriesDevFlags, client: DevFlags): DevFlagChoice {
  return { ...deltaOfFlags(flagsOf(state)), ...clientDeltaOf(client) }
}

/**
 * The client loop's dev flags as the vehicle loop reads them each step (ticket 548, the TD ruling
 * on #547 section 2): local to this machine, never sent to the authority.
 *
 * - `drill.reportEveryTick` flips at once.
 * - `drill.sweptCut` waits for the drill to be idle: the cut gate rides on the swept cursor, so a
 *   flip mid-bite would hand the motor a gate the authority never cut to. Until then the flip is
 *   pending, and a second choice back to the running value cancels it.
 */
import { DEV_FLAGS, type DevFlags } from '../../constants/devFlags'
import type { ClientFlagChoice } from './devFlagChoice'

export interface ClientDevFlags {
  /** What the loop runs with now. */
  flags: DevFlags
  /** Flips chosen and waiting for an idle drill; empty while none waits. */
  pending: ClientFlagChoice
}

export const SHIPPED_CLIENT_DEV_FLAGS: ClientDevFlags = { flags: DEV_FLAGS, pending: {} }

type ClientFlagId = keyof DevFlags

/** The flags whose flip waits for the drill to be idle. */
const WAITS_FOR_IDLE_DRILL: Readonly<Record<ClientFlagId, boolean>> = {
  'drill.sweptCut': true,
  'drill.reportEveryTick': false,
}

/** `client` with each chosen flag applied, or pending where it waits for an idle drill. */
export function withChosenClientFlags(
  client: ClientDevFlags,
  choice: ClientFlagChoice,
): ClientDevFlags {
  return Object.entries(choice).reduce(
    (next, [id, isOn]) => withChosenClientFlag(next, id as ClientFlagId, isOn),
    client,
  )
}

function withChosenClientFlag(
  client: ClientDevFlags,
  id: ClientFlagId,
  isOn: boolean | undefined,
): ClientDevFlags {
  if (isOn === undefined) return client
  const { [id]: _cancelled, ...pending } = client.pending
  if (WAITS_FOR_IDLE_DRILL[id] && client.flags[id] !== isOn)
    return { flags: client.flags, pending: { ...pending, [id]: isOn } }
  return { flags: { ...client.flags, [id]: isOn }, pending }
}

/** The pending flips applied once the drill is idle; `client` itself while it bites or none waits. */
export function settledClientFlags(client: ClientDevFlags, isDrillIdle: boolean): ClientDevFlags {
  if (!isDrillIdle || !hasPendingFlips(client)) return client
  return { flags: { ...client.flags, ...client.pending }, pending: {} }
}

export function hasPendingFlips(client: ClientDevFlags): boolean {
  return Object.keys(client.pending).length > 0
}

/** The flags as they will run once every pending flip lands. */
export function chosenClientFlagsOf(client: ClientDevFlags): DevFlags {
  return { ...client.flags, ...client.pending }
}

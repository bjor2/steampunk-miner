/**
 * Which kit sockets a player's rig shows, and how (ticket 883, PK4c look; the GD's yes under
 * #878): an owned tool hangs on its socket, deployed while `tool_acting` holds it on, so through
 * the 30-tick tail too (`actingTools.ts` keeps a tool acting until its tail runs out); the flask
 * rack shows while a flask is carried or open, one flask per carried flask, and while one is open
 * the uncorked flask stands vented in the rack beside them. The deployed pose gives the acting
 * trade-offs a visible cause (HS's Q1 condition). Look-only: it reads the state, never writes it.
 */
import { vehicleOf, type AuthorityState } from '../../../../systems/authority/authorityState'
import { isToolActing } from '../../../../systems/vehicle/actingTools'
import { flaskStateOf } from '../flaskRules'
import { ownsKitTool } from '../kitHoldings'
import { kitHoldingsOf } from '../kitHoldingsSection'
import type { KitSocket } from '../kitSockets'
import { kitToolIdOf } from '../kitToolRules'
import type { KitSocketShow } from './kitSocketLook'

/** A socket on the rig and what of it shows now. */
export interface ShownKitSocket {
  socket: KitSocket
  show: KitSocketShow
}

/** The flask rack holds three (G&V: one flask per held flask, up to the stack limit). */
const RACK_FLASKS = 3

export function kitSocketsShownOf(
  state: AuthorityState,
  playerId: string,
  sockets: readonly KitSocket[],
  tick: number,
): ShownKitSocket[] {
  return sockets.flatMap((socket) => shownSocketOf(state, playerId, socket, tick))
}

function shownSocketOf(
  state: AuthorityState,
  playerId: string,
  socket: KitSocket,
  tick: number,
): ShownKitSocket[] {
  const show = isFlaskSocket(socket)
    ? flaskShowOf(state, playerId, tick)
    : toolShowOf(state, playerId, socket.itemId)
  return show === null ? [] : [{ socket, show }]
}

/** The rack's socket: the one whose parts show by the held count. */
function isFlaskSocket(socket: KitSocket): boolean {
  return socket.parts.some((part) => part.shownFromHeld !== undefined)
}

function toolShowOf(state: AuthorityState, playerId: string, itemId: string): KitSocketShow | null {
  if (!ownsKitTool(kitHoldingsOf(state, playerId), itemId)) return null
  return { heldFlasks: 0, isActing: isToolActing(vehicleOf(state, playerId), kitToolIdOf(itemId)) }
}

/** The carried flasks and, while one is open, the vented one in the rack beside them. */
function flaskShowOf(state: AuthorityState, playerId: string, tick: number): KitSocketShow | null {
  const { carried, isOpen } = flaskStateOf(state, playerId, tick)
  if (carried === 0n && !isOpen) return null
  const inRack = Number(carried) + (isOpen ? 1 : 0)
  return { heldFlasks: Math.min(inRack, RACK_FLASKS), isActing: isOpen }
}

/**
 * The pacing bot and the Damp Flask (ticket 881; the TD's seam on #850 as amended for the HS's
 * point 3): by default it never uncorks one and reads no hazard here, so the bare bot plays
 * byte-identically. Under `kitPolicy.flask: 'on_firedamp_entry'`, the opt-in of a tools-on run, it
 * uncorks a carried flask on the report that first stands it in a drain pocket (firedamp), as a
 * player who fires the flask on purpose would; staying in the pocket, it uncorks no second one
 * until it has left and come back. The authority decides: the intent is dry-run first.
 */
import { planetParamsOf } from '../authority/planetOfState'
import { hazardKindAtTile } from '../authority/hazards/hazardCells'
import type { AuthorityState } from '../authority/authorityState'
import { contactEffectOf } from '../registries/contactEffects'
import { botFlaskProvider } from '../registries/botFlasks'
import type { TilePoint } from '../world/tileGrid'
import { wouldAccept } from './botDryRun'
import type { BotPilot } from './botPilot'
import type { BotSession } from './botSession'

/** Whether the bot uncorks flasks: never (the default), or on entering a drain pocket. */
export type FlaskPolicy = 'never' | 'on_firedamp_entry'

/** After a report from `tile`: uncorks a flask when that report first stood the rig in firedamp. */
export function uncorkOnFiredampEntry(session: BotSession, pilot: BotPilot, tile: TilePoint): void {
  if (pilot.kitPolicy?.flask !== 'on_firedamp_entry') return
  const isInPocket = isDrainPocketAt(session.state(), tile)
  const isEntry = isInPocket && pilot.isInDrainPocket !== true
  pilot.isInDrainPocket = isInPocket
  if (isEntry) uncorkFlask(session)
}

function uncorkFlask(session: BotSession): void {
  const intent = botFlaskProvider()?.uncorkIntentOf(session.state(), session.playerId) ?? null
  if (intent !== null && wouldAccept(session, intent)) session.submit(intent)
}

/** Whether the rig's cell holds a hazard whose contact drains the tank. */
function isDrainPocketAt(state: AuthorityState, tile: TilePoint): boolean {
  const params = planetParamsOf(state.planet)
  const kind = params === null ? null : hazardKindAtTile(state, params, tile)
  return kind !== null && contactEffectOf(kind)?.effect === 'drain'
}

/**
 * The Damp Flask's outcome (ticket 882, PK4c T2; the GD's final lock on #850 and Systems' row
 * 6395065669): an open flask clears its hazard's flag (firedamp) from every cell whose centre lies
 * within `clearRadiusTiles` (2) of the rig's cell at the uncork, Euclidean, for the flask's
 * window. Pockets are 3 tiles, so it clears the one it was uncorked in and not its neighbours.
 * It deletes no cell: ore, hardness and the pocket stay, and the hazard is back when the flask
 * closes. The clear is the world's (the kernel's `hazardClears`), so every player's rig meets the
 * cleared cells alike; the flask's own −100% drain on its uncorker stays as T1 left it.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { HazardClear } from '../../../systems/registries/hazardClears'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { isFlaskOpenAt, type KitHoldings } from './kitHoldings'
import { kitHoldingsOf } from './kitHoldingsSection'
import { PLANET_KIT_ECONOMY, PLANET_KITS } from './planetKitRows'
import { kitItemOf } from './planetKitSales'
import type { KitItem } from './planetKitTypes'

const FLASK_ACTING = PLANET_KIT_ECONOMY.acting.flask
const FLASK = kitItemOf(PLANET_KITS, FLASK_ACTING.itemId) as KitItem
const RADIUS_SQ = FLASK_ACTING.clearRadiusTiles * FLASK_ACTING.clearRadiusTiles

export const FLASK_CLEAR: HazardClear = {
  id: `planet-kit.${FLASK.id}_clear`,
  kind: FLASK.effect.hazard as string,
  isClearedAt: isClearedByAnOpenFlask,
}

/** Whether any player's open flask clears `tile` at the state's tick. */
function isClearedByAnOpenFlask(state: AuthorityState, tile: TilePoint): boolean {
  return Object.keys(state.players).some((playerId) =>
    isWithinOpenFlask(kitHoldingsOf(state, playerId), state.tick, tile),
  )
}

/** The open flask's centre and radius as of `tick`; null while none is open or it had no cell. */
export function openFlaskZoneOf(
  holdings: KitHoldings,
  tick: number,
): { at: TilePoint; radiusTiles: number } | null {
  if (holdings.flaskAt === undefined || !isFlaskOpenAt(holdings, tick)) return null
  return { at: holdings.flaskAt, radiusTiles: FLASK_ACTING.clearRadiusTiles }
}

function isWithinOpenFlask(holdings: KitHoldings, tick: number, tile: TilePoint): boolean {
  const zone = openFlaskZoneOf(holdings, tick)
  if (zone === null) return false
  const dx = tile.tx - zone.at.tx
  const dy = tile.ty - zone.at.ty
  return dx * dx + dy * dy <= RADIUS_SQ
}

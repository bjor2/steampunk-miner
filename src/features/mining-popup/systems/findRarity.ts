/**
 * The rarity a unit into the hold shows on its chip and the plaque (ticket 454 under #139): its
 * cell's tier offset over the cell's band, named only once the player has seen a species of the
 * planet at that rarity (the codex records the drill-touched cell's species in the same step,
 * ticket 546). A unit with no cell to read stays unspecified: a blast's or a bore's units follow
 * all of their tiles, so only the drill's `TileDestroyed` just before a `CargoAdded` pairs, as the
 * codex pairs it. Look only: the price and the sale never read it.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { oreTier } from '../../../systems/economy/oreEconomy'
import { seenRarityOfFind, type SeenRarity } from '../../../systems/render/seenRarity'
import { bandOfTile } from '../../../systems/world/planetGeometry'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { drilledCellBefore, type TileDestroyed } from './drilledCell'
import { oreTypeNamed } from './oreFace'

const BAND_ONE = 1

/** The rarity of the unit `heard[at]` (a `CargoAdded`) brought in; null while unspecified. */
export function findRarityOf(
  heard: readonly DomainEvent[],
  at: number,
  state: AuthorityState,
  playerId: string,
): SeenRarity | null {
  const added = heard[at]
  const cell = drilledCellBefore(heard[at - 1])
  const params = planetParamsOf(state.planet)
  if (added.type !== 'CargoAdded' || cell === null || params === null) return null
  const lead = leadOfFind(params, added.oreId, cell)
  return lead === null ? null : seenRarityOfFind(state, playerId, params, lead)
}

/** Tiers above the band's own ore, as the roster binds a kind (`liveRosterIndicesOf`). */
function leadOfFind(params: PlanetParams, oreId: string, cell: TileDestroyed): number | null {
  const ore = oreTypeNamed(oreId)
  if (ore === null) return null
  const band = bandOfTile(params, cell.tx, cell.ty)
  return ore.tier - oreTier(params.planetIndex, BAND_ONE) - (band - 1)
}

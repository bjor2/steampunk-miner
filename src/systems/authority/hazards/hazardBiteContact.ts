/**
 * A `bite` contact (ticket 848; spinecrystal, ticket 651): the cluster shatters against the bit and
 * scores the hull for the row's share of the on-curve hull, scaled by the contact's factor, once a
 * cell (`hazardHits.ts`). `HazardBit` logs it as `hazard_bite`.
 */
import { scaledByFactor } from '../../registries/contactEffects'
import type { PlanetParams } from '../../world/planetParams'
import type { AuthorityState } from '../authorityState'
import { chainEffects, type RuleEffect } from '../commandRule'
import type { CellContact } from './cellContact'
import { takeHazardHit, wreckIfHullGone } from './hazardHits'

export function biteOnContact(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  { tile, row, factorBp }: CellContact<'bite'>,
): RuleEffect {
  const ask = {
    shareBp: scaledByFactor(row.hullShareBp, factorBp),
    diveHullCapBp: row.diveHullCapBp,
  }
  const bitten = takeHazardHit(state, playerId, params, tile, ask)
  const bite = { type: 'HazardBit' as const, kind: row.kind, ...tile, ...bitten.hit }
  return chainEffects(bitten.state, [
    (current) => ({ state: current, events: [bite] }),
    (current) => wreckIfHullGone(current, playerId, row.kind),
  ])
}

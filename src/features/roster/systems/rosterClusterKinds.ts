/**
 * The roster's guaranteed cluster kinds (ticket 737; HS 2 and VS 1 on #737: at least one cluster of
 * each rare kind per seed and planet). Every rare, epic and mythic kind on the planet's roster, as
 * the cell it paints (its family's cell code, its rarity's lead, its slot) and the bands where both
 * the kind and its tier are live. The kernel keeps the bands from 3 (`d >= 0.35`) and places one
 * cluster of each, in roster order. Horizontal: it names kinds, never a price or a weight.
 */
import type { ClusterKind } from '../../../systems/registries/generationHooks'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import { RARE_CLUSTER_FIRST_LEAD } from '../../../systems/world/planetTable'
import type { ResourceFamily } from '../../../systems/world/worldCell'
import {
  isSlotLiveInBand,
  isTierLiveIn,
  oreFamilies,
  rarityTiers,
  type KindSlot,
  type RarityTier,
} from '../../ores'
import { planetRosterOf } from './planetRoster'

const BANDS = Array.from({ length: BAND_COUNT }, (_, at) => at + 1)

/** The planet's rare kinds, roster order; none on a planet without a roster. */
export function rareClusterKindsOf(params: PlanetParams): ClusterKind[] {
  return planetRosterOf(params).flatMap((slot, index) => clusterKindsOfSlot(params, slot, index))
}

function clusterKindsOfSlot(params: PlanetParams, slot: KindSlot, index: number): ClusterKind[] {
  const tier = rarityTiers().find((candidate) => candidate.id === slot.rarity)
  if (tier === undefined || tier.tierOffset < RARE_CLUSTER_FIRST_LEAD) return []
  return [
    {
      family: cellCodeOf(slot.family),
      lead: tier.tierOffset,
      kindSlot: index + 1,
      bands: liveBandsOf(params, slot, tier),
    },
  ]
}

function liveBandsOf(params: PlanetParams, slot: KindSlot, tier: RarityTier): number[] {
  return BANDS.filter(
    (band) =>
      isSlotLiveInBand(slot, band, params.oreRulesVersion) &&
      isTierLiveIn(tier, params.planetIndex, band),
  )
}

/** The family's value in the cell's 4-bit family field (the `ores` catalogue's order). */
function cellCodeOf(family: string): ResourceFamily {
  const row = oreFamilies().find((candidate) => candidate.id === family)
  if (row === undefined) throw new RangeError(`no ore family "${family}" in the catalogue`)
  return row.cellCode as ResourceFamily
}

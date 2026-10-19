/**
 * How a track's stat grows, as an item card's stat line names it (Vertical Scaler on #164, K7
 * #199): read from the track's curve family in `economy.json`, so a describer never re-derives it.
 * Every track grows geometrically on a card since ticket 553: the per-purchase growth of drill
 * power (#552), the boiler, the hold and the engine (Systems' rows on #553) included; the
 * plain-integer `linear` family that read `linearInt` is gone.
 */
import type { UpgradeEffect, UpgradeId } from './economyDefinition'
import { upgradeEffectFamilyOf } from './upgradeSteps'

export type TrackKind = 'geometric' | 'linearInt' | 'saturating'

const TRACK_KIND_OF_FAMILY: Readonly<Record<UpgradeEffect['family'], TrackKind>> = {
  geometric: 'geometric',
  perPurchase: 'geometric',
  wholePerPurchase: 'geometric',
  enginePerPurchase: 'geometric',
}

export function trackKindOf(upgradeId: UpgradeId): TrackKind {
  return TRACK_KIND_OF_FAMILY[upgradeEffectFamilyOf(upgradeId)]
}

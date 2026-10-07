/**
 * How a track's stat grows, as an item card's stat line names it (Vertical Scaler on #164, K7
 * #199): read from the track's curve family in `economy.json`, so a describer never re-derives it.
 * The plain-integer `linear` family is `linearInt` on a card.
 */
import { ECONOMY } from './economy'
import type { UpgradeEffect, UpgradeId } from './economyDefinition'

export type TrackKind = 'geometric' | 'linearInt' | 'saturating'

const TRACK_KIND_OF_FAMILY: Readonly<Record<UpgradeEffect['family'], TrackKind>> = {
  geometric: 'geometric',
  linear: 'linearInt',
  saturating: 'saturating',
}

export function trackKindOf(upgradeId: UpgradeId): TrackKind {
  return TRACK_KIND_OF_FAMILY[effectFamilyOf(upgradeId)]
}

function effectFamilyOf(upgradeId: UpgradeId): UpgradeEffect['family'] {
  const upgrade = ECONOMY.upgrades.find((candidate) => candidate.id === upgradeId)
  if (upgrade === undefined) throw new RangeError(`no upgrade ${upgradeId} in the definitions`)
  return upgrade.effect.family
}

/**
 * The bore gun at the Upgrade bay (ticket 314 through the kernel's bay entries, ticket 344, the
 * TD lock on #314 section 1 as the GD ruled it): one source anchored on the `bore_gun` row. It
 * lists the mount until the gun is on the miner, then the three brass tracks. A track at its wall
 * stays listed with no buy and reads Mastered; the walls are the tracks' own last levels, never a
 * planet cap. Each buy is the kernel's `commandButton` over the slice's own command, so the price
 * shown is `cardPriceOf`, the very debit, and a refusal is the authority's.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { Money } from '../../../systems/money'
import type { BayEntry, BayEntrySource } from '../../../systems/registries/bayEntries'
import type { ItemRef } from '../../../systems/registries/itemDescriber'
import { itemCardOf, SHOP_SOURCE, type ItemCardModel } from '../../../systems/views/itemCardModel'
import { UI_ID_TEMPLATES } from '../../../systems/views/screenIds'
import { priceReading, commandButton, type ScreenButton } from '../../../systems/views/viewParts'
import { cardPriceOf } from './boreGunCards'
import {
  BORE_GUN_KIND,
  BORE_GUN_SCHEDULE_ROW,
  MOUNT_PART_ID,
  trackPartIdOf,
} from './boreGunContent'
import { GROUND_GUN, GUN_TRACK_IDS, type GunTrackId } from './groundGunEconomy'
import { gunLevelsOf, isGunMounted, type GunLevels } from './gunLevels'
import { BUY_LEVEL_COMMAND, mountPrice, MOUNT_COMMAND, nextLevelPrice } from './gunPurchase'
import { OPEN_GROUND_SHOT, rateCardOf } from './gunRecovery'
import { energyStatsAt, isTrackMaxed, penetrationStatsAt, trackLevelPrice } from './gunTracks'

const MOUNT_ICON_ID = 'bore-gun-mount'
const MOUNT_LABEL = 'Bore gun'

/** One `bore-gun` part as its entry and card name it. */
interface EntryPart {
  partId: string
  iconId: string
  label: string
}

const TRACK_LABELS: Readonly<Record<GunTrackId, string>> = {
  rate: 'Bore rate',
  penetration: 'Bore penetration',
  energy: 'Bore energy',
}

/** Each track's effect at a level, in the words its card uses. */
const TRACK_EFFECTS: Readonly<Record<GunTrackId, (level: number) => string>> = {
  rate: (level) => `${rateCardOf(level, OPEN_GROUND_SHOT).shotsPerMinute}`,
  penetration: (level) => `${penetrationStatsAt(level).gunFactorPct}%`,
  energy: (level) => `${energyStatsAt(level).energyPerCellPct}%`,
}

const TRACK_EFFECT_UNITS: Readonly<Record<GunTrackId, string>> = {
  rate: 'shots/min',
  penetration: 'of the drill',
  energy: 'of drilling',
}

export const GUN_BAY_ENTRIES: BayEntrySource = {
  id: 'ground-gun.bore-gun-entries',
  bay: 'upgrade',
  anchorFeatureId: BORE_GUN_SCHEDULE_ROW,
  entriesOf: gunBayEntriesOf,
}

/** The mount before the gun is on, then one entry per track. */
export function gunBayEntriesOf(state: AuthorityState, playerId: string): BayEntry[] {
  const levels = gunLevelsOf(state, playerId)
  if (!isGunMounted(levels)) return [mountEntryOf(state, playerId)]
  return GUN_TRACK_IDS.map((trackId) => trackEntryOf(state, playerId, levels, trackId))
}

function mountEntryOf(state: AuthorityState, playerId: string): BayEntry {
  const part: EntryPart = { partId: MOUNT_PART_ID, iconId: MOUNT_ICON_ID, label: MOUNT_LABEL }
  const intent: CommandIntent = { type: MOUNT_COMMAND, payload: {} }
  const buy = buyButtonOf(state, playerId, part.partId, 'Mount', intent)
  return {
    entryId: part.partId,
    iconId: part.iconId,
    label: part.label,
    levelText: 'Mount',
    cost: priceReading(mountPrice()),
    effectText: `${GROUND_GUN.bore.boreRangeBase} cells reach`,
    buy,
    card: cardOf(state, playerId, part, 0, buy),
  }
}

function trackEntryOf(
  state: AuthorityState,
  playerId: string,
  levels: GunLevels,
  trackId: GunTrackId,
): BayEntry {
  const part = trackPartOf(trackId)
  const level = levels[trackId]
  const isMastered = isTrackMaxed(trackId, level)
  const intent: CommandIntent = { type: BUY_LEVEL_COMMAND, payload: { track: trackId } }
  const buy = buyButtonOf(state, playerId, part.partId, 'Buy', intent)
  return {
    entryId: part.partId,
    iconId: part.iconId,
    label: part.label,
    levelText: trackLevelTextOf(level, isMastered),
    cost: priceReading(shownTrackPriceOf(levels, trackId)),
    effectText: trackEffectTextOf(trackId, level, isMastered),
    buy: isMastered ? null : buy,
    card: cardOf(state, playerId, part, level, buy),
  }
}

function buyButtonOf(
  state: AuthorityState,
  playerId: string,
  partId: string,
  label: string,
  intent: CommandIntent,
): ScreenButton {
  return commandButton(state, playerId, UI_ID_TEMPLATES.upgradebayEntryBuy(partId), label, intent)
}

function trackPartOf(trackId: GunTrackId): EntryPart {
  return {
    partId: trackPartIdOf(trackId),
    iconId: `bore-gun-${trackId}`,
    label: TRACK_LABELS[trackId],
  }
}

/** The next level's price, the debit; at the wall the last level's, beside the Mastered line. */
function shownTrackPriceOf(levels: GunLevels, trackId: GunTrackId): Money {
  return nextLevelPrice(levels, trackId) ?? trackLevelPrice(trackId, levels[trackId])
}

/** The #159 card, whose price is `cardPriceOf`: none once nothing is for sale. */
function cardOf(
  state: AuthorityState,
  playerId: string,
  part: EntryPart,
  level: number,
  buy: ScreenButton,
): ItemCardModel {
  const item: ItemRef = { kind: BORE_GUN_KIND, id: part.partId }
  const price = cardPriceOf(gunLevelsOf(state, playerId), part.partId)
  return itemCardOf(state, playerId, {
    item,
    iconId: part.iconId,
    name: part.label,
    cost: price === null ? null : priceReading(price),
    level,
    buy,
    source: SHOP_SOURCE,
  })
}

/** `3 → 4` while for sale, `12 (top)` at the wall, as the kernel's level rows read. */
function trackLevelTextOf(level: number, isMastered: boolean): string {
  return isMastered ? `${level} (top)` : `${level} → ${level + 1}`
}

function trackEffectTextOf(trackId: GunTrackId, level: number, isMastered: boolean): string {
  const effectAt = TRACK_EFFECTS[trackId]
  const unit = TRACK_EFFECT_UNITS[trackId]
  if (isMastered) return `${effectAt(level)} ${unit}`
  return `${effectAt(level)} → ${effectAt(level + 1)} ${unit}`
}

/**
 * The bore gun's cards (#159 through the K7 `itemDescriptionEntries` seam, ticket 314): one entry
 * per `bore-gun` part, each with its flavour line and stat lines read from the slice's own rules,
 * so a card can never drift from the gun the authority fires.
 *
 * - The mount: the reach and the shots a minute it starts at, and its price.
 * - Rate: real shots a minute in the planet's median rock and in open ground, from the shared
 *   recovery wait (`gunRecoveryTicks` through `rateCardOf`, #313 and #322 section 4), so a level
 *   that cuts the wait shows it.
 * - Penetration and energy: their stat as a share of the drill's.
 *
 * A track line reads the level the card names, or level 1 before the mount; its next value is one
 * level on, none at the wall. The cost is not a stat line: #159 draws it as the card's own line,
 * from `cardPriceOf`, the very price the buy commands debit.
 */
import { blockHardness } from '../../../systems/economy/oreEconomy'
import { vehicleStatsAt } from '../../../systems/economy/vehicleStats'
import type { Money } from '../../../systems/money'
import { contentOf } from '../../../systems/registries/content'
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { BORE_GUN_KIND, MOUNT_PART_ID, trackPartIdOf } from './boreGunContent'
import { GROUND_GUN, type GunTrackId } from './groundGunEconomy'
import { GROUND_GUN_SECTION, isGunMounted, MOUNTED_LEVEL, type GunLevels } from './gunLevels'
import { mountPrice, nextLevelPrice } from './gunPurchase'
import {
  boreShotOnGround,
  gunTicksPerCell,
  OPEN_GROUND_SHOT,
  rateCardOf,
  type BoreShot,
} from './gunRecovery'
import { energyStatsAt, isTrackMaxed, penetrationStatsAt } from './gunTracks'

/** The planet's median ground (#322's rate test): band 3. */
const MEDIAN_BAND = 3

const MOUNT_FLAVOUR = 'A brass bore gun punches a line of rock open.'

const TRACK_FLAVOURS: Readonly<Record<GunTrackId, string>> = {
  rate: 'A quicker breech and hotter boiler let the bore gun fire sooner.',
  penetration: "A tempered bore head lends each shot more of the drill's bite.",
  energy: 'Tighter seals and a leaner valve spend less steam per cell opened.',
}

export function boreGunCards(): ItemDescriptionEntry[] {
  return [mountCard(), rateCard(), penetrationCard(), energyCard()]
}

function mountCard(): ItemDescriptionEntry {
  return partCard(MOUNT_PART_ID, MOUNT_FLAVOUR, [
    fixedLine('Bore reach (cells)', () => GROUND_GUN.bore.boreRangeBase),
    fixedLine('Shots a minute in rock', (ctx) => rockCardAt(MOUNTED_LEVEL, ctx).shotsPerMinute),
  ])
}

function rateCard(): ItemDescriptionEntry {
  return trackCard('rate', [
    trackLine(
      'rate',
      'Shots a minute in rock',
      (level, ctx) => rockCardAt(level, ctx).shotsPerMinute,
    ),
    trackLine(
      'rate',
      'Shots a minute in open ground',
      (level) => rateCardOf(level, OPEN_GROUND_SHOT).shotsPerMinute,
    ),
  ])
}

function penetrationCard(): ItemDescriptionEntry {
  return trackCard('penetration', [
    trackLine(
      'penetration',
      'Bore power (% of the drill)',
      (level) => penetrationStatsAt(level).gunFactorPct,
    ),
  ])
}

function energyCard(): ItemDescriptionEntry {
  return trackCard('energy', [
    trackLine(
      'energy',
      'Energy a cell (% of drilling)',
      (level) => energyStatsAt(level).energyPerCellPct,
    ),
  ])
}

function trackCard(trackId: GunTrackId, lines: DescribedStatLineSpec[]): ItemDescriptionEntry {
  return partCard(trackPartIdOf(trackId), TRACK_FLAVOURS[trackId], lines)
}

function partCard(
  partId: string,
  flavour: string,
  statLines: DescribedStatLineSpec[],
): ItemDescriptionEntry {
  const ref: ItemRef = { kind: BORE_GUN_KIND, id: partId }
  return {
    id: partId,
    matches: { kind: BORE_GUN_KIND, id: partId },
    flavour,
    statLines,
    // The `bore_gun` row opens on planet 1, so every planet offers the part.
    refs: () => [ref],
  }
}

/** A track line at the level the card names, one level on next, none at the wall. */
function trackLine(
  trackId: GunTrackId,
  label: string,
  statAt: (level: number, ctx: ItemCtx) => number,
): DescribedStatLineSpec {
  return {
    label,
    kind: 'linearInt',
    value: (_ref, ctx) => statAt(shownLevelOf(ctx.level), ctx),
    nextLevel: (_ref, ctx) => nextLevelOf(trackId, shownLevelOf(ctx.level)),
  }
}

/** What the part costs these levels now, the buy's own debit; null when it is not for sale. */
export function cardPriceOf(levels: GunLevels, partId: string): Money | null {
  if (partId === MOUNT_PART_ID) return isGunMounted(levels) ? null : mountPrice()
  const part = contentOf(BORE_GUN_KIND).find((candidate) => candidate.id === partId)
  if (part?.track == null || !isGunMounted(levels)) return null
  return nextLevelPrice(levels, part.track)
}

function fixedLine(label: string, valueOf: (ctx: ItemCtx) => number): DescribedStatLineSpec {
  return {
    label,
    kind: 'linearInt',
    value: (_ref, ctx) => valueOf(ctx),
    nextLevel: hasNoNextLevel,
  }
}

/** The level a track card reads: level 1 before the mount, as the mount buys it. */
export function shownLevelOf(level: number): number {
  return Math.max(MOUNTED_LEVEL, level)
}

function nextLevelOf(trackId: GunTrackId, level: number): number | null {
  return isTrackMaxed(trackId, level) ? null : level + 1
}

/** The rate card at `rateLevel` on this planet's median rock, with the player's drill and bore. */
function rockCardAt(rateLevel: number, ctx: ItemCtx) {
  return rateCardOf(rateLevel, medianRockShotOf(ctx))
}

function medianRockShotOf(ctx: ItemCtx): BoreShot {
  const penetration = shownLevelOf(ctx.view.section(GROUND_GUN_SECTION).penetration)
  const ticks = gunTicksPerCell(
    vehicleStatsAt(ctx.view.levels),
    penetrationStatsAt(penetration).gunFactorPct,
    blockHardness(ctx.planetIndex, MEDIAN_BAND),
  )
  return boreShotOnGround(GROUND_GUN.bore.boreRangeBase, ticks)
}

/**
 * The Outfitter's cards (spec #678, ticket 687; design-system.md sections 10 and 11): the Upgrade
 * bay's sheet, one card per thing the bay sells, in the bay's reading order: the six tracks, the
 * Casing, the lining, the guns, the charges and rack, the researched vehicle items, the slices'
 * bay entries, then Repair. A card is a title, one line of gain text ("+24% drill speed") and the
 * price as its figure, greyed while the wallet is short; never a stat table. Pressing a card
 * presses the bay's own button, so the authority, the ids and the refusals stay the bay model's.
 * The slice that draws the bay may add a note to a track's line (the rig look's owned step,
 * ticket 585), after the gain.
 */
import type { UpgradeId } from '../economy/economyDefinition'
import { fromCanonical } from '../money'
import type { ChargeRow, ChargeRows } from './chargeRows'
import { gainTextOf } from './gainText'
import { isNewCapabilityBuy, NONE_OWNED } from './newCapability'
import type { GunRow } from './gunRow'
import type { LiningRow } from './liningRow'
import type { BayEntryRow } from './bayEntryRows'
import type { CasingRow, RepairReading, UpgradeBayModel } from './upgradeBayModel'
import type { VehicleItemRow } from './vehicleItemRows'
import type { AmountReading, ScreenButton } from './viewParts'
import type { WorkshopRow } from './workshopRows'

export interface OutfitterCard {
  /** The card's text id, under the Upgrade bay's `upgrade-bay.` budget prefix. */
  id: string
  title: string
  /** The gain text, or what the buy does where no stat number moves. */
  line: string
  iconId: string
  /** The price, rounded up; null with nothing left to buy. */
  priceText: string | null
  /** The wallet is short of the price: the figure greys (#686 `isMuted`). */
  isMuted: boolean
  /** The bay button the card presses; null where nothing can be bought (a Mastered entry). */
  buttonId: string | null
  /**
   * The buy gives the rig a capability it lacks (`newCapability.ts`, the flag the unlock reveal
   * shares): a vehicle item, the turret's mount, the bore gun's mount; never a stat step. A
   * card that offers what the rig does not hold (an item, an entry, a lining type, a refill or a
   * service) asks with none owned; a levelled one with its level.
   */
  isNewCapability: boolean
}

/** The stat a track's card names, and the word it names it by (the ticket's "drill speed"). */
const TRACK_GAIN: Readonly<Record<UpgradeId, { stat: string; word: string }>> = {
  drill_power: { stat: 'drillPower', word: 'drill speed' },
  drill_tip: { stat: 'drillTip', word: 'tip hardness' },
  engine: { stat: 'speedMax', word: 'top speed' },
  boiler: { stat: 'energyMax', word: 'fuel' },
  cargo_hold: { stat: 'cargoCapacity', word: 'cargo room' },
  hull: { stat: 'hullMax', word: 'hull' },
}

const CASING_LINE = '+1 casing grade'

const MASTERED_LINE = 'Mastered'

const CARD_ID_PREFIX = 'upgrade-bay.card.'

const NOTE_JOIN = ' · '

/** A note after a track's gain text, or null for none. */
export type TrackNote = (row: WorkshopRow) => string | null

const NO_TRACK_NOTE: TrackNote = () => null

export function outfitterCardsOf(
  model: UpgradeBayModel,
  trackNoteOf: TrackNote = NO_TRACK_NOTE,
): OutfitterCard[] {
  return [
    ...model.tracks.map((row) => trackCardOf(row, trackNoteOf(row))),
    casingCardOf(model.casing),
    ...optionalCards(model.lining, liningCardOf),
    ...optionalCards(model.guns, gunCardOf),
    ...chargeCardsOf(model.charges),
    ...model.items.map(itemCardOf),
    ...model.entries.map(entryCardOf),
    repairCardOf(model.repair),
  ]
}

function trackCardOf(row: WorkshopRow, note: string | null): OutfitterCard {
  const gain = trackGainTextOf(row)
  return {
    ...buyCardOf(`track.${row.upgradeId}`, row.label, row.iconId, row.cost, row.buy),
    isNewCapability: isNewCapabilityBuy(row.card.item, row.level),
    line: note === null ? gain : `${gain}${NOTE_JOIN}${note}`,
  }
}

function trackGainTextOf(row: WorkshopRow): string {
  const { stat, word } = TRACK_GAIN[row.upgradeId]
  const before = fromCanonical(row.effectBefore.stats[stat].exact)
  return gainTextOf(before, fromCanonical(row.effectAfter.stats[stat].exact), word)
}

function casingCardOf(row: CasingRow): OutfitterCard {
  return {
    ...buyCardOf('casing', row.label, row.iconId, row.cost, row.buy),
    isNewCapability: isNewCapabilityBuy(row.card.item, row.grade),
    line: CASING_LINE,
  }
}

function liningCardOf(row: LiningRow): OutfitterCard {
  return {
    ...buyCardOf('lining', row.label, row.iconId, row.cost, row.button),
    isNewCapability: isNewCapabilityBuy(row.card.item, NONE_OWNED),
    line: row.effectText,
  }
}

function gunCardOf(row: GunRow): OutfitterCard {
  return {
    ...buyCardOf('guns', row.label, row.iconId, row.cost, row.buy),
    isNewCapability: isNewCapabilityBuy(row.card.item, row.level),
    line: row.effectText,
  }
}

function chargeCardsOf(rows: ChargeRows | null): OutfitterCard[] {
  return rows === null ? [] : [...rows.restock, rows.rack].map(chargeCardOf)
}

function chargeCardOf(row: ChargeRow): OutfitterCard {
  return {
    ...buyCardOf(`charges.${row.key}`, row.label, row.iconId, row.cost, row.buy),
    isNewCapability: isNewCapabilityBuy(row.card.item, NONE_OWNED),
    line: row.effectText,
  }
}

function itemCardOf(row: VehicleItemRow): OutfitterCard {
  return {
    ...buyCardOf(`item.${row.itemId}`, row.label, row.iconId, row.cost, row.buy),
    isNewCapability: isNewCapabilityBuy(row.card.item, NONE_OWNED),
    line: row.card.description?.flavour ?? '',
  }
}

/** A Mastered entry has no buy left: it says so, with no price. */
function entryCardOf(row: BayEntryRow): OutfitterCard {
  const card = buyCardOf(`entry.${row.entryId}`, row.label, row.iconId, row.cost, row.buy)
  const isNewCapability = isNewCapabilityBuy(row.card.item, NONE_OWNED)
  return {
    ...card,
    isNewCapability,
    line: row.isMastered ? MASTERED_LINE : (row.effectText ?? row.levelText ?? ''),
  }
}

function repairCardOf(repair: RepairReading): OutfitterCard {
  const card = buyCardOf(
    'repair',
    repair.button.label,
    repair.card.iconId,
    repair.cost,
    repair.button,
  )
  const isNewCapability = isNewCapabilityBuy(repair.card.item, NONE_OWNED)
  return { ...card, isNewCapability, line: `Hull ${repair.hullText}` }
}

/** The card's id, title, icon and price; greyed while the bay refuses the buy for money. */
function buyCardOf(
  key: string,
  title: string,
  iconId: string,
  cost: AmountReading | null,
  buy: ScreenButton | null,
): Omit<OutfitterCard, 'line' | 'isNewCapability'> {
  return {
    id: `${CARD_ID_PREFIX}${key}`,
    title,
    iconId,
    priceText: buy === null ? null : (cost?.text ?? null),
    isMuted: buy?.reason === 'money_short',
    buttonId: buy?.id ?? null,
  }
}

function optionalCards<Row>(row: Row | null, cardOf: (row: Row) => OutfitterCard): OutfitterCard[] {
  return row === null ? [] : [cardOf(row)]
}

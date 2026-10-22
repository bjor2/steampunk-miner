/**
 * The unlock reveal's data (ticket 718), read from `reveal.json`: how long it plays, how the bought
 * part glows, which buys reveal what, each listed capability's name, icon and model, and every word
 * the plate shows. No number or word of the reveal is typed in code.
 */
import type { ItemKind, ItemRef } from '../../../systems/registries/itemDescriber'
import REVEAL_FILE from '../reveal.json'

/** A buy that can reveal: the event's type and the item it bought. */
export interface RevealEventRow {
  type: string
  kind: ItemKind
  /** The item id, fixed; or read from the event's `idField`. */
  id?: string
  idField?: string
}

/** A capability that is no vehicle item, and what its reveal shows. */
export interface RevealItemRow extends ItemRef {
  name: string
  iconId: string
  /** The model whose parts glow on the car. */
  assetId: string
}

export interface RevealGlow {
  /** `#rrggbb`. */
  colour: string
  low: number
  high: number
  pulseTicks: number
}

export interface RevealData {
  revealTicks: number
  glow: RevealGlow
  events: readonly RevealEventRow[]
  items: readonly RevealItemRow[]
  copy: { title: string; skip: string }
}

export const REVEAL: RevealData = {
  ...REVEAL_FILE,
  events: REVEAL_FILE.events.map((row) => ({ ...row, kind: row.kind as ItemKind })),
  items: REVEAL_FILE.items.map((row) => ({ ...row, kind: row.kind as ItemKind })),
}

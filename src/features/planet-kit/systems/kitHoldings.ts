/**
 * What a player owns of the planet kits (ticket 850, PK4b; the VS addendum of the GD lock on #823:
 * "items carry to any planet; a consumable's effect stays pinned at the g where it was bought,
 * with a stack limit"). A tool, once bought, is owned for good. A consumable is held as stacks,
 * one per g it was bought at, so a later effect reads the g its unit was bought at; every count is
 * a bigint (decision #5), written as canonical decimal text so the state, the digest and a save
 * stay JSON. A use spends the stack of the lowest g first, the oldest-priced unit.
 *
 * Tools are kept in id order and stacks in item id then g order, so one holding has one shape.
 *
 * An uncorked flask (ticket 881, the TD's seam on #850) keeps its window as `flaskUntilTick`, the
 * tick it closes at: saved state, not a timer, so it outlives a save and a load. Absent until the
 * first uncork. Since ticket 882 it also keeps `flaskAt`, the rig's cell at the uncork, the centre
 * of the firedamp it clears; absent when the rig had no pose there.
 */
import { readIndexText, toIndexText } from '../../../systems/starMap/planetAddress'
import type { TilePoint } from '../../../systems/world/tileGrid'

export interface KitStack {
  itemId: string
  /** The g, `campaignIndex(s, p)` (#781), where these units were bought, as index text. */
  g: string
  /** The units held, from 1, as canonical decimal text. */
  count: string
}

export interface KitHoldings {
  /** The tool item ids owned, in id order. */
  tools: readonly string[]
  stacks: readonly KitStack[]
  /** The tick the last uncorked flask closes at; absent before the first uncork. */
  flaskUntilTick?: number
  /** The rig's cell when the last flask was uncorked; absent with no pose there (ticket 882). */
  flaskAt?: TilePoint
}

/** A flask as it is uncorked: the tick it closes at and the rig's cell, if it had one. */
export interface FlaskOpening {
  untilTick: number
  at: TilePoint | null
}

/** What a use took: the holdings left and the g the spent unit was bought at. */
export interface KitSpend {
  holdings: KitHoldings
  boughtAt: bigint
}

export type KitBuyRefusal = 'kit_tool_owned' | 'stack_full'

export const NO_KIT_HOLDINGS: KitHoldings = Object.freeze({ tools: [], stacks: [] })

export function ownsKitTool(holdings: KitHoldings, itemId: string): boolean {
  return holdings.tools.includes(itemId)
}

/** Every unit of `itemId` held, across the g it was bought at. */
export function heldCountOf(holdings: KitHoldings, itemId: string): bigint {
  return stacksOf(holdings, itemId).reduce((total, stack) => total + BigInt(stack.count), 0n)
}

/** The units of `item` held: 1 or 0 of a tool, every unit of a consumable's stacks. */
export function unitsHeldOf(
  holdings: KitHoldings,
  item: { id: string; stackLimit: number | null },
): bigint {
  if (item.stackLimit === null) return ownsKitTool(holdings, item.id) ? 1n : 0n
  return heldCountOf(holdings, item.id)
}

/** The holdings with `itemId` owned as a tool. */
export function withKitToolOwned(holdings: KitHoldings, itemId: string): KitHoldings {
  if (ownsKitTool(holdings, itemId)) return holdings
  return { ...holdings, tools: [...holdings.tools, itemId].sort(compareText) }
}

/** The holdings with one more unit of `itemId` bought at `g`. */
export function withConsumableBought(
  holdings: KitHoldings,
  itemId: string,
  g: bigint,
): KitHoldings {
  const key = { itemId, g: toIndexText(g) }
  const held = holdings.stacks.find((stack) => isSameStack(stack, key))
  const count = (held === undefined ? 0n : BigInt(held.count)) + 1n
  const others = holdings.stacks.filter((stack) => stack !== held)
  return {
    ...holdings,
    stacks: [...others, { ...key, count: count.toString() }].sort(compareStacks),
  }
}

/** One unit of `itemId` spent from its lowest-g stack; null when none is held. */
export function spendConsumable(holdings: KitHoldings, itemId: string): KitSpend | null {
  const [oldest] = stacksOf(holdings, itemId)
  if (oldest === undefined) return null
  const others = holdings.stacks.filter((stack) => stack !== oldest)
  const left = BigInt(oldest.count) - 1n
  const stacks = left === 0n ? others : [...others, { ...oldest, count: left.toString() }]
  return {
    holdings: { ...holdings, stacks: stacks.sort(compareStacks) },
    boughtAt: BigInt(oldest.g),
  }
}

/**
 * Why one more of the item may not be held: a tool already owned, or a consumable already at its
 * carry limit; null when it may.
 */
export function kitBuyRefusalOf(
  holdings: KitHoldings,
  item: { id: string; stackLimit: number | null },
): KitBuyRefusal | null {
  if (item.stackLimit === null) return ownsKitTool(holdings, item.id) ? 'kit_tool_owned' : null
  return heldCountOf(holdings, item.id) >= BigInt(item.stackLimit) ? 'stack_full' : null
}

/** Whether an uncorked flask is still open at `tick`. */
export function isFlaskOpenAt(holdings: KitHoldings, tick: number): boolean {
  return holdings.flaskUntilTick !== undefined && tick < holdings.flaskUntilTick
}

/** The holdings with a flask open until `untilTick`, centred on its cell when it has one. */
export function withFlaskOpen(holdings: KitHoldings, opening: FlaskOpening): KitHoldings {
  const { flaskAt: _last, ...rest } = holdings
  const at = opening.at === null ? {} : { flaskAt: { tx: opening.at.tx, ty: opening.at.ty } }
  return { ...rest, flaskUntilTick: opening.untilTick, ...at }
}

/** Item id order, then ascending g. */
export function compareStacks(a: KitStack, b: KitStack): number {
  return compareText(a.itemId, b.itemId) || compareIndexText(a.g, b.g)
}

export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Whether `text` is a count or a g a holding stores: canonical decimal text from 1. */
export function isCountText(text: unknown): text is string {
  return readIndexText(text) !== null
}

function stacksOf(holdings: KitHoldings, itemId: string): KitStack[] {
  return holdings.stacks.filter((stack) => stack.itemId === itemId)
}

function isSameStack(stack: KitStack, key: { itemId: string; g: string }): boolean {
  return stack.itemId === key.itemId && stack.g === key.g
}

/** Index text has no leading zeros, so a longer one is larger. */
function compareIndexText(a: string, b: string): number {
  return a.length - b.length || compareText(a, b)
}

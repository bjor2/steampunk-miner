/**
 * Each player's power-up state (#200, the `power-up-core` save section v1): what each item has
 * spent since its last refill, when its cooldown ends, the one use winding up or channelling, and
 * which toggles are on.
 *
 * Charges are kept as `spent`, not as charges left: a new item is full without the section having
 * to know every registered item, and the section stays at its initial value (out of the state and
 * the digest) until the first use. `chargesLeftOf` is the read the HUD and logs use.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { isJsonObject, isWholeNumber } from '../../../systems/authority/payloadFields'
import { isLoadoutSlotId, type LoadoutSlotId } from '../../../systems/registries/vehicleLoadout'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'
import { hasCharges, type PowerUp } from './powerUpKind'
import { powerUpAtMarkOf } from './powerUpMarks'

export interface ItemCharges {
  spent: number
  /** The first tick the item may be used again; 0 before its first use. */
  readyAtTick: number
}

/** A use between its press and its act: a wind-up (never cancelled) or a channel. */
export interface PendingUse {
  itemId: string
  slot: LoadoutSlotId
  kind: 'windup' | 'channel'
  actTick: number
  originTx: number
  originTy: number
}

export interface PowerUpState {
  items: Readonly<Record<string, ItemCharges>>
  pending: PendingUse | null
  /** Toggle passives switched on, sorted. */
  toggledOn: readonly string[]
}

export const NO_POWER_UPS: PowerUpState = { items: {}, pending: null, toggledOn: [] }

const FRESH_ITEM: ItemCharges = { spent: 0, readyAtTick: 0 }

export const POWER_UP_SECTION: SaveSection<PowerUpState> = {
  id: 'power-up-core',
  version: 1,
  scope: 'player',
  initial: NO_POWER_UPS,
  problems: powerUpStateProblems,
  toPortable: (value) => value,
  ofPortable: (body) => body as PowerUpState,
}

export function powerUpStateOf(state: AuthorityState, playerId: string): PowerUpState {
  return readSection(state, playerId, POWER_UP_SECTION)
}

export function withPowerUpState(
  state: AuthorityState,
  playerId: string,
  value: PowerUpState,
): AuthorityState {
  return withSection(state, playerId, POWER_UP_SECTION, value)
}

export function itemChargesOf(value: PowerUpState, itemId: string): ItemCharges {
  return value.items[itemId] ?? FRESH_ITEM
}

/** An item back at none spent and no cooldown leaves the record, as if never used. */
export function withItemCharges(
  value: PowerUpState,
  itemId: string,
  charges: ItemCharges,
): PowerUpState {
  const { [itemId]: _replaced, ...others } = value.items
  const items = isFresh(charges) ? others : { ...others, [itemId]: charges }
  return { ...value, items: sortedById(items) }
}

function isFresh(charges: ItemCharges): boolean {
  return charges.spent === 0 && charges.readyAtTick === 0
}

/**
 * #162 `chargesLeft(playerId, itemId)`, out of the charges or stack at the player's Mark (#249): 0
 * for an item with no charges or not a power-up.
 */
export function chargesLeftOf(state: AuthorityState, playerId: string, itemId: string): number {
  const powerUp = powerUpAtMarkOf(state, playerId, itemId)
  if (powerUp === null || !hasCharges(powerUp)) return 0
  return chargesLeftIn(powerUpStateOf(state, playerId), powerUp)
}

export function chargesLeftIn(value: PowerUpState, powerUp: PowerUp): number {
  return Math.max(0, powerUp.charges - itemChargesOf(value, powerUp.itemId).spent)
}

export function isToggledOn(value: PowerUpState, itemId: string): boolean {
  return value.toggledOn.includes(itemId)
}

export function withToggle(value: PowerUpState, itemId: string, isOn: boolean): PowerUpState {
  const others = value.toggledOn.filter((id) => id !== itemId)
  return { ...value, toggledOn: isOn ? [...others, itemId].sort(compareIds) : others }
}

export function withPending(value: PowerUpState, pending: PendingUse | null): PowerUpState {
  return { ...value, pending }
}

function sortedById<T>(record: Readonly<Record<string, T>>): Readonly<Record<string, T>> {
  return Object.fromEntries(
    Object.keys(record)
      .sort(compareIds)
      .map((id) => [id, record[id]]),
  )
}

function compareIds(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1
}

function powerUpStateProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['power-up-core must be an object']
  return [
    ...itemsProblems(body.items),
    ...pendingProblems(body.pending),
    ...(isTextList(body.toggledOn) ? [] : ['power-up-core.toggledOn must be a list of item ids']),
  ]
}

function itemsProblems(items: unknown): string[] {
  if (!isJsonObject(items)) return ['power-up-core.items must be an object']
  return Object.entries(items)
    .filter(([, charges]) => !isItemCharges(charges))
    .map(([itemId]) => `power-up-core.items.${itemId} must be {spent, readyAtTick} whole numbers`)
}

function isItemCharges(value: unknown): boolean {
  return isJsonObject(value) && isWholeNumber(value.spent) && isWholeNumber(value.readyAtTick)
}

function pendingProblems(pending: unknown): string[] {
  if (pending === null || isPendingUse(pending)) return []
  return ['power-up-core.pending must be null or a pending use']
}

function isPendingUse(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    typeof value.itemId === 'string' &&
    isLoadoutSlotId(value.slot) &&
    (value.kind === 'windup' || value.kind === 'channel') &&
    isWholeNumber(value.actTick) &&
    Number.isSafeInteger(value.originTx) &&
    Number.isSafeInteger(value.originTy)
  )
}

function isTextList(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

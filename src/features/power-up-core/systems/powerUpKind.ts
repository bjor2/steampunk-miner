/**
 * The `power-up` content kind (#162 section 2.1, the #200 lock): what an item slice registers for
 * each power-up beside its `vehicle-item` row. The five classes live here; the loadout does not
 * (TD, #162): which slot holds what is the kernel's `vehicle.loadout`.
 *
 * The entry's `id` is the registering slice's (`<slice>.<name>`), and `itemId` is the bare
 * catalogue id it describes (`power.mineral_drain`), shared with the `vehicle-item` row, the store
 * and the tree, so one content registry holds both without two entries claiming one id.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { RuleEffect } from '../../../systems/authority/commandRule'
import { contentOf, type ContentEntry } from '../../../systems/registries/content'
import type { LoadoutSlotId } from '../../../systems/registries/vehicleLoadout'
import type { TilePoint } from '../../../systems/world/tileGrid'

/** #162 section 2.1. */
export const POWER_UP_CLASSES = [
  'passive',
  'charged',
  'channel',
  'consumable',
  'extractor',
] as const

export type PowerUpClass = (typeof POWER_UP_CLASSES)[number]

/** "A wind-up of at most 6 ticks" (#162 section 2.3, G&V feel pass A5). */
export const MAX_WINDUP_TICKS = 6

/** One use as it acts: who, which item from which slot, on which tick, from where. */
export interface PowerUpUse {
  playerId: string
  itemId: string
  slot: LoadoutSlotId
  tick: number
  /** The tile the vehicle stood on when the use was pressed. */
  origin: TilePoint
  /** The Mark researched when it acts (#249); 0 for none, which acts as bought. */
  mark: number
  /**
   * The item's magnitude at that Mark, from its ladder (#162 4.6: the time, range or share the
   * duration step grows); null for an item whose ladder has none.
   */
  magnitude: number | null
}

/** The gated cell that refused a use (#162 `power_up_blocked_by_gate {cellTier, gateKind}`). */
export interface GateBlock {
  cellTier: number
  gateKind: string
  tx: number
  ty: number
}

/**
 * A use either acts, with its effect on the world, or is refused and costs nothing: by a gate on
 * the cell it would change (`blocked`), or because it has nothing to act on, such as a grapple
 * with no hook in range (`refused`, the GD lock on #204 Q5: only an act that would change a cell
 * logs the gate).
 */
export type PowerUpOutcome =
  | { kind: 'acted'; effect: RuleEffect }
  | { kind: 'blocked'; block: GateBlock }
  | { kind: 'refused'; reason: string }

/**
 * A hold the item's slice keeps after the act, such as the rivet patch's 90 ticks standing still
 * (G&V on #204, ticket 253): the slot's ring fills from `startTick` to `finishTick`.
 */
export interface SlotHold {
  startTick: number
  finishTick: number
}

export interface PowerUp extends ContentEntry {
  /** `<slice>.<name>`: the registering slice's id for this entry. */
  id: string
  /** The bare catalogue id (#162), the same as the item's `vehicle-item` row. */
  itemId: string
  name: string
  powerUpClass: PowerUpClass
  /** Charges per dock (charged, channel) or the stack (consumable); 0 for passive and extractor. */
  charges: number
  cooldownTicks: number
  /** Press to act for every class but channel: at most `MAX_WINDUP_TICKS`, never cancelled. */
  windupTicks: number
  /** A channel's hold (#162 section 4.2: the drain's 60); moving cancels it. 0 for the rest. */
  channelTicks: number
  /** A passive that flips on and off from its slot; a passive that is not is on while owned. */
  isToggle: boolean
  /**
   * A toggle's draw while on, in thousandths of `energyMax` a second (#162 section 4.4: the grav
   * anchor's 1.0%/s is 10); 0 for everything else. The tank empties as thrust empties it, and an
   * empty tank switches the toggle off (the GD lock on #204 Q3 a, ticket 233).
   */
  energyDrawPerMillePerSecond: number
  /** Called when the wind-up or channel ends; for a toggle, only when it turns on. */
  activate(state: AuthorityState, use: PowerUpUse): PowerUpOutcome
  /** The player's hold running now, read from the slice's section; absent for an item with none. */
  holdOf?(state: AuthorityState, playerId: string): SlotHold | null
}

declare module '../../../systems/registries/content' {
  interface ContentKinds {
    'power-up': PowerUp
  }
}

/** The power-up registered for the catalogue item, or null for an item that is not one. */
export function powerUpOfItem(itemId: string): PowerUp | null {
  return contentOf('power-up').find((powerUp) => powerUp.itemId === itemId) ?? null
}

/** Charged, channel and consumable items count charges; passives and extractors have none. */
export function hasCharges(powerUp: PowerUp): boolean {
  return CHARGE_CLASSES.includes(powerUp.powerUpClass)
}

/** What a slot press can do: everything but an extractor and a passive that is always on. */
export function isUsableFromSlot(powerUp: PowerUp): boolean {
  if (powerUp.powerUpClass === 'passive') return powerUp.isToggle
  return powerUp.powerUpClass !== 'extractor'
}

/** The ticks from the press to the act: the channel's hold, or the wind-up. */
export function ticksToActOf(powerUp: PowerUp): number {
  return powerUp.powerUpClass === 'channel' ? powerUp.channelTicks : powerUp.windupTicks
}

/** The free dock refill covers charged items only; a consumable stack is bought (#162 4.3). */
export function isRefilledAtDock(powerUp: PowerUp): boolean {
  return REFILLED_CLASSES.includes(powerUp.powerUpClass)
}

/** Why a registered power-up breaks the class rules; empty when it keeps them. */
export function powerUpProblems(powerUp: PowerUp): string[] {
  return [
    ...(powerUp.windupTicks <= MAX_WINDUP_TICKS
      ? []
      : [`${powerUp.id} winds up ${powerUp.windupTicks} ticks, over ${MAX_WINDUP_TICKS}`]),
    ...(hasCharges(powerUp) === powerUp.charges > 0
      ? []
      : [`${powerUp.id} is ${powerUp.powerUpClass} with ${powerUp.charges} charges`]),
    ...(powerUp.powerUpClass === 'channel' || powerUp.channelTicks === 0
      ? []
      : [`${powerUp.id} is not a channel but holds ${powerUp.channelTicks} ticks`]),
    ...energyDrawProblems(powerUp),
  ]
}

function energyDrawProblems({ id, isToggle, energyDrawPerMillePerSecond: draw }: PowerUp) {
  if (!Number.isSafeInteger(draw) || draw < 0) {
    return [`${id} draws ${draw} per mille a second, not a whole number from 0`]
  }
  return isToggle || draw === 0 ? [] : [`${id} is no toggle but draws ${draw} per mille a second`]
}

const CHARGE_CLASSES: readonly PowerUpClass[] = ['charged', 'channel', 'consumable']

const REFILLED_CLASSES: readonly PowerUpClass[] = ['charged', 'channel']

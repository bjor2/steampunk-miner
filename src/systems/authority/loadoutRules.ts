/**
 * The loadout commands (#162 TD lock and its socket amendments, built by K4):
 *
 * - `equipItem {slot, itemId | null}`: docked at the platform only. Puts an owned item in a slot
 *   that accepts it, or empties the slot. A refusal changes nothing and is answered as
 *   `EquipRefused {slot, itemId, reason}`, the first of: `not_docked`, `wrong_slot` (no such slot,
 *   which every `rig.*` slot now is, or a slot the item does not go in), `slot_locked` (a power-up
 *   slot whose cradle is not owned), `not_owned`, `exclusive_taken` (`drill.head` or
 *   `drill.collar` holds another item). A non-exclusive slot swaps its item; an item already in
 *   another slot moves, since it is one part.
 * - `debug.setVehicleLoadout {slots, owned}`: a scenario's loadout, replacing the vehicle's: the
 *   named items in their slots, and exactly those and `owned` owned.
 *
 * `ownsItem` is the kernel's ownership query (#155 TD call 4), read by `not_owned` here and by
 * the extractor slices, whose items work whenever they are owned.
 */
import {
  acceptedSlotsOf,
  isLoadoutSlotId,
  isVehicleItemId,
  LOADOUT_SLOT_IDS,
  type EquipRefusal,
  type LoadoutSlotId,
} from '../registries/vehicleLoadout'
import {
  EMPTY_LOADOUT,
  isExclusiveSlotTaken,
  isSlotOpen,
  isItemOwned,
  slotHoldingItem,
  withItemsOwned,
  withSlotItem,
  type LoadoutSlots,
  type VehicleLoadout,
} from '../vehicle/loadoutState'
import type { VehicleState } from '../vehicle/vehicleState'
import type { CommandPayloads } from './authorityCommand'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { unchanged, type CommandRule, type Rejection, type RuleEffect } from './commandRule'
import type { DomainEventBody } from './domainEvent'

export interface EquipRequest {
  slot: string
  itemId: string | null
}

interface SlotChange {
  slot: LoadoutSlotId
  itemId: string | null
}

export const LOADOUT_RULES: { readonly equipItem: CommandRule<'equipItem'> } = {
  equipItem: {
    fields: { slot: 'text', itemId: 'textOrNull' },
    apply: (state, { playerId, payload }) => answerEquip(state, playerId, payload),
  },
}

export const LOADOUT_DEBUG_RULES: {
  readonly 'debug.setVehicleLoadout': CommandRule<'debug.setVehicleLoadout'>
} = {
  'debug.setVehicleLoadout': {
    fields: { slots: 'textMap', owned: 'textList' },
    reject: (_state, { payload }) => invalidLoadoutRejection(payload),
    apply: (state, { playerId, payload }) =>
      unchanged(withLoadout(state, playerId, scenarioLoadoutOf(payload))),
  },
}

/** The kernel's ownership query (#155): does this player own the vehicle item? */
export function ownsItem(state: AuthorityState, playerId: string, itemId: string): boolean {
  return isItemOwned(vehicleOf(state, playerId).loadout, itemId)
}

/** Why `equipItem` would be refused now, in the order above; null when it would apply. */
export function equipRefusalOf(
  state: AuthorityState,
  playerId: string,
  request: EquipRequest,
): EquipRefusal | null {
  const vehicle = vehicleOf(state, playerId)
  for (const check of EQUIP_CHECKS) {
    const refusal = check(vehicle, request)
    if (refusal !== null) return refusal
  }
  return null
}

function answerEquip(state: AuthorityState, playerId: string, request: EquipRequest): RuleEffect {
  const reason = equipRefusalOf(state, playerId, request)
  if (reason !== null) return refuseEquip(state, request, reason)
  return equipSlot(state, playerId, request.slot as LoadoutSlotId, request.itemId)
}

type EquipCheck = (vehicle: VehicleState, request: EquipRequest) => EquipRefusal | null

/** In order: each check may assume the ones before it passed, so after `wrong_slot` the slot is real. */
const EQUIP_CHECKS: readonly EquipCheck[] = [
  notDockedRefusal,
  wrongSlotRefusal,
  slotLockedRefusal,
  notOwnedRefusal,
  exclusiveTakenRefusal,
]

function notDockedRefusal(vehicle: VehicleState): EquipRefusal | null {
  return vehicle.mode === 'docked' ? null : 'not_docked'
}

/** A real slot, and, unless the slot is being emptied, one the item goes in. */
function wrongSlotRefusal(_vehicle: VehicleState, { slot, itemId }: EquipRequest) {
  if (!isLoadoutSlotId(slot)) return 'wrong_slot'
  return itemId === null || acceptedSlotsOf(itemId).includes(slot) ? null : 'wrong_slot'
}

function slotLockedRefusal({ loadout }: VehicleState, { slot }: EquipRequest) {
  return isSlotOpen(loadout, slot as LoadoutSlotId) ? null : 'slot_locked'
}

function notOwnedRefusal({ loadout }: VehicleState, { itemId }: EquipRequest) {
  return itemId === null || isItemOwned(loadout, itemId) ? null : 'not_owned'
}

function exclusiveTakenRefusal({ loadout }: VehicleState, { slot, itemId }: EquipRequest) {
  if (itemId === null) return null
  return isExclusiveSlotTaken(loadout, slot as LoadoutSlotId, itemId) ? 'exclusive_taken' : null
}

function refuseEquip(
  state: AuthorityState,
  request: EquipRequest,
  reason: EquipRefusal,
): RuleEffect {
  return {
    state,
    events: [{ type: 'EquipRefused', slot: request.slot, itemId: request.itemId, reason }],
  }
}

function equipSlot(
  state: AuthorityState,
  playerId: string,
  slot: LoadoutSlotId,
  itemId: string | null,
): RuleEffect {
  const before = vehicleOf(state, playerId).loadout
  const changes = slotChangesOf(before, slot, itemId)
  return {
    state: withLoadout(state, playerId, withSlotChanges(before, changes)),
    events: changes.map(itemEquippedOf),
  }
}

function withSlotChanges(loadout: VehicleLoadout, changes: readonly SlotChange[]): VehicleLoadout {
  return changes.reduce(
    (current, change) => withSlotItem(current, change.slot, change.itemId),
    loadout,
  )
}

/** The item leaves the slot it held first, then fills `slot`. */
function slotChangesOf(
  loadout: VehicleLoadout,
  slot: LoadoutSlotId,
  itemId: string | null,
): SlotChange[] {
  const heldIn = itemId === null ? null : slotHoldingItem(loadout, itemId)
  const leaves = heldIn === null || heldIn === slot ? [] : [{ slot: heldIn, itemId: null }]
  return [...leaves, { slot, itemId }]
}

function itemEquippedOf(change: SlotChange): DomainEventBody {
  return { type: 'ItemEquipped', slot: change.slot, itemId: change.itemId }
}

function withLoadout(
  state: AuthorityState,
  playerId: string,
  loadout: VehicleLoadout,
): AuthorityState {
  return withVehicle(state, playerId, { ...vehicleOf(state, playerId), loadout })
}

type ScenarioLoadout = CommandPayloads['debug.setVehicleLoadout']

/** Every slot not named is empty; the vehicle owns the slotted items and `owned`, nothing else. */
function scenarioLoadoutOf({ slots, owned }: ScenarioLoadout): VehicleLoadout {
  const owning = withItemsOwned(EMPTY_LOADOUT, [...Object.values(slots), ...owned])
  return { ...owning, slots: { ...EMPTY_LOADOUT.slots, ...(slots as Partial<LoadoutSlots>) } }
}

function invalidLoadoutRejection(loadout: ScenarioLoadout): Rejection | null {
  const problems = scenarioLoadoutProblems(loadout)
  return problems.length > 0 ? { reason: 'invalid_loadout', problems } : null
}

function scenarioLoadoutProblems({ slots, owned }: ScenarioLoadout): string[] {
  return [
    ...Object.entries(slots).flatMap(([slot, itemId]) => slotItemProblems(slot, itemId)),
    ...repeatedItemProblems(Object.values(slots)),
    ...owned
      .filter((itemId) => !isVehicleItemId(itemId))
      .map((itemId) => `"${itemId}" is not a vehicle item`),
  ]
}

function slotItemProblems(slot: string, itemId: string): string[] {
  if (!isLoadoutSlotId(slot))
    return [`"${slot}" is not a loadout slot (${LOADOUT_SLOT_IDS.join(', ')})`]
  if (acceptedSlotsOf(itemId).includes(slot)) return []
  return [`"${itemId}" does not go in ${slot}`]
}

function repeatedItemProblems(itemIds: readonly string[]): string[] {
  return itemIds
    .filter((itemId, index) => itemIds.indexOf(itemId) !== index)
    .map((itemId) => `"${itemId}" is named for two slots; an item fills one`)
}

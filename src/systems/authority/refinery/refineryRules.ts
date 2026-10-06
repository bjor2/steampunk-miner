/**
 * The Refinery bay's commands (#105 design and numbers), valid only docked at the Refinery bay:
 *
 * - `QueueRefine {resourceTier, units}` moves up to `floor(0.5 * cargoCapacity)` units of one held
 *   ore tier out of the hold at once into the first free slot. A larger request is clamped to what
 *   the hold has and the batch cap, and `refine_queued` says what was asked for. Core fragments
 *   never refine (they go to the core bay), and with every slot busy the bay refuses with
 *   `slots_busy`; selling raw at the Sell bay is always still open.
 * - `BuyRefinerySlot` raises the slots by one along `cost.refinery.slot` (20 then 40 band-5 ore
 *   units at this planet), up to `slotsMax`.
 *
 * Before the platform has the bay (planet 3) both are refused with `refinery_locked`. Nothing here
 * pays out: refined batches are collected at the Sell bay (`refineryCollection.ts`).
 */
import { coreMaterialTier } from '../../economy/oreEconomy'
import { refineBatchCap, refinerySlotPrice, refinerySlotsMax } from '../../economy/refineryEconomy'
import { sub, toCanonical, ZERO_MONEY, type Money } from '../../money'
import { statsOfVehicle, type Cargo } from '../../vehicle/vehicleState'
import { vehicleOf, withVehicle, withWallet, type AuthorityState } from '../authorityState'
import {
  firstRejection,
  rejectionOf,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from '../commandRule'
import { atBayRejection, missingBayRejection } from '../dockRules'
import { moneyShortRejection } from '../platformServices'
import { freeSlotIndex, refineTicks, type RefineryBatch } from './refineryBatch'

export const REFINERY_RULES: {
  readonly queueRefine: CommandRule<'queueRefine'>
  readonly buyRefinerySlot: CommandRule<'buyRefinerySlot'>
} = {
  queueRefine: {
    fields: { resourceTier: 'wholeNumber', units: 'wholeNumber' },
    reject: (state, { playerId, payload }) =>
      firstRejection([
        () => atRefineryRejection(state, playerId),
        () => coreFragmentRejection(state, payload.resourceTier),
        () => slotsBusyRejection(state),
        () => nothingToRefineRejection(vehicleOf(state, playerId).cargo, payload.resourceTier),
        () => noUnitsRejection(payload.units),
      ]),
    apply: (state, { playerId, tick, payload }) =>
      queueBatch(state, playerId, tick, payload.resourceTier, payload.units),
  },
  buyRefinerySlot: {
    fields: {},
    reject: (state, { playerId }) =>
      firstRejection([
        () => atRefineryRejection(state, playerId),
        () => slotsMaxRejection(state),
        () => moneyShortRejection(state.players[playerId].wallet, nextSlotPriceOf(state)),
      ]),
    apply: (state, { playerId }) => buySlot(state, playerId),
  },
}

/** What the next slot costs here, or null at `slotsMax` (the bay screen's Buy row). */
export function nextRefinerySlotPrice(state: AuthorityState): Money | null {
  return refinerySlotPrice(state.planet.index, state.platform.refinerySlots.length)
}

/** The most one batch takes from this player's hold now: half its capacity. */
export function batchCapOf(state: AuthorityState, playerId: string): number {
  return refineBatchCap(statsOfVehicle(vehicleOf(state, playerId)).cargoCapacity)
}

function atRefineryRejection(state: AuthorityState, playerId: string): Rejection | null {
  return firstRejection([
    () => missingBayRejection(state, 'refinery'),
    () => atBayRejection(state, playerId, 'refinery'),
  ])
}

function coreFragmentRejection(state: AuthorityState, tier: number): Rejection | null {
  if (tier !== coreMaterialTier(state.planet.index)) return null
  return rejectionOf('nothing_to_refine', 'core fragments never refine; they go to the core bay')
}

function slotsBusyRejection(state: AuthorityState): Rejection | null {
  if (freeSlotIndex(state.platform.refinerySlots) !== null) return null
  return rejectionOf('slots_busy', 'every refinery slot holds a batch; sell raw at the Sell bay')
}

function nothingToRefineRejection(cargo: Cargo, tier: number): Rejection | null {
  if ((cargo.ore[String(tier)] ?? 0) > 0) return null
  return rejectionOf('nothing_to_refine', `the hold has no ore of tier ${tier}`)
}

function noUnitsRejection(units: number): Rejection | null {
  if (units > 0) return null
  return rejectionOf('nothing_to_refine', 'a batch needs at least 1 unit')
}

function slotsMaxRejection(state: AuthorityState): Rejection | null {
  if (state.platform.refinerySlots.length < refinerySlotsMax()) return null
  return rejectionOf('slots_max', `the refinery already has ${refinerySlotsMax()} slots`)
}

/** Only asked once `slotsMaxRejection` passed, so a price exists. */
function nextSlotPriceOf(state: AuthorityState): Money {
  return nextRefinerySlotPrice(state) ?? ZERO_MONEY
}

function queueBatch(
  state: AuthorityState,
  playerId: string,
  tick: number,
  tier: number,
  requestedUnits: number,
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  const units = clampedUnits(state, playerId, tier, requestedUnits)
  const slot = freeSlotIndex(state.platform.refinerySlots) as number
  const batch = newBatch(state, playerId, tick, tier, units)
  const unloaded = withVehicle(state, playerId, {
    ...vehicle,
    cargo: withoutOreUnits(vehicle.cargo, tier, units),
  })
  return {
    state: withSlot(unloaded, slot, batch),
    events: [{ type: 'RefineQueued', slot, tier, units, requestedUnits }],
  }
}

/** What the hold has of the tier and the batch cap both bound the request. */
function clampedUnits(
  state: AuthorityState,
  playerId: string,
  tier: number,
  requestedUnits: number,
): number {
  const held = vehicleOf(state, playerId).cargo.ore[String(tier)] ?? 0
  return Math.min(requestedUnits, held, batchCapOf(state, playerId))
}

function newBatch(
  state: AuthorityState,
  playerId: string,
  tick: number,
  tier: number,
  units: number,
): RefineryBatch {
  return {
    owner: playerId,
    tier,
    units,
    readyAtTick: tick + refineTicks(),
    queuedTick: tick,
    queuedPlanet: state.planet.index,
  }
}

function withoutOreUnits(cargo: Cargo, tier: number, units: number): Cargo {
  const key = String(tier)
  const left = (cargo.ore[key] ?? 0) - units
  const ore = Object.fromEntries(Object.entries(cargo.ore).filter(([held]) => held !== key))
  return { ...cargo, ore: left > 0 ? { ...ore, [key]: left } : ore }
}

function withSlot(state: AuthorityState, slot: number, batch: RefineryBatch): AuthorityState {
  const refinerySlots = state.platform.refinerySlots.map((held, index) =>
    index === slot ? batch : held,
  )
  return { ...state, platform: { ...state.platform, refinerySlots } }
}

function buySlot(state: AuthorityState, playerId: string): RuleEffect {
  const price = nextSlotPriceOf(state)
  const refinerySlots = [...state.platform.refinerySlots, null]
  const paid = withWallet(state, playerId, sub(state.players[playerId].wallet, price))
  return {
    state: { ...paid, platform: { ...paid.platform, refinerySlots } },
    events: [
      { type: 'RefinerySlotBought', slots: refinerySlots.length, price: toCanonical(price) },
    ],
  }
}

/**
 * The vehicle state machine's transitions (decision #7 "Vehicle state machine"; docking itself is
 * in `dockRules.ts`):
 *
 *   active   -- energy 0 outside the pad zone -->  stranded            energy_depleted
 *   active, stranded -- hull <= 0 -->              destroyed           vehicle_destroyed
 *   stranded -- RequestRescue or 180 ticks -->     docked (the tow)    rescue_triggered
 *   destroyed -- RequestRescue or 120 ticks -->    docked (the tow)    rescue_triggered
 *
 * Every transition also says `vehicle_state_changed {from, to, reason}`. `energy_low` fires once
 * at 25% and once at 10% of the tank, and re-arms when the tank is above the line again.
 */
import {
  DESTROY_DELAY_TICKS,
  ENERGY_LOW_PERCENTS,
  STRAND_GRACE_TICKS,
} from '../../constants/balance'
import { rescueFee } from '../economy/planetCharges'
import { oreSalePrice } from '../economy/oreEconomy'
import { add, cmp, fromSafeInteger, mul, sub, toCanonical, ZERO_MONEY, type Money } from '../money'
import { isAtOrBelowPercent, rescueFloorQuanta } from '../vehicle/energyQuanta'
import { dockedPoseAt, isInPadZone } from '../vehicle/vehiclePose'
import {
  energyMaxQuantaOf,
  statsOfVehicle,
  type Cargo,
  type VehicleMode,
  type VehicleState,
} from '../vehicle/vehicleState'
import { vehicleOf, withVehicle, withWallet, type AuthorityState } from './authorityState'
import { chainEffects, unchanged, type RuleEffect } from './commandRule'
import { endTrip } from './combat/enemyRoster'
import { disarmOnModeChange } from './charges/chargeDisarm'
import { bankCoreFragments } from './coreBay'
import type { Attacker, DomainEvent, DomainEventBody, RescueCause } from './domainEvent'
import { endShockDiveOnDock } from './magnetic/shockDive'
import { dockSiteOfPlanet } from './planetOfState'

/** What follows any change to a vehicle's energy: the low-energy lines, then a possible strand. */
export function followEnergyChange(
  state: AuthorityState,
  playerId: string,
  tick: number,
): RuleEffect {
  return chainEffects(state, [
    (current) => logEnergyLowLines(current, playerId),
    (current) => strandIfOutOfEnergy(current, playerId, tick),
  ])
}

/** A hull at or below zero destroys an active or stranded vehicle; `attacker` is who did it. */
export function destroyIfHullGone(
  state: AuthorityState,
  playerId: string,
  tick: number,
  cause: string,
  attacker: Attacker | null = null,
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  if (!isWreckable(vehicle) || cmp(vehicle.hull, ZERO_MONEY) > 0) return unchanged(state)
  const destroyed = changeMode(state, playerId, 'destroyed', cause, tick)
  return {
    state: destroyed.state,
    events: [{ type: 'VehicleDestroyed', cause, attacker }, ...destroyed.events],
  }
}

/**
 * The tow (#7, #8): fee paid, cargo ore lost, hull full, at least 25% energy, back on the dock,
 * the carried core fragments delivered to the bay (#8 Game Director's rule, #10), and the trip
 * over for combat (#9).
 */
export function towVehicle(
  state: AuthorityState,
  playerId: string,
  cause: RescueCause,
  tick: number,
): RuleEffect {
  return chainEffects(state, [
    (current) => payRescueFee(current, playerId, cause),
    (current) => bringVehicleToDock(current, playerId),
    (current) => changeMode(current, playerId, 'docked', 'rescue', tick),
    (current) => bankCoreFragments(current, playerId, 'rescue', tick),
    (current) => endTrip(current, playerId),
  ])
}

/** Which tow is due, if any: the cause a `RequestRescue` or an elapsed timer tows for. */
export function rescueCauseOf(vehicle: VehicleState): RescueCause | null {
  if (vehicle.mode === 'stranded') return 'stranded'
  if (vehicle.mode === 'destroyed') return 'destroyed'
  return null
}

/**
 * Tows every vehicle whose strand grace or destroy delay ends at or before `toTick`, at the tick
 * it ends, in player id order so a replay sees the same events.
 */
export function towVehiclesDueBy(
  state: AuthorityState,
  toTick: number,
): {
  state: AuthorityState
  events: DomainEvent[]
} {
  return Object.keys(state.players)
    .sort()
    .reduce<{ state: AuthorityState; events: DomainEvent[] }>(
      (settled, playerId) => towIfDue(settled, playerId, toTick),
      { state, events: [] },
    )
}

function towIfDue(
  settled: { state: AuthorityState; events: DomainEvent[] },
  playerId: string,
  toTick: number,
): { state: AuthorityState; events: DomainEvent[] } {
  const vehicle = vehicleOf(settled.state, playerId)
  const cause = rescueCauseOf(vehicle)
  const dueTick = cause === null ? null : vehicle.modeSinceTick + towDelayOf(cause)
  if (cause === null || dueTick === null || dueTick > toTick) return settled
  const towed = towVehicle(settled.state, playerId, cause, dueTick)
  const stamped = towed.events.map((body): DomainEvent => ({ tick: dueTick, playerId, ...body }))
  return { state: towed.state, events: [...settled.events, ...stamped] }
}

function towDelayOf(cause: RescueCause): number {
  return cause === 'stranded' ? STRAND_GRACE_TICKS : DESTROY_DELAY_TICKS
}

function logEnergyLowLines(state: AuthorityState, playerId: string): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  const maxQuanta = energyMaxQuantaOf(vehicle)
  const isBelow = (percent: number) => isAtOrBelowPercent(vehicle.energy, maxQuanta, percent)
  const newlyCrossed = ENERGY_LOW_PERCENTS.filter(
    (percent) => isBelow(percent) && !vehicle.energyLowLogged.includes(percent),
  )
  const stillBelow = vehicle.energyLowLogged.filter(isBelow)
  return {
    state: withVehicle(state, playerId, {
      ...vehicle,
      energyLowLogged: [...stillBelow, ...newlyCrossed],
    }),
    events: newlyCrossed.map((threshold): DomainEventBody => ({ type: 'EnergyLow', threshold })),
  }
}

/** Energy 0 inside the pad zone never strands (#7); the vehicle simply sits at the dock. */
function strandIfOutOfEnergy(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  if (vehicle.mode !== 'active' || vehicle.energy > 0 || isAtThePad(state, vehicle)) {
    return unchanged(state)
  }
  const stranded = changeMode(state, playerId, 'stranded', 'energy_depleted', tick)
  return { state: stranded.state, events: [{ type: 'EnergyDepleted' }, ...stranded.events] }
}

function isAtThePad(state: AuthorityState, vehicle: VehicleState): boolean {
  const site = dockSiteOfPlanet(state.planet)
  return site !== null && vehicle.pose !== null && isInPadZone(site, vehicle.pose)
}

/** A dock or a wreck also loses a live remote charge (#153, K8 #218). */
export function changeMode(
  state: AuthorityState,
  playerId: string,
  to: VehicleMode,
  reason: string,
  tick: number,
): RuleEffect {
  return chainEffects(state, [
    (current) => recordModeChange(current, playerId, to, reason, tick),
    (current) => disarmOnModeChange(current, playerId, to),
    (current) => endShockDiveOnDock(current, playerId, to),
  ])
}

function recordModeChange(
  state: AuthorityState,
  playerId: string,
  to: VehicleMode,
  reason: string,
  tick: number,
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  return {
    state: withVehicle(state, playerId, { ...vehicle, mode: to, modeSinceTick: tick }),
    events: [{ type: 'VehicleModeChanged', from: vehicle.mode, to, reason }],
  }
}

function isWreckable(vehicle: VehicleState): boolean {
  return vehicle.mode === 'active' || vehicle.mode === 'stranded'
}

/** `rescue_triggered` counts the ore about to be lost; core fragments are never counted (#23). */
function payRescueFee(state: AuthorityState, playerId: string, cause: RescueCause): RuleEffect {
  const { wallet, vehicle } = state.players[playerId]
  const fee = rescueFee(state.planet.index, wallet)
  return {
    state: withWallet(state, playerId, sub(wallet, fee)),
    events: [
      {
        type: 'RescueTriggered',
        cause,
        fee: toCanonical(fee),
        cargoLostValue: toCanonical(oreValueOf(vehicle.cargo)),
      },
      { type: 'MoneyChanged', from: toCanonical(wallet), to: toCanonical(sub(wallet, fee)) },
    ],
  }
}

function bringVehicleToDock(state: AuthorityState, playerId: string): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  return unchanged(
    withVehicle(state, playerId, towedVehicle(vehicle, dockedPoseOf(state, vehicle))),
  )
}

function towedVehicle(vehicle: VehicleState, pose: VehicleState['pose']): VehicleState {
  const stats = statsOfVehicle(vehicle)
  return {
    ...vehicle,
    hull: stats.hullMax,
    energy: Math.max(vehicle.energy, rescueFloorQuanta(vehicle.levels.boiler)),
    cargo: { ...vehicle.cargo, ore: {} },
    pose,
    energyLowLogged: [],
  }
}

function dockedPoseOf(state: AuthorityState, vehicle: VehicleState): VehicleState['pose'] {
  const site = dockSiteOfPlanet(state.planet)
  return site === null ? vehicle.pose : dockedPoseAt(site)
}

function oreValueOf(cargo: Cargo): Money {
  return Object.entries(cargo.ore).reduce(
    (total, [tier, units]) =>
      add(total, mul(oreSalePrice(Number.parseInt(tier)), fromSafeInteger(units))),
    ZERO_MONEY,
  )
}

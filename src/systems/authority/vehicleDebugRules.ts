/**
 * The vehicle's `debug.*` commands (decision #7 consequences for #11, #11 amendment): set an
 * upgrade level, the energy or the hull directly. They go through `applyCommand` like play, so
 * they replay from `commands.ndjson` and log `debug_command_applied`. A value outside its range
 * is refused with a listed problem, never clamped.
 */
import { visualTier } from '../economy/vehicleStats'
import { cmp, fromCanonical, toCanonical, type BigStat } from '../money'
import { quantaOfUnitText } from '../vehicle/energyQuanta'
import { isUpgradeId } from '../vehicle/vehicleStats'
import { energyMaxQuantaOf, statsOfVehicle, type VehicleState } from '../vehicle/vehicleState'
import type { AuthorityCommand } from './authorityCommand'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import {
  chainEffects,
  firstRejection,
  rejectionOf,
  type CommandRule,
  type RuleEffect,
} from './commandRule'
import type { DomainEventBody } from './domainEvent'
import { noPlanetRejection } from './planetOfState'
import { destroyIfHullGone, followEnergyChange } from './vehicleTransitions'

export const VEHICLE_DEBUG_RULES: {
  readonly 'debug.setUpgrade': CommandRule<'debug.setUpgrade'>
  readonly 'debug.setEnergy': CommandRule<'debug.setEnergy'>
  readonly 'debug.setHull': CommandRule<'debug.setHull'>
} = {
  'debug.setUpgrade': {
    fields: { upgradeId: 'text', level: 'wholeNumber' },
    reject: (_state, { payload }) =>
      isUpgradeId(payload.upgradeId)
        ? null
        : rejectionOf('unknown_upgrade', `${payload.upgradeId} is not a registered upgrade id`),
    apply: (state, command) =>
      chainEffects(state, [
        (current) => setUpgradeLevel(current, command),
        (current) => followEnergyChange(current, command.playerId, command.tick),
      ]),
  },
  'debug.setEnergy': {
    fields: { energy: 'text' },
    reject: (state, command) =>
      firstRejection([
        () => noPlanetRejection(state.planet),
        () => energyRejection(state, command),
      ]),
    apply: (state, command) =>
      chainEffects(state, [
        (current) => setEnergy(current, command),
        (current) => followEnergyChange(current, command.playerId, command.tick),
      ]),
  },
  'debug.setHull': {
    fields: { hull: 'nonNegativeMoney' },
    reject: (state, command) =>
      firstRejection([() => noPlanetRejection(state.planet), () => hullRejection(state, command)]),
    apply: (state, command) =>
      chainEffects(state, [
        (current) => setHull(current, command),
        (current) => destroyIfHullGone(current, command.playerId, command.tick, 'debug'),
      ]),
  },
}

function energyRejection(state: AuthorityState, command: AuthorityCommand<'debug.setEnergy'>) {
  const quanta = quantaOfUnitText(command.payload.energy)
  const maxQuanta = energyMaxQuantaOf(vehicleOf(state, command.playerId))
  if (quanta !== null && quanta <= maxQuanta) return null
  return rejectionOf(
    'out_of_range',
    `energy must be a whole number of 1/240 units from 0 to the tank, got ${command.payload.energy}`,
  )
}

function hullRejection(state: AuthorityState, command: AuthorityCommand<'debug.setHull'>) {
  const hullMax = statsOfVehicle(vehicleOf(state, command.playerId)).hullMax
  if (cmp(fromCanonical(command.payload.hull), hullMax) <= 0) return null
  return rejectionOf('out_of_range', `hull must be at most ${toCanonical(hullMax)}`)
}

/** Energy and hull stay inside the new tank and hull when a level goes down. */
function setUpgradeLevel(
  state: AuthorityState,
  command: AuthorityCommand<'debug.setUpgrade'>,
): RuleEffect {
  const vehicle = vehicleOf(state, command.playerId)
  const { upgradeId, level } = command.payload
  if (!isUpgradeId(upgradeId)) return { state, events: [] }
  const relevelled = keepInsideLimits({
    ...vehicle,
    levels: { ...vehicle.levels, [upgradeId]: level },
  })
  const events: DomainEventBody[] = [
    { type: 'UpgradeLevelChanged', upgradeId, from: vehicle.levels[upgradeId], to: level },
    ...visualTierEvents(vehicle, relevelled),
  ]
  return { state: withVehicle(state, command.playerId, relevelled), events }
}

/** `vehicle_configuration_changed` only when the look changes (#7, #11 amendment). */
export function visualTierEvents(before: VehicleState, after: VehicleState): DomainEventBody[] {
  const tier = visualTier(after.levels)
  if (tier === visualTier(before.levels)) return []
  return [{ type: 'VehicleConfigurationChanged', visualTier: tier }]
}

function keepInsideLimits(vehicle: VehicleState): VehicleState {
  const hullMax = statsOfVehicle(vehicle).hullMax
  return {
    ...vehicle,
    energy: Math.min(vehicle.energy, energyMaxQuantaOf(vehicle)),
    hull: smallerOf(vehicle.hull, hullMax),
  }
}

function setEnergy(
  state: AuthorityState,
  command: AuthorityCommand<'debug.setEnergy'>,
): RuleEffect {
  const vehicle = vehicleOf(state, command.playerId)
  const energy = quantaOfUnitText(command.payload.energy) ?? vehicle.energy
  return { state: withVehicle(state, command.playerId, { ...vehicle, energy }), events: [] }
}

function setHull(state: AuthorityState, command: AuthorityCommand<'debug.setHull'>): RuleEffect {
  const vehicle = vehicleOf(state, command.playerId)
  const hull = fromCanonical(command.payload.hull)
  return { state: withVehicle(state, command.playerId, { ...vehicle, hull }), events: [] }
}

function smallerOf(a: BigStat, b: BigStat): BigStat {
  return cmp(a, b) <= 0 ? a : b
}

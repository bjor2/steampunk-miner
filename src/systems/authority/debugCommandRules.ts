/**
 * The `debug.*` command rules (#11 section 4): scenario and debug-API state changes, applied
 * through the same `applyCommand` as play so they replay and are logged. The vehicle's own
 * (`setUpgrade`, `setEnergy`, `setHull`) live in `vehicleDebugRules.ts`.
 */
import { add, fromCanonical, toCanonical, type Money } from '../money'
import { dockedPoseAt } from '../vehicle/vehiclePose'
import { EMPTY_WORLD } from '../world/worldState'
import type { CommandType } from './authorityCommand'
import type { AuthorityState } from './authorityState'
import type { CommandRule, RuleEffect } from './commandRule'
import { dockSiteOfPlanet, type SessionPlanet } from './planetOfState'
import { VEHICLE_DEBUG_RULES } from './vehicleDebugRules'

export const DEBUG_COMMAND_RULES: {
  readonly [K in Extract<CommandType, `debug.${string}`>]: CommandRule<K>
} = {
  'debug.setPlanet': {
    fields: { planetIndex: 'wholeNumber' },
    apply: (state, { payload }) => ({
      state: onPlanet(state, { ...state.planet, index: payload.planetIndex }),
      events: [{ type: 'PlanetChanged', planetIndex: payload.planetIndex }],
    }),
  },
  'debug.setPlanetSeed': {
    fields: { planetSeed: 'safeInteger' },
    apply: (state, { payload }) => ({
      state: onPlanet(state, { ...state.planet, seed: payload.planetSeed }),
      events: [{ type: 'PlanetSeedChanged', planetSeed: payload.planetSeed }],
    }),
  },
  'debug.grantMoney': {
    fields: { amount: 'nonNegativeMoney' },
    apply: (state, { playerId, payload }) =>
      replaceWallet(state, playerId, add(walletOf(state, playerId), fromCanonical(payload.amount))),
  },
  'debug.setMoney': {
    fields: { amount: 'nonNegativeMoney' },
    apply: (state, { playerId, payload }) =>
      replaceWallet(state, playerId, fromCanonical(payload.amount)),
  },
  ...VEHICLE_DEBUG_RULES,
}

/**
 * Another planet is another world: its deltas start empty and every vehicle stands on its dock.
 * The vehicles keep their levels, energy, hull and cargo.
 */
function onPlanet(state: AuthorityState, planet: SessionPlanet): AuthorityState {
  const site = dockSiteOfPlanet(planet)
  const pose = site === null ? null : dockedPoseAt(site)
  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, player]) => [
      id,
      { ...player, vehicle: { ...player.vehicle, pose } },
    ]),
  )
  return { ...state, planet, world: EMPTY_WORLD, players }
}

function walletOf(state: AuthorityState, playerId: string): Money {
  return state.players[playerId].wallet
}

function replaceWallet(state: AuthorityState, playerId: string, wallet: Money): RuleEffect {
  const player = state.players[playerId]
  return {
    state: { ...state, players: { ...state.players, [playerId]: { ...player, wallet } } },
    events: [{ type: 'MoneyChanged', from: toCanonical(player.wallet), to: toCanonical(wallet) }],
  }
}

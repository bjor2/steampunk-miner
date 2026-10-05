/**
 * The `debug.*` command rules (#11 section 4): scenario and debug-API state changes, applied
 * through the same `applyCommand` as play so they replay and are logged. The vehicle's own
 * (`setUpgrade`, `setEnergy`, `setHull`) live in `vehicleDebugRules.ts`, combat's in
 * `combat/combatDebugRules.ts`, `teleportToDock` in `teleportDebugRules.ts`, the ground's
 * `carveCircle`, `fillCircle` and `lineCasing` in `groundDebugRules.ts`, `setCasingGrade` in
 * `casingRules.ts`, `setArtefact` in `artefactRules.ts`, `forceCollapse` in
 * `collapse/collapseDebugRules.ts`.
 */
import { add, fromCanonical, toCanonical, type Money } from '../money'
import type { CommandType } from './authorityCommand'
import type { AuthorityState } from './authorityState'
import { ARTEFACT_DEBUG_RULES } from './artefactRules'
import { CASING_DEBUG_RULES } from './casingRules'
import { COLLAPSE_DEBUG_RULES } from './collapse/collapseDebugRules'
import { COMBAT_DEBUG_RULES } from './combat/combatDebugRules'
import type { CommandRule, RuleEffect } from './commandRule'
import { followBayTotal } from './coreBay'
import { GROUND_DEBUG_RULES } from './groundDebugRules'
import { withSessionOnPlanet } from './planetEntry'
import { TELEPORT_DEBUG_RULES } from './teleportDebugRules'
import { VEHICLE_DEBUG_RULES } from './vehicleDebugRules'

export const DEBUG_COMMAND_RULES: {
  readonly [K in Extract<CommandType, `debug.${string}`>]: CommandRule<K>
} = {
  'debug.setPlanet': {
    fields: { planetIndex: 'wholeNumber' },
    apply: (state, { payload }) => ({
      state: withSessionOnPlanet(state, { ...state.planet, index: payload.planetIndex }),
      events: [{ type: 'PlanetChanged', planetIndex: payload.planetIndex }],
    }),
  },
  'debug.setPlanetSeed': {
    fields: { planetSeed: 'safeInteger' },
    apply: (state, { payload }) => ({
      state: withSessionOnPlanet(state, { ...state.planet, seed: payload.planetSeed }),
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
  'debug.setCoreFragments': {
    fields: { count: 'wholeNumber' },
    apply: (state, { payload, tick }) =>
      followBayTotal({ ...state, platform: { ...state.platform, coreBay: payload.count } }, tick),
  },
  ...VEHICLE_DEBUG_RULES,
  ...COMBAT_DEBUG_RULES,
  ...TELEPORT_DEBUG_RULES,
  ...GROUND_DEBUG_RULES,
  ...CASING_DEBUG_RULES,
  ...ARTEFACT_DEBUG_RULES,
  ...COLLAPSE_DEBUG_RULES,
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

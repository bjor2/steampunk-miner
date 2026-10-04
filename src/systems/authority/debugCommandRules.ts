/**
 * The `debug.*` command rules (#11 section 4): scenario and debug-API state changes, applied
 * through the same `applyCommand` as play so they replay and are logged.
 */
import { add, fromCanonical, toCanonical, type Money } from '../money'
import type { AuthorityCommand, CommandPayloads, CommandType } from './authorityCommand'
import type { AuthorityState } from './authorityState'
import type { DomainEventBody } from './domainEvent'
import type { FieldKind } from './payloadFields'

export interface RuleEffect {
  state: AuthorityState
  events: DomainEventBody[]
}

export interface CommandRule<T extends CommandType> {
  fields: { readonly [F in keyof CommandPayloads[T]]: FieldKind }
  // Method syntax on purpose: a rule for one type is usable where any rule is expected, and
  // applyCommand only calls it with a command of that type.
  apply(state: AuthorityState, command: AuthorityCommand<T>): RuleEffect
}

export const DEBUG_COMMAND_RULES: {
  readonly [K in Extract<CommandType, `debug.${string}`>]: CommandRule<K>
} = {
  'debug.setPlanet': {
    fields: { planetIndex: 'wholeNumber' },
    apply: (state, { payload }) => ({
      state: { ...state, planet: { ...state.planet, index: payload.planetIndex } },
      events: [{ type: 'PlanetChanged', planetIndex: payload.planetIndex }],
    }),
  },
  'debug.setPlanetSeed': {
    fields: { planetSeed: 'safeInteger' },
    apply: (state, { payload }) => ({
      state: { ...state, planet: { ...state.planet, seed: payload.planetSeed } },
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

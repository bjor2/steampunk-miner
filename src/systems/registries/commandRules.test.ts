import { describe, expect, it } from 'vitest'
import { applyCommand } from '../authority/applyCommand'
import type { AuthorityCommand, CommandType } from '../authority/authorityCommand'
import { createAuthorityState } from '../authority/authorityState'
import { rejectionOf, type CommandRule } from '../authority/commandRule'
import { add, fromCanonical, toCanonical } from '../money'
import { COMMAND_RULE_REGISTRY, commandRuleRegistrationsOf } from './commandRules'
import { addToRegistry, withFreshRegistrySet } from './seal'

// A slice's command, added the way a slice adds one. The augmentation also keeps the kernel's
// typecheck honest: a kernel table written over every CommandType would stop compiling.
declare module '../authority/authorityCommand' {
  interface CommandPayloads {
    'probe.tipWallet': { amount: string }
  }
}

const TIP_WALLET: CommandRule<'probe.tipWallet'> = {
  fields: { amount: 'nonNegativeMoney' },
  apply: (state, { playerId, payload }) => {
    const player = state.players[playerId]
    const wallet = add(player.wallet, fromCanonical(payload.amount))
    return {
      state: { ...state, players: { ...state.players, [playerId]: { ...player, wallet } } },
      events: [{ type: 'MoneyChanged', from: toCanonical(player.wallet), to: toCanonical(wallet) }],
    }
  },
}

const freshState = () => createAuthorityState({ planetIndex: 1, planetSeed: 1, playerIds: ['p1'] })

function tipCommand(amount: string): AuthorityCommand {
  return { playerId: 'p1', tick: 0, seq: 1, type: 'probe.tipWallet', payload: { amount } }
}

function applyWithTipRule(command: AuthorityCommand) {
  return withFreshRegistrySet(
    () =>
      commandRuleRegistrationsOf({ 'probe.tipWallet': TIP_WALLET }).forEach((registration) =>
        addToRegistry(COMMAND_RULE_REGISTRY, 'probe', registration),
      ),
    () => applyCommand(freshState(), command),
  )
}

/**
 * A rule filed straight into the registry under a kernel type, past the registrar's prefix check
 * (every command reads the authority reactions registry since #219, so the kernel table's
 * precedence is shown by the slice rule never being asked, not by an unsealed registry set).
 */
function registerShadowOfGrantMoney(): void {
  const refuseAll: CommandRule<'probe.tipWallet'> = {
    fields: { amount: 'nonNegativeMoney' },
    reject: () => rejectionOf('invalid_payload', 'the slice rule was asked'),
    apply: () => {
      throw new Error('the slice rule was applied')
    },
  }
  addToRegistry(COMMAND_RULE_REGISTRY, 'probe', {
    id: 'debug.grantMoney',
    rule: refuseAll as CommandRule<CommandType>,
  })
}

describe('slice command rules', () => {
  it('applies a command whose rule a slice registered', () => {
    const { state, events } = applyWithTipRule(tipCommand('7'))
    expect(toCanonical(state.players.p1.wallet)).toBe('7e+0')
    expect(events.map((event) => event.type)).toEqual(['MoneyChanged'])
  })

  it("checks a slice command's payload against the fields its rule declares", () => {
    const { events } = applyWithTipRule(tipCommand('-1'))
    expect(events).toMatchObject([{ type: 'CommandRejected', reason: 'invalid_payload' }])
  })

  it('refuses a slice command type no slice registered as an unknown command', () => {
    const { events } = withFreshRegistrySet(
      () => undefined,
      () => applyCommand(freshState(), tipCommand('7')),
    )
    expect(events).toMatchObject([{ type: 'CommandRejected', reason: 'unknown_command' }])
  })

  it('answers a kernel command by its kernel rule, never asking a slice rule of that type', () => {
    const { state } = withFreshRegistrySet(registerShadowOfGrantMoney, () =>
      applyCommand(freshState(), {
        playerId: 'p1',
        tick: 0,
        seq: 1,
        type: 'debug.grantMoney',
        payload: { amount: '3' },
      }),
    )
    expect(toCanonical(state.players.p1.wallet)).toBe('3e+0')
  })
})

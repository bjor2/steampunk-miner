/**
 * Slice command rules (docs/standards/feature-slices.md 3.15, K1): the rules for the commands a
 * slice adds to `CommandPayloads`. `applyCommand` looks a type up in the kernel's own table first,
 * so a kernel command never reads this registry and, with nothing registered, every command is
 * answered as before; a type neither knows is still `unknown_command`.
 *
 * A slice's command types start with `<slice>.`, its debug commands with `debug.<slice>.`: those
 * are `debug.*` commands like the kernel's, so they replay and log `debug_command_applied`.
 */
import type { CommandType } from '../authority/authorityCommand'
import type { CommandRule } from '../authority/commandRule'
import { defineRegistry, entriesOf } from './seal'

/** A slice's rules keyed by command type, the shape of the kernel's own rule tables. */
export type SliceCommandRules = { readonly [K in CommandType]?: CommandRule<K> }

/** One registered rule; the registry id is its command type. */
export interface CommandRuleRegistration {
  id: CommandType
  rule: CommandRule<CommandType>
}

export const COMMAND_RULE_REGISTRY = defineRegistry<CommandRuleRegistration>('commandRules')

export function commandRuleRegistrationsOf(
  rules: SliceCommandRules,
): readonly CommandRuleRegistration[] {
  return Object.entries(rules).map(([type, rule]) => ({
    id: type as CommandType,
    rule: rule as CommandRule<CommandType>,
  }))
}

/** The rule a slice registered for this command type; undefined when none did. */
export function sliceCommandRuleOf(type: string): CommandRule<CommandType> | undefined {
  return entriesOf(COMMAND_RULE_REGISTRY).find((registration) => registration.id === type)?.rule
}

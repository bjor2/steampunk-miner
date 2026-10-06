/**
 * How a slice's debug action changes state (docs/standards/feature-slices.md 3.14, K1): it submits
 * a `debug.<slice>.<action>` command, whose rule the slice registered with `commandRules`, for the
 * local player. The command goes to `commands.ndjson` and through `applyCommand` like the kernel's
 * debug commands, so it replays and logs `debug_command_applied`. One the authority would refuse
 * is not sent: the action answers with its problems and changes nothing.
 *
 * A module of its own, so the debug-action registry the registrar files into never loads the store.
 */
import { refusalOf, submitCommand } from '../store/authorityLink'
import { useGameStore } from '../store/gameStore'
import type { CommandIntent, CommandType } from '../systems/authority/authorityCommand'
import type { DebugResult } from './debugScreens'

export type DebugCommandIntent = CommandIntent<Extract<CommandType, `debug.${string}`>>

export function submitSliceDebugCommand(intent: DebugCommandIntent): DebugResult {
  const playerId = useGameStore.getState().playerId
  const problems = refusalOf(playerId, intent)
  if (problems.length > 0) return { ok: false, problems }
  submitCommand(playerId, intent)
  return { ok: true }
}

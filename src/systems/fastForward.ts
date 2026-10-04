/**
 * `fastForward(ticks, commands?)` (#11 section 5) as a plan: advance the authority headlessly to
 * each scripted command's tick, submit it, and end `ticks` after the start. No rendering and no
 * physics, so scripted mining uses authority commands. A plan with any problem is refused whole.
 */
import type { CommandIntent } from './authority/authorityCommand'

/** A command to submit at an absolute authority tick during a fast-forward. */
export type ScriptedCommand = { tick: number } & CommandIntent

export type FastForwardStep =
  { kind: 'advance'; tick: number } | { kind: 'submit'; intent: CommandIntent }

export function fastForwardProblems(
  fromTick: number,
  ticks: number,
  commands: readonly ScriptedCommand[],
): string[] {
  if (!Number.isSafeInteger(ticks) || ticks < 0) {
    return [`ticks must be a whole number >= 0, got ${JSON.stringify(ticks) ?? 'nothing'}`]
  }
  return commands.flatMap((command, index) =>
    scriptedTickProblems(command.tick, index, fromTick, fromTick + ticks, commands),
  )
}

function scriptedTickProblems(
  tick: number,
  index: number,
  fromTick: number,
  endTick: number,
  commands: readonly ScriptedCommand[],
): string[] {
  if (!Number.isSafeInteger(tick) || tick < fromTick || tick > endTick) {
    return [`commands[${index}].tick must be from ${fromTick} to ${endTick}, got ${tick}`]
  }
  if (index > 0 && tick < commands[index - 1].tick) {
    return [`commands[${index}].tick is before the command above it`]
  }
  return []
}

/** Call only when `fastForwardProblems` is empty. */
export function fastForwardSteps(
  fromTick: number,
  ticks: number,
  commands: readonly ScriptedCommand[],
): FastForwardStep[] {
  return [
    ...commands.flatMap(({ tick, ...intent }): FastForwardStep[] => [
      { kind: 'advance', tick },
      { kind: 'submit', intent: intent as CommandIntent },
    ]),
    { kind: 'advance', tick: fromTick + ticks },
  ]
}

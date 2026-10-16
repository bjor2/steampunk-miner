/**
 * The share of a run's time spent travelling (GD ruling on #392: "Deep can't push travel above 25%
 * of trip time"): the drive and thrust ticks the player's pose reports charged, over the ticks the
 * run took, in whole basis points. Drilling, docking and standing by are the rest. The pacing bot
 * reports every move it makes, so its reports hold all its travel.
 */
import { BASIS_POINTS } from '../../../constants/balance'
import type { AuthorityCommand } from '../../../systems/authority/authorityCommand'

/** At most a quarter of the trip on the move (GD ruling on #392). */
export const TRAVEL_SHARE_CAP_BP = 2500

export function travelShareBpOf(
  commands: readonly AuthorityCommand[],
  playerId: string,
  runTicks: number,
): number {
  if (runTicks <= 0) return 0
  return Math.floor((travelTicksOf(commands, playerId) * BASIS_POINTS) / runTicks)
}

function travelTicksOf(commands: readonly AuthorityCommand[], playerId: string): number {
  return commands.reduce((ticks, command) => ticks + reportedTravelTicksOf(command, playerId), 0)
}

function reportedTravelTicksOf(command: AuthorityCommand, playerId: string): number {
  if (command.type !== 'reportPose' || command.playerId !== playerId) return 0
  const { thrustTicks, driveTicks } = (command as AuthorityCommand<'reportPose'>).payload
  return thrustTicks + driveTicks
}

/**
 * How Deep's travel reads against the cap (GD ruling on #392, option (a)): pushed over it only when
 * the run without Deep was at or under it and Deep's goes over. A bare run already over the cap is
 * not Deep's doing, so it leaves Deep ungated: a finding for #397's travel target instead. With no
 * bare run that reached the core there is no bare share at all, so the comparison is unmeasured.
 */
export type DeepTravel = 'kept' | 'pushed_over_cap' | 'bare_over_cap' | 'unmeasured'

export function deepTravelOf(deepShareBp: number, bareShareBp: number | null): DeepTravel {
  if (bareShareBp === null) return 'unmeasured'
  if (bareShareBp > TRAVEL_SHARE_CAP_BP) return 'bare_over_cap'
  return deepShareBp > TRAVEL_SHARE_CAP_BP ? 'pushed_over_cap' : 'kept'
}

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
 * Whether Deep left travel inside the cap: at or under it, or no higher than the run without Deep
 * already was, since a bare run over the cap is not Deep's doing.
 */
export function isTravelKeptByDeep(deepShareBp: number, bareShareBp: number): boolean {
  return deepShareBp <= Math.max(TRAVEL_SHARE_CAP_BP, bareShareBp)
}

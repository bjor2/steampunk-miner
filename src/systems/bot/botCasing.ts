/**
 * The pacing bot's casing (S11, #65 Systems & Economy note 2; #43 Systems & Economy): it buys
 * casing grades on the curve its route needs, grade `b` before it camps in band `b` and the core's
 * grade (5, #41) before a core trip, so the full-slice gate pays the casing sink (274 over grades 2
 * to 5) where a player would. Its trips stay in the bands its grade holds.
 */
import { isCasingGradeEnough, requiredCasingGrade } from '../economy/casingGrades'
import { ECONOMY } from '../economy/economy'
import type { BotSession } from './botSession'

/** The deepest ore band the vehicle's casing grade holds: grade `G` holds bands `1..G` (#41). */
export function deepestHeldBand(session: BotSession): number {
  return session.vehicle().casingGrade
}

export function holdsCore(session: BotSession): boolean {
  return isCasingGradeEnough(session.vehicle().casingGrade, ECONOMY.ore.coreTierBand)
}

/**
 * Whether the next trip the bot wants (ore from `wantedBand`, or the core) needs a grade above the
 * one it has.
 */
export function isCasingGradeShort(
  session: BotSession,
  wanted: { isCoreTheGoal: boolean; wantedBand: number },
): boolean {
  const band = wanted.isCoreTheGoal ? ECONOMY.ore.coreTierBand : wanted.wantedBand
  return session.vehicle().casingGrade < requiredCasingGrade(band)
}

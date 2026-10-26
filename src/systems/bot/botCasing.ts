/**
 * The pacing bot's casing (S11, #65 Systems & Economy note 2; #43 Systems & Economy; the ladder of
 * ticket 829): it buys casing grades on the curve its route needs, the grade a band needs before it
 * camps in it and the core's grade before a core trip, so it pays the casing sink where a player
 * would: four grades a planet on the ladder, and a biome's +1 before the bot's trip reaches its
 * ground, since a trip's band asks the biome's grade too. Its trips stay in the bands its grade
 * holds, so the on-curve bot never lays under-grade lining and never bursts.
 */
import { isCasingGradeEnough, requiredCasingGrade } from '../economy/casingGrades'
import { ECONOMY } from '../economy/economy'
import type { BotSession } from './botSession'

const FIRST_BAND = 1
const LAST_ORE_BAND = ECONOMY.ore.coreTierBand - 1

/** The deepest ore band on this planet the vehicle's casing grade holds; 0 when it holds none. */
export function deepestHeldBand(session: BotSession): number {
  const planetIndex = session.state().planet.index
  const grade = session.vehicle().casingGrade
  let deepest = 0
  for (let band = FIRST_BAND; band <= LAST_ORE_BAND; band++) {
    if (grade >= requiredCasingGrade({ planetIndex, band })) deepest = band
  }
  return deepest
}

export function holdsCore(session: BotSession): boolean {
  const cell = { planetIndex: session.state().planet.index, band: ECONOMY.ore.coreTierBand }
  return isCasingGradeEnough(session.vehicle().casingGrade, cell)
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
  const cell = { planetIndex: session.state().planet.index, band }
  return !isCasingGradeEnough(session.vehicle().casingGrade, cell)
}

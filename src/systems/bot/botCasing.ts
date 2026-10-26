/**
 * The pacing bot's casing (S11, #65 Systems & Economy note 2; #43 Systems & Economy; the ladder of
 * ticket 829): it buys casing grades on the curve its route needs, the grade a band needs before it
 * camps in it and the core's grade before a core trip, so it pays the casing sink where a player
 * would: four grades a planet on the ladder, and a biome's +1 before the bot's trip reaches its
 * ground, since a trip's band asks the biome's grade too. Its trips stay in the bands its grade
 * holds, so the on-curve bot never lays under-grade lining and never bursts.
 *
 * Two off-curve policies carry ticket 829's bot rows (`casingPolicy.lane.test.ts`): `one-short`
 * buys and camps one grade under what each band needs, so it lays lining one grade short and lives
 * with its 20 s bursts; `skip` buys no grade and treats every band as held, re-drilling what bursts.
 */
import { casingLadderOf, requiredGradeOnLadder, type CasingLadder } from '../economy/casingGrades'
import { ECONOMY } from '../economy/economy'
import type { BotSession } from './botSession'

/** How the bot keeps its casing: on the curve (the default), one grade short, or not at all. */
export type CasingPolicy = 'on-curve' | 'one-short' | 'skip'

export const DEFAULT_CASING_POLICY: CasingPolicy = 'on-curve'

const FIRST_BAND = 1
const LAST_ORE_BAND = ECONOMY.ore.coreTierBand - 1
const CORE_BAND = ECONOMY.ore.coreTierBand

/** The deepest ore band on this planet the vehicle's casing grade holds; 0 when it holds none. */
export function deepestHeldBand(
  session: BotSession,
  policy: CasingPolicy = DEFAULT_CASING_POLICY,
): number {
  if (policy === 'skip') return LAST_ORE_BAND
  return deepestBandHeldOnLadder(ladderOfSession(session), heldGradeOf(session, policy))
}

export function holdsCore(
  session: BotSession,
  policy: CasingPolicy = DEFAULT_CASING_POLICY,
): boolean {
  if (policy === 'skip') return true
  return !isGradeShortOnLadder(ladderOfSession(session), heldGradeOf(session, policy), CORE_BAND)
}

/**
 * Whether the next trip the bot wants (ore from `wantedBand`, or the core) needs a grade above the
 * one it has.
 */
export function isCasingGradeShort(
  session: BotSession,
  wanted: { isCoreTheGoal: boolean; wantedBand: number },
  policy: CasingPolicy = DEFAULT_CASING_POLICY,
): boolean {
  if (policy === 'skip') return false
  const band = wanted.isCoreTheGoal ? CORE_BAND : wanted.wantedBand
  return isGradeShortOnLadder(ladderOfSession(session), heldGradeOf(session, policy), band)
}

/** The deepest ore band `grade` holds on `ladder`; 0 when it holds none. */
export function deepestBandHeldOnLadder(ladder: CasingLadder, grade: bigint): number {
  let deepest = 0
  for (let band = FIRST_BAND; band <= LAST_ORE_BAND; band++) {
    if (grade >= requiredGradeOnLadder(ladder, band)) deepest = band
  }
  return deepest
}

/** Whether `band` on `ladder` needs more than `grade`: the grade to buy before the trip. */
export function isGradeShortOnLadder(ladder: CasingLadder, grade: bigint, band: number): boolean {
  return grade < requiredGradeOnLadder(ladder, band)
}

/** The grade the policy reads the vehicle's as: one more for `one-short`, which camps a grade under. */
function heldGradeOf(session: BotSession, policy: CasingPolicy): bigint {
  const grade = session.vehicle().casingGrade
  return policy === 'one-short' ? grade + ONE_GRADE_SHORT : grade
}

const ONE_GRADE_SHORT = BigInt(1)

function ladderOfSession(session: BotSession): CasingLadder {
  return casingLadderOf(session.state().planet.index)
}

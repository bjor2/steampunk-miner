/**
 * The session's blast counter (D1 #860; the Vertical Scaler on #860: "blastId must be a persisted
 * save counter, so reloading can't reroll a collapse"): every detonation takes the next number for
 * its disc record and the counter moves on. It lives in the session state, so it is in the
 * snapshot, the save and the digest, and it is kept across planets, so no two blasts of a session
 * share one. Absent while no charge has blown, so a session that never blasts digests as before.
 */
import type { AuthorityState } from '../authorityState'
import { isWholeNumber } from '../payloadFields'

/** The number the next blast takes: how many blasts the session has seen. */
export function blastSeqOf(state: Pick<AuthorityState, 'blastSeq'>): number {
  return state.blastSeq ?? 0
}

export function withBlastSeq(state: AuthorityState, blastSeq: number): AuthorityState {
  return { ...state, blastSeq }
}

/** The counter under its key, or no key at all before the first blast. */
export function blastSeqFieldOf(state: Pick<AuthorityState, 'blastSeq'>): { blastSeq?: number } {
  const blastSeq = blastSeqOf(state)
  return blastSeq === 0 ? {} : { blastSeq }
}

export function portableBlastSeqProblems(blastSeq: unknown, path: string): string[] {
  if (blastSeq === undefined || (isWholeNumber(blastSeq) && blastSeq !== 0)) return []
  return [`${path} must be a whole number from 1, or be left out`]
}

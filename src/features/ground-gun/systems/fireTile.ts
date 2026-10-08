/**
 * What the fire tile shows (ticket 314; Gameplay's recovery feel, the TD's 8 Oct ruling): nothing
 * until the gun is mounted, then a brass ring that fills as the recovery timer runs, so a long
 * wait in rock is visible. The ring is `nextShotTick` against the length of the last wait, read
 * from the authority; display only, nothing here reaches it.
 */
import { boresOf, type PendingBore } from '../../../systems/authority/bore/boreState'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { gunLevelsOf, isGunMounted } from './gunLevels'

export interface FireTileModel {
  /** How much of the last wait has run, 0 to 100; 100 once the gun may fire. */
  recoveryFilledPercent: number
  isRecovering: boolean
}

const FULL = 100
const READY: FireTileModel = { recoveryFilledPercent: FULL, isRecovering: false }

/** The tile for this player now; null while the gun is not on the miner. */
export function fireTileOf(state: AuthorityState, playerId: string): FireTileModel | null {
  if (!isGunMounted(gunLevelsOf(state, playerId))) return null
  const bore = latestBoreOf(state, playerId)
  if (bore === null || state.tick >= bore.nextShotTick) return READY
  return { recoveryFilledPercent: filledPercentOf(bore, state.tick), isRecovering: true }
}

/** The player's bore whose recovery ends last: the one the next shot waits on. */
function latestBoreOf(state: AuthorityState, playerId: string): PendingBore | null {
  return boresOf(state)
    .filter((bore) => bore.playerId === playerId)
    .reduce<PendingBore | null>(
      (latest, bore) =>
        latest === null || bore.nextShotTick > latest.nextShotTick ? bore : latest,
      null,
    )
}

function filledPercentOf(bore: PendingBore, tick: number): number {
  const wait = bore.nextShotTick - bore.firedTick
  return Math.floor((FULL * (tick - bore.firedTick)) / wait)
}

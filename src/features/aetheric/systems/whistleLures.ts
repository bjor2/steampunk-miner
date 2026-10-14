/**
 * The whistle's lures as the kernel hears them (#262 on ticket 361's seam): every player's sounding
 * whistle is one `Lure` for the hunters' step (`enemyLures`), so a crawler or burrower within its
 * reach paths to its cell until it ends, then hunts the vehicle again. Players are listed in id
 * order, the order the kernel's cap counts them in.
 *
 * The lure clock (`clockSteps`) wakes on the tick a whistle falls silent and clears it, so a spent
 * whistle leaves the section, the save and the digest as if it never sounded. With nothing sounding
 * it names no tick, so a quiet clock never stops for it.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged } from '../../../systems/authority/commandRule'
import type { Lure } from '../../../systems/enemies/lureTarget'
import type { ClockStep } from '../../../systems/registries/clockSteps'
import type { EnemyLureSource } from '../../../systems/registries/enemyLures'
import { SILENT, whistleOf, withWhistle, type SoundingWhistle } from './whistleSection'

export const WHISTLE_LURES: EnemyLureSource = {
  id: 'aetheric.resonance_whistle',
  luresAt: (state) => soundingWhistlesOf(state).map(lureOfWhistle),
}

export const WHISTLE_LURE_CLOCK: ClockStep = {
  id: 'aetheric.lures',
  nextTick: nextSilenceTick,
  run: (state, tick) => unchanged(withSilencedWhistles(state, tick)),
}

function soundingWhistlesOf(state: AuthorityState): SoundingWhistle[] {
  return playerIdsOf(state)
    .map((playerId) => whistleOf(state, playerId).sounding)
    .filter((sounding): sounding is SoundingWhistle => sounding !== null)
}

function lureOfWhistle(sounding: SoundingWhistle): Lure {
  return {
    cell: { tx: sounding.tx, ty: sounding.ty },
    reachMm: sounding.reachMm,
    untilTick: sounding.untilTick,
  }
}

/** The first tick a whistle still sounding falls silent; null with none sounding. */
function nextSilenceTick(state: AuthorityState): number | null {
  const ends = soundingWhistlesOf(state).map((sounding) => sounding.untilTick)
  return ends.length === 0 ? null : Math.min(...ends)
}

function withSilencedWhistles(state: AuthorityState, tick: number): AuthorityState {
  return playerIdsOf(state)
    .filter((playerId) => hasFallenSilent(state, playerId, tick))
    .reduce((current, playerId) => withWhistle(current, playerId, SILENT), state)
}

function hasFallenSilent(state: AuthorityState, playerId: string, tick: number): boolean {
  const sounding = whistleOf(state, playerId).sounding
  return sounding !== null && tick >= sounding.untilTick
}

function playerIdsOf(state: AuthorityState): string[] {
  return Object.keys(state.players).sort()
}

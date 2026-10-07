/**
 * Live blasts the K6 specs (#189) start on planet 1 of the scripted session's seed, with no charge
 * planted: a blast of any radius goes live through `startLiveBlast`, the seam detonation uses, so
 * the specs reach the 24-tile size before the dynamite ladder (#149) can plant one.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import type { BlastEvent } from '../../registries/blastEffects'
import type { TilePoint } from '../../world/tileGrid'
import {
  continueScriptedSession,
  createScriptedSession,
  FREEZE_ENEMIES,
  type ScriptedSession,
} from '../scriptedSession'
import { startLiveBlast } from './liveBlast'

/**
 * Band-3 rock where every tile within 24 tiles is ground or ore, no cave (found by scanning planet 1
 * of seed 83921), so a blast there clears every tile of its front.
 */
export const SOLID_SITE: TilePoint = { tx: 162, ty: 90 }

/** The tick the specs' blasts detonate on; their first slice breaks on it. */
export const BLAST_TICK = 1

export const R24_MM = 24 * MM_PER_METRE

export function blastAt(
  site: TilePoint,
  radiusMm: number,
  options: { tick?: number; playerId?: string; size?: number } = {},
): BlastEvent {
  return {
    ...site,
    radiusMm,
    size: options.size ?? 1,
    playerId: options.playerId ?? 'p1',
    source: 'charge',
    tick: options.tick ?? BLAST_TICK,
  }
}

/**
 * A session with enemies frozen, `prepare`d, whose `blasts` then went live, the clock still before
 * their first slice.
 */
export function liveBlastSession(
  blasts: readonly BlastEvent[],
  playerIds: readonly string[] = ['p1'],
  prepare: (session: ScriptedSession) => void = () => undefined,
): ScriptedSession {
  const session = createScriptedSession(playerIds)
  session.submit(0, FREEZE_ENEMIES)
  prepare(session)
  const live = blasts.reduce((state, blast) => startLiveBlast(state, blast), session.state())
  return continueScriptedSession(live)
}

/**
 * The turntable beat (G&V's feel rule on #177): the turntable eases so a changed part faces the
 * camera, holds it there for `beatHoldTicks`, then hands the turn back to the showcase, easing to
 * where the selected track would stand. A fork re-choice at the platform plays it on the new
 * branch's part (#255, ticket 270; the request comes from the tech tree). Pure look maths on the
 * authority tick, so it is the same at any frame rate; the showcase clock is its one driver.
 */
import type { ForkTurntableRequest } from '../../../tech-tree'
import { SHOWCASE, turnRadiansAt, type Showcase, type TurntableTurn } from './showcaseReactions'

/** A beat toward `faceRadians`, from where the turntable stood on `startTick`. */
export interface TurntableBeat {
  fromRadians: number
  faceRadians: number
  startTick: number
}

/**
 * The turntable's angle at `tick`: the beat while it runs, else the selection's turn. The beat
 * hands back to where `turn` is heading, so a plaque picked mid-beat is where it lands.
 */
export function showcaseTurnRadiansAt(
  turn: TurntableTurn,
  beat: TurntableBeat | null,
  tick: number,
  showcase: Showcase = SHOWCASE,
): number {
  if (beat === null || !isBeatPlaying(beat, tick, showcase)) {
    return turnRadiansAt(turn, tick, showcase)
  }
  return beatRadiansAt(beat, turn.toRadians, tick, showcase)
}

/** The beat a request starts, from wherever the turntable stands on its tick. */
export function beatOfRequest(
  turn: TurntableTurn,
  beat: TurntableBeat | null,
  request: ForkTurntableRequest,
  showcase: Showcase = SHOWCASE,
): TurntableBeat {
  const fromRadians = showcaseTurnRadiansAt(turn, beat, request.tick, showcase)
  return { fromRadians, faceRadians: request.faceTurnRadians, startTick: request.tick }
}

/** From its first tick until it has eased back: in, hold, out. */
export function isBeatPlaying(beat: TurntableBeat, tick: number, showcase = SHOWCASE): boolean {
  const elapsed = tick - beat.startTick
  return elapsed >= 0 && elapsed < 2 * showcase.turnTicks + showcase.beatHoldTicks
}

function beatRadiansAt(
  beat: TurntableBeat,
  handBackRadians: number,
  tick: number,
  showcase: Showcase,
): number {
  const handBackTick = beat.startTick + showcase.turnTicks + showcase.beatHoldTicks
  if (tick < handBackTick) return turnRadiansAt(easeInOf(beat), tick, showcase)
  return turnRadiansAt(easeOutOf(beat, handBackRadians, handBackTick), tick, showcase)
}

function easeInOf(beat: TurntableBeat): TurntableTurn {
  return { fromRadians: beat.fromRadians, toRadians: beat.faceRadians, startTick: beat.startTick }
}

function easeOutOf(beat: TurntableBeat, toRadians: number, startTick: number): TurntableTurn {
  return { fromRadians: beat.faceRadians, toRadians, startTick }
}

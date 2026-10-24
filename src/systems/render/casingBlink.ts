/**
 * The casing's red blink (CG2, ticket 830; the GD lock on casing grades by depth: "casing that
 * can't hold blinks red, then bursts", the Systems row "blinking for the last 3 s", the HS's "the
 * blink extends the #43/#316 warning"): over the lining of every block the collapse telegraph
 * shows, how red the plate is this tick. The last `CASING_BLINK_SECONDS` of the warning blink, or
 * the whole hold when it is shorter (today's 1 s hold is), as a square wave on the authority's
 * ticks, so every machine blinks in step and a replay blinks the same; with reduce motion the plate
 * holds a steady red instead of blinking. Through the refill the ring holds full red until the
 * lining it marked is gone. Presentation only: read from the telegraph's slots, written into the
 * terrain material's uniforms, never back.
 */
import { COLLAPSE_WARN_TICKS } from '../../constants/balance'
import { TICKS_PER_SECOND } from '../../constants/physics'
import {
  CASING_BLINK_HALF_PERIOD_TICKS,
  CASING_BLINK_SECONDS,
  CASING_BLINK_STILL_SHARE,
} from '../../constants/scene'
import type { TelegraphBlock } from './collapseTelegraph'

/** The red share of a plate in a block `elapsedTicks` into its warning, 0 to 1. */
export function blinkShareOf(elapsedTicks: number, isMotionReduced: boolean): number {
  const start = blinkStartTick()
  if (elapsedTicks < start) return 0
  if (elapsedTicks >= COLLAPSE_WARN_TICKS) return 1
  if (isMotionReduced) return CASING_BLINK_STILL_SHARE
  return isBlinkOn(elapsedTicks - start) ? 1 : 0
}

/** The tick of the warning the blink starts on: the last 3 s, or the first tick of a shorter hold. */
export function blinkStartTick(): number {
  return Math.max(0, COLLAPSE_WARN_TICKS - CASING_BLINK_SECONDS * TICKS_PER_SECOND)
}

/** The red share over the tile at (`tx`, `ty`): the most of any listed block holding it, else 0. */
export function blinkShareAtTile(
  blocks: readonly TelegraphBlock[],
  count: number,
  tx: number,
  ty: number,
  isMotionReduced: boolean,
): number {
  let share = 0
  for (let at = 0; at < count; at++) {
    if (!isTileInBlock(blocks[at], tx, ty)) continue
    share = Math.max(share, blinkShareOf(blocks[at].elapsedTicks, isMotionReduced))
  }
  return share
}

function isTileInBlock(block: TelegraphBlock, tx: number, ty: number): boolean {
  return (
    tx >= block.x0 && tx < block.x0 + block.size && ty >= block.y0 && ty < block.y0 + block.size
  )
}

/** On for the first half period, off for the next, from the blink's start. */
function isBlinkOn(ticksIntoBlink: number): boolean {
  return Math.floor(ticksIntoBlink / CASING_BLINK_HALF_PERIOD_TICKS) % 2 === 0
}

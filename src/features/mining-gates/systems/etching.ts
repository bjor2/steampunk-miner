/**
 * The Acid Etcher's mark and return (#142 "The extraction rigs"): the drill touching an etcher
 * cell no mark covers sprays one, `markRadiusTiles` round it (3x3), while the dive has marks left.
 * From `etchTicks` later the glassy skin is gone and every etcher cell under the mark drills
 * normally, so the player digs elsewhere meanwhile. Marks stay until the planet is left.
 */
import type { DomainEventBody } from '../../../systems/authority/domainEvent'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { withWork, type EtchMark, type ExtractorState } from './extractorState'
import { VERB_ROWS } from './verbRows'
import './verbEvents'

const MARK = VERB_ROWS.mark

/** Whether a mark over the tile has eaten its skin by `tick`. */
export function isEtchedAt(value: ExtractorState, tile: TilePoint, tick: number): boolean {
  const mark = markOver(value, tile)
  return mark !== null && mark.readyAtTick <= tick
}

/**
 * Ticks until the tile drills: what a mark over it has left, else a whole etch while the dive has
 * a mark to spray; undefined when none is left.
 */
export function ticksUntilEtched(
  value: ExtractorState,
  tile: TilePoint,
  tick: number,
): number | undefined {
  const mark = markOver(value, tile)
  if (mark !== null) return Math.max(0, mark.readyAtTick - tick)
  return hasMarkLeft(value) ? MARK.etchTicks : undefined
}

/** A mark over a touched cell no mark covers, while one is left; with its event. */
export function sprayMark(
  value: ExtractorState,
  tile: TilePoint,
  tick: number,
): { value: ExtractorState; events: DomainEventBody[] } {
  if (markOver(value, tile) !== null || !hasMarkLeft(value)) return { value, events: [] }
  const mark: EtchMark = { tx: tile.tx, ty: tile.ty, readyAtTick: tick + MARK.etchTicks }
  const marked = { ...value, marks: [...value.marks, mark], marksUsed: value.marksUsed + 1 }
  return {
    value: withWork(marked, MARK.rig, { fromTick: tick, toTick: tick }),
    events: [
      {
        type: 'mining-gates.MarkSprayed',
        tx: mark.tx,
        ty: mark.ty,
        readyAtTick: mark.readyAtTick,
        marksLeft: MARK.marksPerDive - marked.marksUsed,
      },
    ],
  }
}

function hasMarkLeft(value: ExtractorState): boolean {
  return value.marksUsed < MARK.marksPerDive
}

function markOver(value: ExtractorState, tile: TilePoint): EtchMark | null {
  return value.marks.find((mark) => isUnderMark(mark, tile)) ?? null
}

function isUnderMark(mark: EtchMark, { tx, ty }: TilePoint): boolean {
  return (
    Math.abs(mark.tx - tx) <= MARK.markRadiusTiles && Math.abs(mark.ty - ty) <= MARK.markRadiusTiles
  )
}

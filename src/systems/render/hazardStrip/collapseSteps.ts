/**
 * Collapse-warned blocks on the strip's path (Gameplay's proposal 6049828174 4 and the GD's call on
 * collapse at speed, #316, ticket 341): read straight from the authority's collapse list each frame,
 * never cached, as a block warns and settles within seconds. A block warning or refilling whose
 * 4 m square the 3-cell line crosses is a pip where the line could first meet it. Collapse is not
 * scaled with speed: a fast rig outruns it, as intended.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { STRIP_SIDE_CELLS } from '../../../constants/hazardStrip'
import { settledTickOf, type CollapseState } from '../../authority/collapse/collapseState'
import type { Vector2 } from '../../vehicle/localFrame'
import { blockCentreMm, blockOfId } from '../../world/collapseBlock'
import { BLOCK_SIZE_M } from '../collapseTelegraph'
import { distanceOffPath, progressAlongPath, type StripPath } from './stripPath'
import type { StripWindow } from './stripPips'

/** From a block's centre to its corner, metres. */
const BLOCK_HALF_DIAGONAL_M = (BLOCK_SIZE_M * Math.SQRT2) / 2
/** The line reaches this far either side of the path: its side cells and half the middle one. */
const LINE_HALF_WIDTH_M = STRIP_SIDE_CELLS + 0.5

/** Writes the steps of the collapsing blocks ahead into `out`, in step order. */
export function writeCollapseSteps(
  out: number[],
  collapse: CollapseState,
  tick: number,
  path: StripPath,
  window: StripWindow,
  scratch: Vector2,
): void {
  out.length = 0
  for (const entry of collapse.blocks) {
    if (tick >= settledTickOf(entry)) continue
    const step = stepOfBlockOnPath(entry.block, path, scratch)
    if (step !== null && step > window.at && step <= window.at + window.reach) out.push(step)
  }
  out.sort((a, b) => a - b)
}

/** Where the line could first meet the block, or null when the line passes it by. */
function stepOfBlockOnPath(id: string, path: StripPath, scratch: Vector2): number | null {
  const block = blockOfId(id)
  if (block === null) return null
  const { xMm, yMm } = blockCentreMm(block)
  const centre = { x: xMm / MM_PER_METRE, y: yMm / MM_PER_METRE }
  const off = distanceOffPath(path, centre, scratch)
  if (off > BLOCK_HALF_DIAGONAL_M + LINE_HALF_WIDTH_M) return null
  return progressAlongPath(path, centre) - BLOCK_HALF_DIAGONAL_M
}

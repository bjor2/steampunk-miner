/**
 * The debug API's read of the casing lining the ground draws (ticket 315, Gameplay's test 8 on
 * #309): whether a drawn tile carries the lined bit, read from the chunk mesh's gate slot, and
 * how its lining reads at a given size over that tile's band rock (`casingLiningLook.ts`, the
 * shader's rule in TS). State, never pixels: the e2e passes the cell size the camera shows.
 */
import { groundGatePresence } from '../scene/groundGatePresence'
import { readPlanetWorld } from '../store/gameStore'
import { bandColourOf, paletteOf } from '../systems/render/bandPalette'
import {
  isLiningReadable,
  liningContrastAt,
  type LiningContrast,
} from '../systems/render/casingLiningLook'
import { isLinedBits } from '../systems/render/cellGateBits'
import { bandOfTile } from '../systems/world/planetGeometry'
import type { DebugResult } from './debugScreens'

/** A drawn tile's lining: lined or not, and how its lining reads at the asked cell size. */
export interface DrawnLining {
  isLined: boolean
  contrast: LiningContrast
  isReadable: boolean
}

export function drawnLiningAt(
  tx: unknown,
  ty: unknown,
  pixelsPerCell: unknown,
): DebugResult<{ lining: DrawnLining | null }> {
  const problems = drawnLiningProblems(tx, ty, pixelsPerCell)
  if (problems.length > 0) return { ok: false, problems }
  return { ok: true, lining: liningOfTile(tx as number, ty as number, pixelsPerCell as number) }
}

/** Null where no tile is drawn now, or no planet is loaded. */
function liningOfTile(tx: number, ty: number, pixelsPerCell: number): DrawnLining | null {
  const bits = groundGatePresence.gateBitsAt({ tx, ty })
  const { params } = readPlanetWorld()
  if (bits === null || params === null) return null
  const rock = bandColourOf(paletteOf(params.paletteId), bandOfTile(params, tx, ty))
  const contrast = liningContrastAt(pixelsPerCell, rock)
  return { isLined: isLinedBits(bits), contrast, isReadable: isLiningReadable(contrast) }
}

function drawnLiningProblems(tx: unknown, ty: unknown, pixelsPerCell: unknown): string[] {
  return [
    ...(Number.isInteger(tx) && Number.isInteger(ty)
      ? []
      : ['getDrawnLiningAt takes whole tile coordinates']),
    ...(typeof pixelsPerCell === 'number' && pixelsPerCell > 0
      ? []
      : ['getDrawnLiningAt takes a cell size in pixels above 0']),
  ]
}

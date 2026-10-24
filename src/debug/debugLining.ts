/**
 * The debug API's read of the casing lining the ground draws (ticket 315, Gameplay's test 8 on
 * #309; the grade looks of CG2, ticket 830): whether a drawn tile carries the lined bit, read from
 * the chunk mesh's gate slot, what its casing slot draws (its grade's plate, finish and pips and its
 * lining type's trim), how red its lining blinks this frame, and how its lining reads at a given
 * size over that tile's band rock (`casingLiningLook.ts`, the shader's rule in TS). State, never
 * pixels: the e2e passes the cell size the camera shows.
 */
import { casingBlinkPresence } from '../scene/terrainCasingBlink'
import { groundGatePresence } from '../scene/groundGatePresence'
import { readPlanetWorld } from '../store/gameStore'
import { bandColourOf, shownPaletteOf } from '../systems/render/bandPalette'
import { blinkShareAtTile } from '../systems/render/casingBlink'
import { CASING_GRADE_LOOKS } from '../systems/render/casingGradeLook'
import { casingLookOfBits, type CasingLookCode } from '../systems/render/casingLookBits'
import {
  isLiningReadable,
  liningContrastAt,
  type LiningContrast,
} from '../systems/render/casingLiningCrop'
import {
  liningLookOf,
  standardLiningLook,
  type LiningLook,
} from '../systems/render/casingLiningLook'
import { isLinedBits } from '../systems/render/cellGateBits'
import { liningTypeOfIndex } from '../systems/vehicle/liningType'
import { bandOfTile } from '../systems/world/planetGeometry'
import type { DebugResult } from './debugScreens'

/** What a drawn tile's casing slot draws, by the table's ids. */
export interface DrawnCasing {
  plate: string
  finish: string
  pips: number
  liningType: string | null
}

/** A drawn tile's lining: lined or not, what its casing draws, and how it reads at the asked size. */
export interface DrawnLining {
  isLined: boolean
  /** Null on a tile with no intact lining. */
  casing: DrawnCasing | null
  /** How red the lining blinks over a warned block this frame, 0 to 1. */
  blinkShare: number
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
  const code = casingLookOfBits(groundGatePresence.casingBitsAt({ tx, ty }) ?? 0)
  const rock = bandColourOf(shownPaletteOf(params), bandOfTile(params, tx, ty))
  const contrast = liningContrastAt(pixelsPerCell, rock, liningLookOfCode(code))
  return {
    isLined: isLinedBits(bits),
    casing: code === null ? null : drawnCasingOf(code),
    blinkShare: blinkShareOfTile(tx, ty),
    contrast,
    isReadable: isLiningReadable(contrast),
  }
}

function drawnCasingOf(code: CasingLookCode): DrawnCasing {
  return {
    plate: CASING_GRADE_LOOKS.plates[code.plateIndex].id,
    finish: CASING_GRADE_LOOKS.finishes[code.finishIndex].id,
    pips: code.drawnPips,
    liningType: liningTypeOfIndex(code.typeIndex),
  }
}

/** The ring's look as the shader draws it from its slot; ticket 315's brass with no slot. */
function liningLookOfCode(code: CasingLookCode | null): LiningLook {
  if (code === null) return standardLiningLook()
  const grade = 1 + code.plateIndex + CASING_GRADE_LOOKS.plates.length * code.finishIndex
  return liningLookOf(grade, liningTypeOfIndex(code.typeIndex) ?? 'standard')
}

function blinkShareOfTile(tx: number, ty: number): number {
  const { slots, count, isMotionReduced } = casingBlinkPresence
  return blinkShareAtTile(slots, count, tx, ty, isMotionReduced)
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

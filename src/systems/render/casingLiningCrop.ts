/**
 * A lined cell as a screen draws it (ticket 315's phone-size check, Gameplay's test 8 on #309; the
 * CG2 crop diff of ticket 830): the cell drawn as `pixelsPerCell` square pixels under a flat open
 * face along its top, each pixel the mean of a few samples as the screen's filtering blends a
 * pattern finer than its pixels. From the crop: the plate's contrast against its rock (the plate's
 * median luma from the rock's, and its brightest detail from its darkest), and the difference
 * between two crops in grey, which is how two neighbouring grades are told apart without colour.
 * Pure: `casingLiningLook.ts` is the rule, this only rasterises it.
 */
import {
  CASING_GRADE_CROP_MIN_CHANGED_SHARE,
  CASING_GRADE_CROP_MIN_GREY_STEP,
  CASING_LINING_LOOK,
  CASING_LINING_MIN_DETAIL_LUMA_STEP,
  CASING_LINING_MIN_PLATE_LUMA_STEP,
} from '../../constants/scene'
import {
  liningColourOf,
  standardLiningLook,
  type LiningLook,
  type LiningPoint,
} from './casingLiningLook'
import { lumaOf, type Rgb } from './colour'

/** How far apart a lined cell's pixels stand in luma at one scale. */
export interface LiningContrast {
  /** The plate's median pixel luma (its body, grooves aside) from its rock's. */
  plateLumaStep: number
  /** The brightest plate pixel from the darkest: the rivets from the grooves. */
  detailLumaStep: number
}

/** How two crops of one size differ. */
export interface CropDifference {
  /** The mean over pixels of the absolute luma change. */
  meanGreyStep: number
  /** The share of pixels whose luma moved by `CASING_GRADE_CROP_MIN_GREY_STEP` or more. */
  changedShare: number
}

/** Samples per pixel side, as a screen's filtering blends a pattern finer than its pixels. */
const SAMPLES_PER_PIXEL_SIDE = 4

/** The cell's pixels in row order, the open face along row 0, `pixels` a side. */
export function liningCropAt(pixelsPerCell: number, rock: Rgb, look: LiningLook): Rgb[] {
  const pixels = Math.max(1, Math.round(pixelsPerCell))
  const crop: Rgb[] = []
  for (let row = 0; row < pixels; row++) {
    for (let column = 0; column < pixels; column++) {
      crop.push(pixelColourOf(pixels, column, row, rock, look))
    }
  }
  return crop
}

/** The lined cell's contrast drawn at `pixelsPerCell`, over rock of colour `rock`. */
export function liningContrastAt(
  pixelsPerCell: number,
  rock: Rgb,
  look: LiningLook = standardLiningLook(),
): LiningContrast {
  const pixels = Math.max(1, Math.round(pixelsPerCell))
  const plateLumas = plateRowsOf(liningCropAt(pixels, rock, look), pixels, look).map(lumaOf)
  if (plateLumas.length === 0) return { plateLumaStep: 0, detailLumaStep: 0 }
  return {
    plateLumaStep: Math.abs(medianOf(plateLumas) - lumaOf(rock)),
    detailLumaStep: Math.max(...plateLumas) - Math.min(...plateLumas),
  }
}

export function isLiningReadable(contrast: LiningContrast): boolean {
  return (
    contrast.plateLumaStep >= CASING_LINING_MIN_PLATE_LUMA_STEP &&
    contrast.detailLumaStep >= CASING_LINING_MIN_DETAIL_LUMA_STEP
  )
}

/** How `other` differs from `crop` in grey; the crops must be the same size. */
export function cropDifferenceOf(crop: readonly Rgb[], other: readonly Rgb[]): CropDifference {
  if (crop.length !== other.length || crop.length === 0) {
    throw new RangeError(`crops of ${crop.length} and ${other.length} pixels cannot be compared`)
  }
  const steps = crop.map((pixel, at) => Math.abs(lumaOf(pixel) - lumaOf(other[at])))
  return {
    meanGreyStep: steps.reduce((sum, step) => sum + step, 0) / steps.length,
    changedShare:
      steps.filter((step) => step >= CASING_GRADE_CROP_MIN_GREY_STEP).length / steps.length,
  }
}

/** Two crops match, in grey, when too few pixels move: the pair fails the diff. */
export function doCropsMatch(difference: CropDifference): boolean {
  return difference.changedShare < CASING_GRADE_CROP_MIN_CHANGED_SHARE
}

/** The pixels whose centre lies on the plate's body: the rows in from the open face to the trim. */
function plateRowsOf(crop: readonly Rgb[], pixels: number, look: LiningLook): Rgb[] {
  const bodyDepth = CASING_LINING_LOOK.plateDepthTiles - look.trim.widthTiles
  const plateRows = Math.ceil(bodyDepth * pixels - 0.5)
  return crop.slice(0, Math.max(0, plateRows) * pixels)
}

/** The mean of the pixel's samples; `row` counts down from the open face. */
function pixelColourOf(
  pixels: number,
  column: number,
  row: number,
  rock: Rgb,
  look: LiningLook,
): Rgb {
  const sum = [0, 0, 0]
  for (let sy = 0; sy < SAMPLES_PER_PIXEL_SIDE; sy++) {
    for (let sx = 0; sx < SAMPLES_PER_PIXEL_SIDE; sx++) {
      const colour = liningColourOf(samplePointOf(pixels, column, row, sx, sy), rock, look)
      for (let channel = 0; channel < 3; channel++) sum[channel] += colour[channel]
    }
  }
  const count = SAMPLES_PER_PIXEL_SIDE * SAMPLES_PER_PIXEL_SIDE
  return [sum[0] / count, sum[1] / count, sum[2] / count]
}

function samplePointOf(
  pixels: number,
  column: number,
  row: number,
  sx: number,
  sy: number,
): LiningPoint {
  return {
    alongTiles: (column + (sx + 0.5) / SAMPLES_PER_PIXEL_SIDE) / pixels,
    depthTiles: (row + (sy + 0.5) / SAMPLES_PER_PIXEL_SIDE) / pixels,
  }
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

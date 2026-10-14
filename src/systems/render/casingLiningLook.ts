/**
 * The casing lining's look in the ground (#309 GD decision 3, ticket 315): a cased cell shows a
 * brass plate on its open face, ribbed across it by dark grooves, with a line of rivets along it
 * and a dark seam where the plate meets the rock behind. This is the terrain shader's rule in TS
 * (`terrainShader.ts`, "Casing lining"), so the phone-size check reads what the shader draws. A
 * point is placed by its distance along the open face and its depth in from it, both in tiles.
 *
 * Readability (Gameplay's test 8 on #309): a cell is drawn as `pixelsPerCell` square pixels, each
 * the mean of a few samples as the screen would blend it, under a flat open face along its top.
 * The plate's brass body must stand apart from its rock in luma, and its grooves and rivets apart from each
 * other, by the steps `constants/scene.ts` names.
 */
import {
  CASING_LINING_LOOK,
  CASING_LINING_MIN_DETAIL_LUMA_STEP,
  CASING_LINING_MIN_PLATE_LUMA_STEP,
} from '../../constants/scene'
import { lumaOf, rgbOfHex, type Rgb } from './colour'

/** A point of a lined cell: tiles along its open face, and tiles in from it into the rock. */
export interface LiningPoint {
  alongTiles: number
  depthTiles: number
}

/** What a point of a lined cell shows. */
export type LiningTexel = 'rock' | 'brass' | 'groove' | 'rivet'

/** How far apart a lined cell's pixels stand in luma at one scale. */
export interface LiningContrast {
  /** The plate's median pixel luma (its brass body, grooves aside) from its rock's. */
  plateLumaStep: number
  /** The brightest plate pixel from the darkest: the rivets from the grooves. */
  detailLumaStep: number
}

const LOOK = CASING_LINING_LOOK
const COLOURS: Record<Exclude<LiningTexel, 'rock'>, Rgb> = {
  brass: rgbOfHex(LOOK.brass),
  groove: rgbOfHex(LOOK.groove),
  rivet: rgbOfHex(LOOK.rivet),
}
/** Samples per pixel side, as a screen's filtering blends a pattern finer than its pixels. */
const SAMPLES_PER_PIXEL_SIDE = 4

export function liningTexelOf({ alongTiles, depthTiles }: LiningPoint): LiningTexel {
  if (depthTiles < 0 || depthTiles >= LOOK.plateDepthTiles) return 'rock'
  if (isOnRivet(alongTiles, depthTiles)) return 'rivet'
  if (depthTiles >= LOOK.plateDepthTiles - LOOK.seamTiles) return 'groove'
  return isInGroove(alongTiles) ? 'groove' : 'brass'
}

export function liningColourOf(point: LiningPoint, rock: Rgb): Rgb {
  const texel = liningTexelOf(point)
  return texel === 'rock' ? rock : COLOURS[texel]
}

/** The lined cell's contrast drawn at `pixelsPerCell`, over rock of colour `rock`. */
export function liningContrastAt(pixelsPerCell: number, rock: Rgb): LiningContrast {
  const plateLumas = plateLumasAt(Math.max(1, Math.round(pixelsPerCell)), rock)
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

/** The look as the terrain shader's defines: colours as `vec3`s, lengths as floats. */
export function liningShaderDefines(): Record<string, string> {
  return {
    LINING_BRASS: vec3Of(COLOURS.brass),
    LINING_GROOVE: vec3Of(COLOURS.groove),
    LINING_RIVET: vec3Of(COLOURS.rivet),
    LINING_PLATE_DEPTH: floatOf(LOOK.plateDepthTiles),
    LINING_SEAM: floatOf(LOOK.seamTiles),
    LINING_RIBS_PER_TILE: floatOf(LOOK.ribsPerTile),
    LINING_GROOVE_HALF: floatOf(LOOK.grooveHalfShare),
    LINING_RIVET_DEPTH: floatOf(LOOK.rivetDepthTiles),
    LINING_RIVET_RADIUS: floatOf(LOOK.rivetRadiusTiles),
    LINING_RIVET_GLOW: floatOf(LOOK.rivetGlow),
  }
}

/** A groove on every whole rib along the face. */
function isInGroove(alongTiles: number): boolean {
  return distanceToWhole(alongTiles * LOOK.ribsPerTile) < LOOK.grooveHalfShare
}

/** A rivet in the middle of every rib, on the rivet line. */
function isOnRivet(alongTiles: number, depthTiles: number): boolean {
  const offRib = (distanceToWhole(alongTiles * LOOK.ribsPerTile + 0.5) / LOOK.ribsPerTile) ** 2
  const offLine = (depthTiles - LOOK.rivetDepthTiles) ** 2
  return offRib + offLine < LOOK.rivetRadiusTiles ** 2
}

function distanceToWhole(value: number): number {
  return Math.abs(value - Math.round(value))
}

/** The lumas of the pixels whose centre lies on the plate, the open face along the cell's top. */
function plateLumasAt(pixels: number, rock: Rgb): number[] {
  const lumas: number[] = []
  for (let row = 0; row < pixels; row++) {
    if ((row + 0.5) / pixels >= LOOK.plateDepthTiles) break
    for (let column = 0; column < pixels; column++) {
      lumas.push(lumaOf(pixelColourOf(pixels, column, row, rock)))
    }
  }
  return lumas
}

/** The mean of the pixel's samples; `row` counts down from the open face. */
function pixelColourOf(pixels: number, column: number, row: number, rock: Rgb): Rgb {
  const sum = [0, 0, 0]
  for (let sy = 0; sy < SAMPLES_PER_PIXEL_SIDE; sy++) {
    for (let sx = 0; sx < SAMPLES_PER_PIXEL_SIDE; sx++) {
      const colour = liningColourOf(samplePointOf(pixels, column, row, sx, sy), rock)
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

function vec3Of([r, g, b]: Rgb): string {
  return `vec3(${floatOf(r)}, ${floatOf(g)}, ${floatOf(b)})`
}

/** GLSL needs a decimal point on a float literal. */
function floatOf(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`
}

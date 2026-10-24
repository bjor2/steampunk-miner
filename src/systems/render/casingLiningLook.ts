/**
 * The casing lining's look in the ground (#309 GD decision 3, ticket 315; the grade looks of CG2,
 * ticket 830): a cased cell shows a metal plate on its open face, worked in the rivet pattern of
 * its grade's plate (`casingGradeLook.ts`), with a bright lip or a chased band for its finish, pips
 * in its seam for the uncapped tail, and over the seam the trim of its lining type (the cement seam
 * for standard lining, firebrick for refractory, ...), so a ring shows its strength grade and its
 * hazard lining at once. This is the terrain shader's rule in TS (`terrainShader.ts`, "Casing
 * lining"), so the phone-size checks and the contact sheet read what the shader draws. A point is
 * placed by its distance along the open face and its depth in from it, both in tiles.
 *
 * The rasterising half (crops, contrast, the neighbour diff) is `casingLiningCrop.ts`.
 */
import { CASING_GRADE_MARKS, CASING_LINING_LOOK } from '../../constants/scene'
import { liningTypes } from '../economy/heatEconomy'
import {
  CASING_FINISH_SLOTS,
  CASING_GRADE_LOOKS,
  CASING_PLATE_SLOTS,
  CASING_PLATE_PATTERNS,
  CASING_TRIM_STYLES,
  casingGradeLookOf,
  casingTrimOf,
  type CasingFinishRow,
  type CasingGradeLook,
  type CasingLookTable,
  type CasingPlateRow,
  type CasingTrimRow,
} from './casingGradeLook'
import { CASING_TYPE_UNIT } from './casingLookBits'
import { mixRgb, rgbOfHex, scaleRgb, type Rgb } from './colour'

/** A point of a lined cell: tiles along its open face, and tiles in from it into the rock. */
export interface LiningPoint {
  alongTiles: number
  depthTiles: number
}

/** What a point of a lined cell shows. */
export type LiningTexel =
  'rock' | 'plate' | 'groove' | 'rivet' | 'lip' | 'chased' | 'pip' | 'trim' | 'joint'

/** One ring's whole look: its grade's plate and finish, and its lining type's trim. */
export interface LiningLook {
  grade: CasingGradeLook
  trim: CasingTrimRow
}

const LOOK = CASING_LINING_LOOK
const MARKS = CASING_GRADE_MARKS
/** Mixed toward white this far, a lip reads as light caught on the plate's edge. */
const LIP_WHITE_SHARE = 0.6

/** The look a ring of `grade` in `liningType` wears; the standard seam for a type with no trim. */
export function liningLookOf(
  grade: number,
  liningType: string,
  table: CasingLookTable = CASING_GRADE_LOOKS,
): LiningLook {
  return { grade: casingGradeLookOf(grade, table), trim: casingTrimOf(liningType, table) }
}

/** Ticket 315's look: grade 1 brass in the standard lining. */
export function standardLiningLook(table: CasingLookTable = CASING_GRADE_LOOKS): LiningLook {
  return liningLookOf(1, 'standard', table)
}

export function liningTexelOf(point: LiningPoint, look: LiningLook): LiningTexel {
  const { depthTiles } = point
  if (depthTiles < 0 || depthTiles >= LOOK.plateDepthTiles) return 'rock'
  if (isOnPip(point, look.grade)) return 'pip'
  if (depthTiles >= LOOK.plateDepthTiles - look.trim.widthTiles)
    return trimTexelOf(point, look.trim)
  return finishTexelOf(point, look.grade.finish) ?? patternTexelOf(point, look.grade.plate)
}

export function liningColourOf(point: LiningPoint, rock: Rgb, look: LiningLook): Rgb {
  return texelColourOf(liningTexelOf(point, look), rock, look)
}

/** The display colour of each texel of `look`, over `rock`. */
export function texelColourOf(texel: LiningTexel, rock: Rgb, look: LiningLook): Rgb {
  const { plate, finish } = look.grade
  switch (texel) {
    case 'rock':
      return rock
    case 'plate':
      return plateBodyOf(plate, finish)
    case 'groove':
    case 'chased':
      return rgbOfHex(plate.groove)
    case 'rivet':
    case 'pip':
      return rgbOfHex(plate.rivet)
    case 'lip':
      return mixRgb(plateBodyOf(plate, finish), [1, 1, 1], LIP_WHITE_SHARE)
    case 'trim':
      return rgbOfHex(look.trim.colour ?? plate.groove)
    case 'joint':
      return rgbOfHex(look.trim.joint ?? plate.rivet)
  }
}

function plateBodyOf(plate: CasingPlateRow, finish: CasingFinishRow): Rgb {
  return scaleRgb(rgbOfHex(plate.colour), finish.plateScale)
}

/** The lip along the face and the chased band draw over the plate's own pattern. */
function finishTexelOf({ depthTiles }: LiningPoint, finish: CasingFinishRow): LiningTexel | null {
  if (finish.lip && depthTiles < MARKS.lipTiles) return 'lip'
  if (finish.chased && isBetween(depthTiles, MARKS.chasedTiles)) return 'chased'
  return null
}

function patternTexelOf(point: LiningPoint, plate: CasingPlateRow): LiningTexel {
  switch (plate.pattern) {
    case 'rivet-line':
      return rivetLineTexelOf(point)
    case 'rivet-pairs':
      return rivetRowsTexelOf(point, MARKS.pairRowsTiles)
    case 'bolt-strap':
      return boltStrapTexelOf(point)
    case 'lattice':
      return isInLattice(point) ? 'groove' : 'plate'
    case 'stagger':
      return staggerTexelOf(point)
  }
}

/** Ticket 315's brass: a groove on every whole rib, a rivet in the middle of each on one line. */
function rivetLineTexelOf(point: LiningPoint): LiningTexel {
  if (isOnRivet(point, LOOK.rivetDepthTiles, LOOK.rivetRadiusTiles)) return 'rivet'
  return isInGroove(point.alongTiles) ? 'groove' : 'plate'
}

/** Rivets on two rows at every rib's centre; a groove only every other rib. */
function rivetRowsTexelOf(point: LiningPoint, rows: readonly number[]): LiningTexel {
  if (rows.some((row) => isOnRivet(point, row, MARKS.pairRivetRadiusTiles))) return 'rivet'
  return isInGroove(point.alongTiles / MARKS.pairGrooveRibs) ? 'groove' : 'plate'
}

/** No grooves: a dark strap across the plate with a square bolt at every rib's centre. */
function boltStrapTexelOf({ alongTiles, depthTiles }: LiningPoint): LiningTexel {
  const offRib = distanceToWhole(alongTiles * LOOK.ribsPerTile + 0.5) / LOOK.ribsPerTile
  const strapMiddle = (MARKS.strapTiles[0] + MARKS.strapTiles[1]) / 2
  if (offRib < MARKS.boltHalfTiles && Math.abs(depthTiles - strapMiddle) < MARKS.boltHalfTiles) {
    return 'rivet'
  }
  return isBetween(depthTiles, MARKS.strapTiles) ? 'groove' : 'plate'
}

/** Grooves every rib; the rivets zigzag between two rows, one row per rib. */
function staggerTexelOf(point: LiningPoint): LiningTexel {
  const rib = Math.floor(point.alongTiles * LOOK.ribsPerTile)
  const row = MARKS.pairRowsTiles[((rib % 2) + 2) % 2]
  if (isOnRivet(point, row, MARKS.staggerRivetRadiusTiles)) return 'rivet'
  return isInGroove(point.alongTiles) ? 'groove' : 'plate'
}

/** Grooves on both diagonals, a rib apart. */
function isInLattice({ alongTiles, depthTiles }: LiningPoint): boolean {
  const ribs = LOOK.ribsPerTile
  return (
    distanceToWhole((alongTiles + depthTiles) * ribs) < MARKS.latticeHalfShare ||
    distanceToWhole((alongTiles - depthTiles) * ribs) < MARKS.latticeHalfShare
  )
}

/** The seam band and its joints: mortar lines, stitches or a zigzag strap, by trim style. */
function trimTexelOf(point: LiningPoint, trim: CasingTrimRow): LiningTexel {
  return isOnJoint(point, trim) ? 'joint' : 'trim'
}

function isOnJoint({ alongTiles, depthTiles }: LiningPoint, trim: CasingTrimRow): boolean {
  const half = MARKS.jointHalfTiles
  const bandFrom = LOOK.plateDepthTiles - trim.widthTiles
  const across = (depthTiles - bandFrom) / trim.widthTiles
  switch (trim.style) {
    case 'seam':
      return false
    case 'firebrick':
      return distanceToWhole(alongTiles / MARKS.brickTiles) * MARKS.brickTiles < half
    case 'stitched':
      return distanceToWhole(alongTiles * LOOK.ribsPerTile) / LOOK.ribsPerTile < half
    case 'zigzag':
      return Math.abs(across - triangleWave(alongTiles * LOOK.ribsPerTile)) * trim.widthTiles < half
  }
}

/** 0 at every whole number, 1 halfway between. */
function triangleWave(value: number): number {
  return 2 * distanceToWhole(value)
}

/** Pip k of the drawn pips sits at (k + 1) / (most + 1) along each tile, on the pips' row. */
function isOnPip({ alongTiles, depthTiles }: LiningPoint, grade: CasingGradeLook): boolean {
  const { most, depthTiles: row, radiusTiles } = CASING_GRADE_LOOKS.pips
  const offRow = depthTiles - row
  if (Math.abs(offRow) >= radiusTiles) return false
  const inTile = alongTiles - Math.floor(alongTiles)
  for (let pip = 0; pip < grade.drawnPips; pip++) {
    const offPip = inTile - (pip + 1) / (most + 1)
    if (offPip * offPip + offRow * offRow < radiusTiles * radiusTiles) return true
  }
  return false
}

/** A groove on every whole rib along the face. */
function isInGroove(alongTiles: number): boolean {
  return distanceToWhole(alongTiles * LOOK.ribsPerTile) < LOOK.grooveHalfShare
}

/** A rivet in the middle of every rib, on the row `rowTiles` deep. */
function isOnRivet(
  { alongTiles, depthTiles }: LiningPoint,
  rowTiles: number,
  radiusTiles: number,
): boolean {
  const offRib = (distanceToWhole(alongTiles * LOOK.ribsPerTile + 0.5) / LOOK.ribsPerTile) ** 2
  const offRow = (depthTiles - rowTiles) ** 2
  return offRib + offRow < radiusTiles ** 2
}

function isBetween(value: number, [from, to]: readonly number[]): boolean {
  return value >= from && value < to
}

function distanceToWhole(value: number): number {
  return Math.abs(value - Math.round(value))
}

/**
 * The look as the terrain shader's defines: the plate geometry, every plate slot's colours and
 * pattern code, every finish slot's marks, the pips, and every lining type's trim by its index in
 * `liningTypes()`, so the shader draws the rule the TS reads. Slots the table leaves empty repeat
 * the plain finish or the standard seam.
 */
export function liningShaderDefines(
  table: CasingLookTable = CASING_GRADE_LOOKS,
): Record<string, string> {
  return {
    ...geometryDefines(),
    ...plateDefines(table),
    ...finishDefines(table),
    ...trimDefines(table),
    CASING_TYPE_UNIT: floatOf(CASING_TYPE_UNIT),
    CASING_PLATE_SLOTS: floatOf(CASING_PLATE_SLOTS),
    CASING_FINISH_SLOTS: floatOf(CASING_FINISH_SLOTS),
    CASING_PIPS_MOST: floatOf(table.pips.most),
    CASING_PIPS_MOST_INT: String(table.pips.most),
    CASING_PIPS_DEPTH: floatOf(table.pips.depthTiles),
    CASING_PIPS_RADIUS: floatOf(table.pips.radiusTiles),
  }
}

function geometryDefines(): Record<string, string> {
  return {
    LINING_PLATE_DEPTH: floatOf(LOOK.plateDepthTiles),
    LINING_RIBS_PER_TILE: floatOf(LOOK.ribsPerTile),
    LINING_GROOVE_HALF: floatOf(LOOK.grooveHalfShare),
    LINING_RIVET_DEPTH: floatOf(LOOK.rivetDepthTiles),
    LINING_RIVET_RADIUS: floatOf(LOOK.rivetRadiusTiles),
    LINING_RIVET_GLOW: floatOf(LOOK.rivetGlow),
    CASING_PAIR_ROW_A: floatOf(MARKS.pairRowsTiles[0]),
    CASING_PAIR_ROW_B: floatOf(MARKS.pairRowsTiles[1]),
    CASING_PAIR_RIVET_RADIUS: floatOf(MARKS.pairRivetRadiusTiles),
    CASING_STRAP_FROM: floatOf(MARKS.strapTiles[0]),
    CASING_STRAP_TO: floatOf(MARKS.strapTiles[1]),
    CASING_BOLT_HALF: floatOf(MARKS.boltHalfTiles),
    CASING_PAIR_GROOVE_RIBS: floatOf(MARKS.pairGrooveRibs),
    CASING_STAGGER_RIVET_RADIUS: floatOf(MARKS.staggerRivetRadiusTiles),
    CASING_LATTICE_HALF: floatOf(MARKS.latticeHalfShare),
    CASING_LIP_DEPTH: floatOf(MARKS.lipTiles),
    CASING_LIP_WHITE: floatOf(LIP_WHITE_SHARE),
    CASING_CHASED_FROM: floatOf(MARKS.chasedTiles[0]),
    CASING_CHASED_TO: floatOf(MARKS.chasedTiles[1]),
    CASING_JOINT_HALF: floatOf(MARKS.jointHalfTiles),
    CASING_BRICK_TILES: floatOf(MARKS.brickTiles),
    CASING_PIP_GLOW: floatOf(MARKS.pipGlow),
    CASING_JOINT_GLOW: floatOf(MARKS.jointGlow),
  }
}

function plateDefines(table: CasingLookTable): Record<string, string> {
  return Object.fromEntries(
    table.plates.flatMap((plate, slot) => [
      [`CASING_PLATE_${slot}_COLOUR`, vec3Of(rgbOfHex(plate.colour))],
      [`CASING_PLATE_${slot}_GROOVE`, vec3Of(rgbOfHex(plate.groove))],
      [`CASING_PLATE_${slot}_RIVET`, vec3Of(rgbOfHex(plate.rivet))],
      [`CASING_PLATE_${slot}_PATTERN`, String(CASING_PLATE_PATTERNS.indexOf(plate.pattern))],
    ]),
  )
}

function finishDefines(table: CasingLookTable): Record<string, string> {
  const plain = table.finishes[0]
  const slots = Array.from(
    { length: CASING_FINISH_SLOTS },
    (_, slot) => table.finishes[slot] ?? plain,
  )
  return Object.fromEntries(
    slots.flatMap((finish, slot) => [
      [`CASING_FINISH_${slot}_SCALE`, floatOf(finish.plateScale)],
      [`CASING_FINISH_${slot}_LIP`, finish.lip ? '1' : '0'],
      [`CASING_FINISH_${slot}_CHASED`, finish.chased ? '1' : '0'],
    ]),
  )
}

/** The shader has this many trim slots, by `liningTypes()` index. */
export const CASING_TRIM_SLOTS = 4

function trimDefines(table: CasingLookTable): Record<string, string> {
  const types = liningTypes()
  const slots = Array.from({ length: CASING_TRIM_SLOTS }, (_, slot) =>
    casingTrimOf(types[slot] ?? '', table),
  )
  return Object.fromEntries(slots.flatMap((trim, slot) => trimSlotDefines(trim, slot)))
}

function trimSlotDefines(trim: CasingTrimRow, slot: number): [string, string][] {
  return [
    [`CASING_TRIM_${slot}_STYLE`, String(CASING_TRIM_STYLES.indexOf(trim.style))],
    [`CASING_TRIM_${slot}_WIDTH`, floatOf(trim.widthTiles)],
    [`CASING_TRIM_${slot}_OWN_COLOUR`, trim.colour === null ? '0' : '1'],
    [`CASING_TRIM_${slot}_COLOUR`, vec3Of(rgbOfHex(trim.colour ?? '#000000'))],
    [`CASING_TRIM_${slot}_OWN_JOINT`, trim.joint === null ? '0' : '1'],
    [`CASING_TRIM_${slot}_JOINT`, vec3Of(rgbOfHex(trim.joint ?? '#000000'))],
  ]
}

function vec3Of([r, g, b]: Rgb): string {
  return `vec3(${floatOf(r)}, ${floatOf(g)}, ${floatOf(b)})`
}

/** GLSL needs a decimal point on a float literal. */
function floatOf(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`
}

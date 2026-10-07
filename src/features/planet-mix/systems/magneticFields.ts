/**
 * The field pockets of a magnetic planet (GD lock on spec #258, Q1, Q2 and Q8): every ferrous vein,
 * an ore patch the mix gives the `metal` family, throws a field, a disc round the vein's centre
 * reaching `fieldMarginTiles` past the vein's #42 radius. The hazard tugs toward `vein` and the
 * probe draws the field lines from it; this module only says where the fields are.
 *
 * A field is a pure function of the planet's params: the patch lattice and the mix fold both come
 * from the planet seed, so every player of a session, in any chunk order, sees the same fields.
 * Nothing is painted into the cells, so generation and the goldens are unchanged on every planet.
 */
import { foldPatchContent } from '../../../systems/registries/generationHooks'
import { bandPatchesInBox, patchRadiusOf, type OrePatch } from '../../../systems/world/orePatches'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import { CHUNK_SIZE, firstTileOfChunk, type TilePoint } from '../../../systems/world/tileGrid'
import { RESOURCE_FAMILY } from '../../../systems/world/worldCell'
import { isMagneticPlanet } from './planetClass'
import { PLANET_CLASS_ROWS } from './planetClassRows'

export interface MagneticField {
  band: number
  /** The ferrous vein's centre, which the field bends toward. */
  vein: TilePoint
  radiusTiles: number
}

/** A tile box, both ends included. */
export interface TileBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

const BANDS = Array.from({ length: BAND_COUNT }, (_, at) => at + 1)

/** Every field reaching into the box, band by band in the lattice's painting order. */
export function magneticFieldsInBox(params: PlanetParams, box: TileBox): MagneticField[] {
  if (!isMagneticPlanet(params.planetIndex)) return []
  return BANDS.flatMap((band) => bandFieldsInBox(params, band, box))
}

/** Every field reaching into chunk `(cx, cy)`. */
export function magneticFieldsNearChunk(
  params: PlanetParams,
  cx: number,
  cy: number,
): MagneticField[] {
  return magneticFieldsInBox(params, chunkBoxOf(cx, cy))
}

/** The field holding `tile` whose vein is nearest; null outside every field. */
export function magneticFieldAt(params: PlanetParams, tile: TilePoint): MagneticField | null {
  const holding = magneticFieldsInBox(params, {
    x0: tile.tx,
    y0: tile.ty,
    x1: tile.tx,
    y1: tile.ty,
  })
  return holding.reduce<MagneticField | null>(
    (nearest, field) => (isNearerVein(tile, field, nearest) ? field : nearest),
    null,
  )
}

function bandFieldsInBox(params: PlanetParams, band: number, box: TileBox): MagneticField[] {
  const radiusTiles = fieldRadiusOf(params, band)
  return bandPatchesInBox(
    params,
    band,
    grownBoxOf(box, PLANET_CLASS_ROWS.magnetic.fieldMarginTiles),
  )
    .filter((patch) => isFerrousVein(params, patch))
    .map((patch) => ({ band, vein: patch.centre, radiusTiles }))
    .filter((field) => isFieldInBox(field, box))
}

/** The vein's #42 disc radius and the field's margin past it. */
function fieldRadiusOf(params: PlanetParams, band: number): number {
  return (
    patchRadiusOf(params.patchMeanCells[band - 1]) + PLANET_CLASS_ROWS.magnetic.fieldMarginTiles
  )
}

/** A patch the mix gives the `metal` family, read through the same fold generation paints with. */
function isFerrousVein(params: PlanetParams, patch: OrePatch): boolean {
  const rolled = { family: patch.family, tierOffset: patch.band - 1 }
  return foldPatchContent(params, patch, rolled).family === RESOURCE_FAMILY.metal
}

/**
 * A field reaches at most its margin past the vein's growth radius, so the lattice's own reach
 * widened by the margin finds every vein whose field can touch the box.
 */
function grownBoxOf(box: TileBox, margin: number): TileBox {
  return { x0: box.x0 - margin, y0: box.y0 - margin, x1: box.x1 + margin, y1: box.y1 + margin }
}

function chunkBoxOf(cx: number, cy: number): TileBox {
  const x0 = firstTileOfChunk(cx)
  const y0 = firstTileOfChunk(cy)
  return { x0, y0, x1: x0 + CHUNK_SIZE - 1, y1: y0 + CHUNK_SIZE - 1 }
}

/** Whether the box's nearest tile to the vein lies within the field. */
function isFieldInBox(field: MagneticField, box: TileBox): boolean {
  const dx = field.vein.tx - clamped(field.vein.tx, box.x0, box.x1)
  const dy = field.vein.ty - clamped(field.vein.ty, box.y0, box.y1)
  return dx * dx + dy * dy <= field.radiusTiles * field.radiusTiles
}

/** Nearer vein first; on a tie the field met first (lower band, then painting order) stays. */
function isNearerVein(tile: TilePoint, field: MagneticField, held: MagneticField | null): boolean {
  if (held === null) return true
  return veinDistanceSqOf(tile, field) < veinDistanceSqOf(tile, held)
}

function veinDistanceSqOf(tile: TilePoint, field: MagneticField): number {
  const dx = field.vein.tx - tile.tx
  const dy = field.vein.ty - tile.ty
  return dx * dx + dy * dy
}

function clamped(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}

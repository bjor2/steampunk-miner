/**
 * The `<asset-id>.parts.json` sidecar, schema 1 (#52 "`parts.json` sidecar"): the only thing game
 * code reads to place an asset's parts. Rects are atlas pixels from the image's top-left; sizes and
 * pivots are metres from the part's bottom-left; `z` is the draw order.
 *
 * Two fields beyond the decision's example: `atM`, where the part's pivot sits in the asset's own
 * frame (the Blender object's location, X right and Z up), without which no part could be placed;
 * and `atlasPx`, the atlas size the rects must fit.
 */
import {
  ART_RULES,
  categoryOfAssetId,
  isValidPartId,
  pxPerMetreOf,
  tierOfPartId,
  type MapKind,
} from './artIds'

export const SIDECAR_SCHEMA = 1

export type Pair = readonly [number, number]

export interface SidecarPart {
  id: string
  tier: number
  /** `[x, y, width, height]` in atlas pixels. */
  rect: readonly [number, number, number, number]
  sizeM: Pair
  pivotM: Pair
  atM: Pair
  z: number
}

export interface PartsSidecar {
  assetId: string
  schema: number
  /** Null hash and version on a placeholder that no export has written yet. */
  source: { blend: string; sha256: string | null; blender: string | null }
  pxPerMetre: number
  atlasPx: Pair
  /** `emissive` is false when nothing on the asset glows (#52 "Formats"). */
  maps: Record<Exclude<MapKind, 'emissive'>, string> & { emissive: string | false }
  parts: readonly SidecarPart[]
}

/** Why a sidecar is not a valid schema-1 file for `assetId` (#52 acceptance 3); empty when it is. */
export function sidecarProblems(assetId: string, sidecar: PartsSidecar): string[] {
  return [
    ...headerProblems(assetId, sidecar),
    ...duplicatePartProblems(sidecar.parts),
    ...sidecar.parts.flatMap((part) => partProblems(assetId, sidecar.atlasPx, part)),
  ].map((problem) => `${assetId}.parts.json: ${problem}`)
}

/** The map files the sidecar names, which a final asset must ship beside it. */
export function mapFilesOf(sidecar: PartsSidecar): string[] {
  const { albedo, normal, emissive } = sidecar.maps
  return emissive === false ? [albedo, normal] : [albedo, normal, emissive]
}

function headerProblems(assetId: string, sidecar: PartsSidecar): string[] {
  const category = categoryOfAssetId(assetId)
  const problems: string[] = []
  if (sidecar.schema !== SIDECAR_SCHEMA) problems.push(`schema must be ${SIDECAR_SCHEMA}`)
  if (sidecar.assetId !== assetId) problems.push(`assetId must be "${assetId}"`)
  if (category !== null && sidecar.pxPerMetre !== pxPerMetreOf(category)) {
    problems.push(`pxPerMetre must be ${pxPerMetreOf(category)} for a ${category} asset`)
  }
  if (!isAtlasSize(sidecar.atlasPx)) {
    problems.push(`atlasPx must be power-of-two sides up to ${ART_RULES.maxAtlasPx}`)
  }
  if (sidecar.parts.length === 0) problems.push('an asset has at least one part')
  return [...problems, ...mapNameProblems(assetId, sidecar.maps)]
}

function mapNameProblems(assetId: string, maps: PartsSidecar['maps']): string[] {
  const named = [
    ['albedo', maps.albedo],
    ['normal', maps.normal],
    ['emissive', maps.emissive === false ? `${assetId}.emissive.ktx2` : maps.emissive],
  ]
  return named
    .filter(([kind, file]) => file !== `${assetId}.${kind}.ktx2`)
    .map(([kind]) => `maps.${kind} must be "${assetId}.${kind}.ktx2"`)
}

function duplicatePartProblems(parts: readonly SidecarPart[]): string[] {
  const ids = parts.map((part) => part.id)
  return ids.filter((id, at) => ids.indexOf(id) !== at).map((id) => `part "${id}" is listed twice`)
}

function partProblems(assetId: string, atlas: Pair, part: SidecarPart): string[] {
  const problems: string[] = []
  if (!isValidPartId(assetId, part.id)) problems.push('is not a valid part id')
  if (!isTierOfPart(part)) problems.push('tier must be a whole number from 1, as its id says')
  if (!isRectInAtlas(part.rect, atlas)) problems.push('rect must be a non-empty area in the atlas')
  if (!isPositivePair(part.sizeM)) problems.push('sizeM must be two sizes above 0')
  if (!isPivotInside(part.pivotM, part.sizeM)) problems.push('pivotM must lie inside sizeM')
  if (!isFinitePair(part.atM)) problems.push('atM must be two numbers')
  if (!Number.isSafeInteger(part.z)) problems.push('z must be a whole number')
  return problems.map((problem) => `part "${part.id}" ${problem}`)
}

function isTierOfPart(part: SidecarPart): boolean {
  const named = tierOfPartId(part.id)
  return Number.isSafeInteger(part.tier) && part.tier >= 1 && (named ?? part.tier) === part.tier
}

function isAtlasSize(atlas: Pair): boolean {
  return atlas.length === 2 && atlas.every(isAtlasSide)
}

/** A power of two no larger than the cap (#38 and the MDN texture limits #52 cites). */
export function isAtlasSide(side: number): boolean {
  return (
    Number.isSafeInteger(side) && side > 0 && side <= ART_RULES.maxAtlasPx && isPowerOfTwo(side)
  )
}

function isPowerOfTwo(value: number): boolean {
  let side = 1
  while (side < value) side *= 2
  return side === value
}

function isRectInAtlas(rect: SidecarPart['rect'], [width, height]: Pair): boolean {
  const [x, y, w, h] = rect
  const isWhole = rect.length === 4 && rect.every((value) => Number.isSafeInteger(value))
  return isWhole && x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= width && y + h <= height
}

function isFinitePair(pair: Pair): boolean {
  return pair.length === 2 && pair.every((value) => Number.isFinite(value))
}

function isPositivePair(pair: Pair): boolean {
  return isFinitePair(pair) && pair.every((value) => value > 0)
}

function isPivotInside(pivot: Pair, size: Pair): boolean {
  return isFinitePair(pivot) && pivot.every((value, axis) => value >= 0 && value <= size[axis])
}

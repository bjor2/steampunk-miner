/**
 * What a placeholder asset draws (#52 "Placeholders", #51 consequences): flat-coloured quads with
 * the part ids, sizes, pivots and draw order of its checked-in sidecar, so code and tests never
 * wait on art. An asset id with no manifest entry or no placeholder sidecar still draws: one 1 m
 * quad in the missing-art colour, which nobody can mistake for finished art.
 */
import { slotOfPartId } from './artIds'
import { manifestEntryOf, placeholderSidecarOf } from './artCatalogue'
import type { ManifestEntry } from './assetManifest'
import type { Pair, SidecarPart } from './partsSidecar'

export interface PlaceholderQuad {
  partId: string
  /** The quad's centre in the asset's frame, metres. */
  centre: Pair
  size: Pair
  z: number
  colour: string
}

/** The classic missing-texture magenta. */
export const MISSING_ART_COLOUR = '#ff00ff'

const MISSING_ART_SIZE: Pair = [1, 1]

/** The quads an asset shows at a visual tier, lowest draw order first. */
export function placeholderQuadsOf(assetId: string, tier: number): PlaceholderQuad[] {
  const entry = manifestEntryOf(assetId)
  const sidecar = placeholderSidecarOf(assetId)
  if (entry === null || sidecar === null) return [missingArtQuadOf(assetId)]
  return partsShownAtTier(sidecar.parts, tier).map((part) =>
    quadOfPart(part, colourOf(entry, part)),
  )
}

/**
 * The parts shown at a tier: for each slot the part of the highest tier not above it, so tier 2
 * adds or replaces parts and keeps the rest of tier 1 (#52, #44 "show the parts for tier N").
 * Past the last authored tier the vehicle stays at its last look.
 */
export function partsShownAtTier(parts: readonly SidecarPart[], tier: number): SidecarPart[] {
  const bySlot = new Map<string, SidecarPart>()
  for (const part of parts.filter((candidate) => candidate.tier <= tier)) {
    const shown = bySlot.get(slotOfPartId(part.id))
    if (shown === undefined || part.tier > shown.tier) bySlot.set(slotOfPartId(part.id), part)
  }
  return [...bySlot.values()].sort(byDrawOrder)
}

function byDrawOrder(a: SidecarPart, b: SidecarPart): number {
  return a.z - b.z || a.id.localeCompare(b.id)
}

/** A part's pivot sits at `atM`, `pivotM` from its bottom-left corner. */
function quadOfPart(part: SidecarPart, colour: string): PlaceholderQuad {
  const [width, height] = part.sizeM
  const centre: Pair = [
    part.atM[0] - part.pivotM[0] + width / 2,
    part.atM[1] - part.pivotM[1] + height / 2,
  ]
  return { partId: part.id, centre, size: part.sizeM, z: part.z, colour }
}

function colourOf(entry: ManifestEntry, part: SidecarPart): string {
  return entry.partColors?.[part.id] ?? entry.color ?? MISSING_ART_COLOUR
}

function missingArtQuadOf(assetId: string): PlaceholderQuad {
  return {
    partId: assetId,
    centre: [0, 0],
    size: MISSING_ART_SIZE,
    z: 0,
    colour: MISSING_ART_COLOUR,
  }
}

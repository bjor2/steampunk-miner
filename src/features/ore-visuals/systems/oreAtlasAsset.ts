/**
 * The ore atlases as one shipped Blender asset (#144, the TD's #151 budgets): `ground-ore-atlas`,
 * a `parts` asset whose 240 parts are the atlas cells, one per family x variant x grade, so the
 * kernel's asset lint checks the three 4096 KTX2 maps and their `parts.json` sidecar like any
 * other export, and the atlas renderer to come reads a cell's rect from the sidecar it already
 * knows how to read. The slice registers the id and its part ids (#214 `r.artAssets`); the bake
 * (docs/art/ores/assemble_atlas.py) writes the sidecar from the same cell table, and a spec pins
 * the shipped sidecar to this module's parts.
 */
import { pxPerMetreOf } from '../../../systems/art/artIds'
import type { SidecarPart } from '../../../systems/art/partsSidecar'
import type { ArtAsset } from '../../../systems/registries/artAssets'
import { oreAtlasCellsOf, type OreAtlasCell } from './oreAtlasLayout'
import type { OreLooks } from './oreFamilyLooks'

export const ORE_ATLAS_ASSET_ID = 'ground-ore-atlas'

const ORE_ATLAS_CATEGORY = 'ground'

/** A cell drawn flat on the ground plane, so the whole content square is one tile. */
const Z_ON_GROUND = 0
const TIER_UNTIERED = 1

/** `<family>-v<variant>-g<grade>`: the bake tile's stem, the Blender collection and the part. */
export function oreAtlasPartIdOf(cell: OreAtlasCell): string {
  return `${cell.familyId}-v${cell.variant}-g${cell.grade}`
}

/** What the slice registers: the atlas id under the ground category and every cell as a part. */
export function oreAtlasArtAssetOf(looks: OreLooks): ArtAsset {
  return {
    id: ORE_ATLAS_ASSET_ID,
    category: ORE_ATLAS_CATEGORY,
    parts: oreAtlasCellsOf(looks).map(oreAtlasPartIdOf),
  }
}

/** The sidecar parts the bake must write: each cell's content rect, one metre square-ish. */
export function oreAtlasSidecarPartsOf(looks: OreLooks): SidecarPart[] {
  return oreAtlasCellsOf(looks).map((cell) => sidecarPartOf(looks, cell))
}

function sidecarPartOf(looks: OreLooks, cell: OreAtlasCell): SidecarPart {
  const side = looks.atlas.contentPx / pxPerMetreOf(ORE_ATLAS_CATEGORY)
  return {
    id: oreAtlasPartIdOf(cell),
    tier: TIER_UNTIERED,
    rect: cell.rectPx,
    sizeM: [side, side],
    pivotM: [side / 2, side / 2],
    atM: [0, 0],
    z: Z_ON_GROUND,
  }
}

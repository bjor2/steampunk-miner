/**
 * The art of the SS2 biome looks (ticket 778, spec #774): for each of the palette's eight looks
 * (`palette.json`, P&N's lock of 23 Oct), the colours a planet wearing it is drawn in and the tile
 * that carries its ground motif. The colours are one row per look in `lookArt.json`, in the shape
 * of a planet row's look (ticket 653, `planetRow.ts` `PlanetLook`: band 1 and band 5 rock, the
 * horizon, the sky band), so the kernel seam that one day hands a later system's planet its look
 * can take a row as it is. The motif is a Blender-authored `tile` asset, `ground-look-<look>`,
 * 4 x 4 m like the strata tiles, authored at the look's surface rock (`docs/art/ss2-looks`); the
 * slice registers the eight ids so the manifest lint and the export know them (#214).
 *
 * Read once, refused whole with every problem listed (`lookArtGuards.ts`). Look only: no price,
 * gate or income reads it, and nothing here reaches the authority state, a save or a digest.
 * Nothing draws a later system's look yet; `planetRow` is keyed on the planet index alone.
 */
import type { ArtAsset } from '../../../../systems/registries/artAssets'
import type { PlanetLook } from '../../../../systems/registries/planetRow'
import lookArtFile from '../../lookArt.json'
import { ARCHETYPE_PALETTE, type BiomeLook } from '../paletteRows'
import { lookArtProblems } from './lookArtGuards'

export interface LookArt {
  /** The palette look this is the art of. */
  lookId: string
  /** The `tile` asset carrying the look's ground motif, under `public/assets/ground/`. */
  tileAssetId: string
  /** The colours a planet wearing the look is drawn in, as a planet row's look. */
  look: PlanetLook
}

const TILE_ASSET_PREFIX = 'ground-look-'

/** The ground tile of a look: `ground-look-<look>`, kebab-case under the ground category (#52). */
export function lookTileAssetIdOf(lookId: string): string {
  return `${TILE_ASSET_PREFIX}${lookId}`
}

/** The look whose tile an asset is, or null for another asset. */
export function lookIdOfTileAsset(assetId: string): string | null {
  return assetId.startsWith(TILE_ASSET_PREFIX) ? assetId.slice(TILE_ASSET_PREFIX.length) : null
}

export function loadLookArt(rows: unknown, looks: readonly BiomeLook[]): LookArt[] {
  const problems = lookArtProblems(
    rows,
    looks.map((look) => look.id),
  )
  if (problems.length > 0) throw new Error(`lookArt.json is refused:\n${problems.join('\n')}`)
  return looks.map((look) => lookArtFrom(look.id, (rows as Record<string, PlanetLookRow>)[look.id]))
}

/** A row as the file writes it: the kernel look without its ribbon. */
interface PlanetLookRow {
  rockSurface: string
  rockDeep: string
  horizon: string
  skyBand: { colour: string; heightM: number; thicknessM: number; flicker: number }
}

function lookArtFrom(lookId: string, row: PlanetLookRow): LookArt {
  return {
    lookId,
    tileAssetId: lookTileAssetIdOf(lookId),
    look: {
      rockSurface: row.rockSurface,
      rockDeep: row.rockDeep,
      horizon: row.horizon,
      // The kernel's procedural curtains draw the band until a ribbon is drawn for it (ticket 653).
      skyBand: { ...row.skyBand, ribbon: null },
    },
  }
}

export const LOOK_ART: readonly LookArt[] = loadLookArt(lookArtFile.looks, ARCHETYPE_PALETTE.looks)

/** The art of a palette look; null for an id the palette lacks. */
export function lookArtOf(lookId: string): LookArt | null {
  return LOOK_ART.find((art) => art.lookId === lookId) ?? null
}

/** The eight tiles' art, joining the kernel's #51 inventory (#214). */
export function lookTileArtAssets(): ArtAsset[] {
  return LOOK_ART.map((art) => ({ id: art.tileAssetId, category: 'ground' }))
}

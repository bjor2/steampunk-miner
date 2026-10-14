/**
 * The ground as the hazard strip reads it (TD scope g on #316, ticket 341), one method per cost
 * tier, so the sampler never knows where the answers come from: the planet's seed and edit log in
 * the game (`seededStripGround.ts`), a drawn line of fixtures in a spec.
 */
import type { TilePoint } from '../../world/tileGrid'
import type { StripHit } from './stripHits'

export interface StripGround {
  /** Metres from the planet's centre to its surface: the path stops where it leaves the disc. */
  radiusMetres: number
  /** Changes whenever the chunk's edits do (its delta's version), so a cached read is redone. */
  chunkVersionOf(cx: number, cy: number): number
  /** Tier 1: the tile as it stands now, exact, written into `out`. */
  readTile(tile: TilePoint, out: StripHit): void
  /** Tier 3: what the lattice block holding the tile may hold; never fewer kinds than it holds. */
  blockKindsAt(tile: TilePoint): number
  /** Tier 4: what the tile's band may hold; never fewer kinds than it holds. */
  bandKindsAt(tile: TilePoint): number
}

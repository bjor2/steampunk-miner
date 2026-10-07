/**
 * Which gate a cell shows in the ground (docs/standards/feature-slices.md 3.33, ticket 298): the
 * `mining-gates` slice provides it; with no provider no cell carries a gate and the terrain draws
 * as it did before the channel. Render-only: the answer is a pure read of the planet and the cell,
 * never of a player, so a chunk is rebuilt only when its cells change.
 */
import type { CellGateLook } from '../render/cellGateBits'
import type { Rgb } from '../render/colour'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { defineOneProviderRegistry, entriesOf } from './seal'

export interface CellGateLookProvider {
  id: string
  /**
   * The gate `cell` at `tile` shows, or null. The tile is asked with the cell because a gate
   * hangs on the band the cell lies in (#142 "Which cells are gated"). `tile` is the mesher's
   * scratch point, rewritten for the next tile: read it, never keep it.
   */
  cellGateLookOf(params: PlanetParams, cell: number, tile: TilePoint): CellGateLook | null
  /** The planet's marker tint (#151 act theme), or null to draw markers untinted. */
  markerTintOf(params: PlanetParams): Rgb | null
}

export const CELL_GATE_LOOK_REGISTRY =
  defineOneProviderRegistry<CellGateLookProvider>('cellGateLook')

/** The registered provider, or null: no gate draws. */
export function cellGateLookProvider(): CellGateLookProvider | null {
  const [provider] = entriesOf(CELL_GATE_LOOK_REGISTRY)
  return provider ?? null
}

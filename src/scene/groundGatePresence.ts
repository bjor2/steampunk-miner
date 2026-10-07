/**
 * What the ground's gate markers draw now (ticket 299), for the debug reads that check them
 * against the lock marker in e2e: the viewer and the act tint the terrain material was last given,
 * and the chunk pool's read of a drawn tile's gate bits. Written by `terrainGateViewer`,
 * `terrainGateTint` and `PlanetTerrain`; a mutable registry, because the viewer is rewritten every
 * frame and never goes through React or the store.
 */
import type { Rgb } from '../systems/render/colour'
import type { GateViewer } from '../systems/render/gatePatterns'
import type { TilePoint } from '../systems/world/tileGrid'

/** A drawn tile's gate bits, or null where no tile is drawn now. */
export type DrawnGateBitsRead = (tile: TilePoint) => number | null

/** With no terrain mounted, no tile is drawn. */
export const NO_DRAWN_GROUND: DrawnGateBitsRead = () => null

export const groundGatePresence: {
  viewer: GateViewer
  tint: Rgb
  gateBitsAt: DrawnGateBitsRead
} = {
  viewer: { tipMajor: 0, isMotionReduced: false },
  tint: [0, 0, 0],
  gateBitsAt: NO_DRAWN_GROUND,
}

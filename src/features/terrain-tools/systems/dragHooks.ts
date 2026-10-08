/**
 * The ore-shifter's item hook consult (GD lock on #206, TD ruling; ticket 326): a combo answers the
 * shifter's `dragTarget` point through the kernel registry, so this lane imports no other slice.
 *
 * The hook ranks only the ore cells the drag may move when the plan opens (loose ore in reach: no
 * gate verdict but `cut`, no core, no anchor, no casing), so it changes which nodules are dragged
 * and never how many: the Mark's count and the activation's 32-cell / 64-swap cap still stop the
 * drag, every move is still a swap onto plain ground, and no air is made. Ties keep the shifter's
 * seeded nearest-first order, so with nothing registered the drag is exactly as before.
 */
import { rankedCandidatesOf } from '../../../systems/registries/itemHooks'
import type { TilePoint } from '../../../systems/world/tileGrid'
import type { EditKey } from './editSeed'
import { isLooseOre, type GroundView } from './groundView'

/** The loose ore among `tiles` (nearest first), highest summed `dragTarget` score first. */
export function oreInDragOrder(
  view: GroundView,
  key: EditKey,
  count: number,
  tiles: readonly TilePoint[],
): TilePoint[] {
  return rankedCandidatesOf(view.state, view.playerId, {
    point: 'dragTarget',
    parentItemId: key.itemId,
    ctx: {
      tick: key.tick,
      mark: key.mark,
      magnitude: count,
      origin: key.origin,
      candidates: tiles.filter((tile) => isLooseOre(view, tile)),
    },
  })
}

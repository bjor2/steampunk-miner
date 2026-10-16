/**
 * The fire tile's touch bindings (#474, the HS decision on #470): the bore gun and its shoring shot
 * (the cementing round, ticket 369) both fire from the tile, whose drag aims and whose tap fires
 * along the facing, as the fire key does. The tile shows nothing until the gun is mounted.
 */
import type { TouchBindingRow } from '../../../ui/registries/touchBindings'
import { BORE_GUN_SCHEDULE_ROW } from '../systems/boreGunContent'
import { CEMENTING_ROUND_ITEM_ID } from '../systems/boreGunLane'
import { FIRE_ACTION } from '../store/fireInput'
import { FireTile } from './FireTile'

const FIRE_TILE_TOUCH = { gesture: 'drag', action: FIRE_ACTION, tapPath: FIRE_ACTION } as const

export const FIRE_TOUCH_BINDINGS: readonly TouchBindingRow[] = [
  {
    id: 'ground-gun.bore_gun',
    anchor: { row: BORE_GUN_SCHEDULE_ROW },
    touch: FIRE_TILE_TOUCH,
    Tile: FireTile,
  },
  {
    id: 'ground-gun.cementing_round',
    anchor: { row: CEMENTING_ROUND_ITEM_ID },
    touch: FIRE_TILE_TOUCH,
    Tile: FireTile,
  },
]

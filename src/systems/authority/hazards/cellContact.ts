/** One cell's hazard contact as the cut met it (ticket 848): the cell, its row and its factor. */
import type { ContactEffect, ContactEffectRow, ContactRowOf } from '../../registries/contactEffects'
import type { TilePoint } from '../../world/tileGrid'

export interface CellContact<E extends ContactEffect = ContactEffect> {
  tile: TilePoint
  row: E extends ContactEffect ? ContactRowOf<E> : ContactEffectRow
  /** The row's factor with any tool's hook on top, above 0. */
  factorBp: number
}

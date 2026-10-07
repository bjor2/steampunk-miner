/**
 * Slice pieces of the local vehicle (#235, the #166 seam; after the world pieces of #175):
 * `Vehicle` draws every registered piece, sorted by id, inside the vehicle's body frame, so a
 * slice bolts its gear onto the car without editing the kernel's vehicle. With none registered
 * the vehicle is today's.
 *
 * A `Piece` takes no props. It reads the store's local vehicle or its own slice state and places
 * art at the base vehicle's attach points with `MountedParts` (`scene/MountedParts.tsx`), never at
 * an offset of its own (TD acceptance 6 on #166). Render-only: it never writes the authority
 * state, and what it draws enters no snapshot or digest.
 */
import type { ComponentType } from 'react'
import { defineRegistry, entriesOf } from '../../systems/registries/seal'

export interface VehiclePiece {
  id: string
  Piece: ComponentType
}

export const VEHICLE_PIECE_REGISTRY = defineRegistry<VehiclePiece>('vehiclePieces')

/** Every registered piece, sorted by id. */
export function vehiclePieces(): readonly VehiclePiece[] {
  return entriesOf(VEHICLE_PIECE_REGISTRY)
}

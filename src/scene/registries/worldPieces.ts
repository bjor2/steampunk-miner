/**
 * Slice pieces of the world scene (#175, after the HUD panels of feature-slices.md 3.14): each
 * layer draws its pieces where `GameScene` puts the layer, so a slice adds scene markup without
 * editing the scene. A piece reads the store or its own slice state and takes no props.
 */
import type { ComponentType } from 'react'
import { defineRegistry, entriesOf } from '../../systems/registries/seal'

/** `platform`: on the dock pad, behind the vehicle and the enemies, in front of the tiles. */
export type WorldLayer = 'platform'

export interface WorldPiece {
  id: string
  layer: WorldLayer
  Piece: ComponentType
}

export const WORLD_PIECE_REGISTRY = defineRegistry<WorldPiece>('worldPieces')

/** The layer's pieces, sorted by id. */
export function worldPiecesOf(layer: WorldLayer): readonly WorldPiece[] {
  return entriesOf(WORLD_PIECE_REGISTRY).filter((piece) => piece.layer === layer)
}

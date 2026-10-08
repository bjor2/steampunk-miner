/**
 * The domain events the terrain lane adds (feature-slices.md 3.15), by augmentation, never by
 * editing the kernel's lists. `power-up-core` already logs every use; these say what the use did to
 * the ground: the edit it queued (#162 section 2.4 `terrain_edit`), where a lodestone beacon
 * was planted, and what a terrain magnet's use moved (GD lock on #246, `magnet_used`).
 *
 * Every event names its player: a use acts on the authority clock, and the lodestone's gather on a
 * dock reaction, so neither carries a command stamp of its own.
 */
import type { DomainEventBodies } from '../../../systems/authority/domainEvent'
import type { MagnetVerb } from './magnetItems'

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    /** One activation's whole edit, queued on the K6 terrain-edit queue on its activation tick. */
    'terrain-tools.TerrainEdited': {
      playerId: string
      itemId: string
      mark: number
      originTx: number
      originTy: number
      /** Cells the edit changes: at most 32 density cells or 64 swaps, 256 for a lodestone. */
      cellsChanged: number
      chunksTouched: number
      /** The edit's cells hashed in order, so a replay can prove it named the same ones. */
      editHash: string
    }
    /** A lodestone beacon now waits at this tile for its owner's next dock. */
    'terrain-tools.BeaconPlanted': {
      playerId: string
      tx: number
      ty: number
      plantedTick: number
    }
    /**
     * A terrain magnet acted: the cells it moved through the kernel's magnet shift (#283) and the
     * energy those moves cost, in quanta. A repulsor wave that pushed only enemies moved no cell.
     */
    'terrain-tools.MagnetUsed': {
      playerId: string
      itemId: string
      verb: MagnetVerb
      cellsMoved: number
      energy: number
    }
  }
}

/** Why a terrain tool found nothing to act on (`power_up_refused.reason`): nothing is spent. */
export const TERRAIN_REFUSAL = {
  nothingToDrag: 'terrain-tools.nothing_to_drag',
  noGrain: 'terrain-tools.no_grain',
  nothingToOpen: 'terrain-tools.nothing_to_open',
  beaconLive: 'terrain-tools.beacon_live',
  nothingToPush: 'terrain-tools.nothing_to_push',
  outOfPlay: 'terrain-tools.out_of_play',
} as const

export type TerrainEditedBody = DomainEventBodies['terrain-tools.TerrainEdited']

export function terrainEditedOf(body: TerrainEditedBody) {
  return { type: 'terrain-tools.TerrainEdited' as const, ...body }
}

export function beaconPlantedOf(playerId: string, tx: number, ty: number, plantedTick: number) {
  return { type: 'terrain-tools.BeaconPlanted' as const, playerId, tx, ty, plantedTick }
}

export type MagnetUsedBody = DomainEventBodies['terrain-tools.MagnetUsed']

export function magnetUsedOf(body: MagnetUsedBody) {
  return { type: 'terrain-tools.MagnetUsed' as const, ...body }
}

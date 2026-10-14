/**
 * The Breaker branch's controlled fracture (GD lock on #255, ticket 269): every charge its player
 * blasts cracks the plain ground just past the charge's reach. A blast effect (feature-slices.md
 * 3.7): it runs on the detonation tick, before the blast's own ground breaks, and queues one
 * density edit on the K6 queue, so the fractured cells open on the next terrain passes like any
 * terrain tool's and are logged as its `terrain_edited`.
 *
 * Which cells: those whose centres lie past the charge's radius and within `ringTiles` more of
 * the blast's tile, nearest first (ties to the upper row, then the left column), that are plain
 * ground the blaster's drill could cut, off every anchor and casing. Ore, gated and core cells
 * stand, so a fracture never frees ore the bit has not cut. At most the Breaker's Mark magnitude,
 * and never past the TD's per-activation cap. It leans on the `blasting_charges` row, so nothing
 * fractures before that row's `FeatureUnlocked`.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import { isFeatureUnlocked } from '../../../systems/authority/featureUnlocks'
import type { BlastEffect, BlastEvent } from '../../../systems/registries/blastEffects'
import { MM_PER_METRE } from '../../../constants/physics'
import type { TerrainCellEdit } from '../../../systems/authority/terrain/terrainEdits'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { ACTIVATION_UNIT_CAP, canAfford, draftOpen, OPEN_UNITS, openDraft } from './editDraft'
import { isDrillableGround, openGroundView, type GroundView } from './groundView'
import { editSourceOf, queueEditOf } from './terrainOutcome'
import {
  branchMarkOf,
  BREAKER_FUSE,
  breakerFractureCellsOf,
  TERRAIN_FORK_BALANCE,
  type BreakerBalance,
} from './terrainFork'

/** The schedule row the Breaker leans on: no blast, nothing to fracture, before it opens. */
export const BREAKER_ROW = 'blasting_charges'

export const BREAKER_FRACTURE: BlastEffect = {
  id: 'terrain-tools.breaker-fracture',
  apply: (state, blast) => fractureAfterBlast(state, blast),
}

/** The blaster's fracture queued; the state unchanged without the Breaker or a cell to crack. */
export function fractureAfterBlast(state: AuthorityState, blast: BlastEvent): RuleEffect {
  const cells = breakerFractureCellsOf(state, blast.playerId)
  if (cells === null || !isFeatureUnlocked(state, BREAKER_ROW)) return unchanged(state)
  const fracture = fractureCellsOf(state, blast, cells)
  if (fracture.length === 0) return unchanged(state)
  return queueEditOf(state, authorOf(state, blast), fracture)
}

/** The cells one blast cracks, nearest the blast first, at most `cells` and the activation cap. */
export function fractureCellsOf(
  state: AuthorityState,
  blast: BlastEvent,
  cells: number,
  balance: BreakerBalance = TERRAIN_FORK_BALANCE.breaker,
): TerrainCellEdit[] {
  const view = openGroundView(state, blast.playerId, editSourceOf(BREAKER_FUSE))
  if (view === null) return []
  return openedRingOf(view, ringTilesOf(blast, balance.ringTiles), cells)
}

function openedRingOf(view: GroundView, ring: readonly TilePoint[], cells: number) {
  const draft = openDraft(view, ACTIVATION_UNIT_CAP)
  for (const tile of ring) {
    if (draft.cells.length >= cells || !canAfford(draft, OPEN_UNITS)) break
    if (isDrillableGround(view, tile)) draftOpen(draft, tile)
  }
  return draft.cells
}

/**
 * The tiles whose centres lie past the charge's radius and within `ringTiles` more of the blast
 * tile's centre, nearest first, then the upper row, then the left column.
 */
export function ringTilesOf(blast: BlastEvent, ringTiles: number): TilePoint[] {
  const outerMm = blast.radiusMm + ringTiles * MM_PER_METRE
  const reach = Math.ceil(outerMm / MM_PER_METRE)
  const ring: { tile: TilePoint; distanceSq: number }[] = []
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const distanceSq = (dx * dx + dy * dy) * MM_PER_METRE * MM_PER_METRE
      if (isInRing(distanceSq, blast.radiusMm, outerMm)) {
        ring.push({ tile: { tx: blast.tx + dx, ty: blast.ty + dy }, distanceSq })
      }
    }
  }
  return ring.sort(compareNearestFirst).map(({ tile }) => tile)
}

function isInRing(distanceSq: number, innerMm: number, outerMm: number): boolean {
  return distanceSq > innerMm * innerMm && distanceSq <= outerMm * outerMm
}

function compareNearestFirst(
  a: { tile: TilePoint; distanceSq: number },
  b: { tile: TilePoint; distanceSq: number },
): number {
  return a.distanceSq - b.distanceSq || b.tile.ty - a.tile.ty || a.tile.tx - b.tile.tx
}

function authorOf(state: AuthorityState, blast: BlastEvent) {
  return {
    playerId: blast.playerId,
    itemId: BREAKER_FUSE,
    mark: branchMarkOf(state, blast.playerId, BREAKER_FUSE),
    origin: { tx: blast.tx, ty: blast.ty },
  }
}

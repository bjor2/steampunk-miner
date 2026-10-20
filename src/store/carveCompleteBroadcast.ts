/**
 * Hands the client's "cell fully carved" moments (`systems/materialPop/carveWatch.ts`, ticket
 * 615) to whoever shows them: the pickup feedback cue here, the popup chips and option B's pop
 * through `listenForCarvedCells`. The store calls `followCarvedCells` with every batch the
 * authority answers, events or none, so a cell the drill stopped inside still finishes. Shaped
 * like `domainEventBroadcast.ts`: listeners only present, never write the store or submit, so a
 * carved cell changes no state or digest. The watch is the one writer of its module state.
 */
import type { DomainEvent } from '../systems/authority/domainEvent'
import { planetParamsOf } from '../systems/authority/planetOfState'
import {
  EMPTY_CARVE_WATCH,
  followCarves,
  withoutCarvingPickups,
  yieldEventsOf,
  type CarvedCell,
  type CarveWatch,
} from '../systems/materialPop/carveWatch'
import { cellDensitySum } from '../systems/world/cellYield'
import type { TilePoint } from '../systems/world/tileGrid'
import { readAuthorityState } from './authorityLink'
import { announceFeedback } from './feedbackBroadcast'

export type CarvedCellListener = (cells: readonly CarvedCell[], playerId: string) => void

const listeners = new Set<CarvedCellListener>()
let watch: CarveWatch = EMPTY_CARVE_WATCH

/** Returns the call that stops listening. */
export function listenForCarvedCells(listener: CarvedCellListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** A new or restored session watches no cell of the last one. */
export function forgetCarveWatch(): void {
  watch = EMPTY_CARVE_WATCH
}

/** One answered batch: the cells it finished sound their pickups and go to the listeners. */
export function followCarvedCells(events: readonly DomainEvent[], playerId: string): void {
  const carved = carvedCellsOf(events, playerId)
  if (carved.length === 0) return
  announceFeedback(yieldEventsOf(carved), playerId)
  listeners.forEach((listener) => listener(carved, playerId))
}

function carvedCellsOf(events: readonly DomainEvent[], playerId: string): CarvedCell[] {
  const state = readAuthorityState()
  const params = planetParamsOf(state.planet)
  if (params === null) return []
  const densitySumOf = (tile: TilePoint) => cellDensitySum(state.world, params, tile)
  const batch = {
    events,
    tick: state.tick,
    planetIndex: state.planet.index,
    playerId,
    densitySumOf,
  }
  const turn = followCarves(watch, batch)
  watch = turn.watch
  return turn.carved
}

/** A batch's feedback cues, the drill's units held back to sound when their cells are carved. */
export function announceBatchFeedback(events: readonly DomainEvent[], playerId: string): void {
  announceFeedback(withoutCarvingPickups(events, playerId), playerId)
}

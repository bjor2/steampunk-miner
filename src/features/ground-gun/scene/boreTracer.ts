/**
 * The bore gun's tracer (ticket 314, the TD kernel lock on #314 section 4): heard from the
 * authority's events and thrown through the kernel's `requestSpray`, which the always-on
 * `SprayLayer` draws whatever slices are loaded, so the tracer shows at P1 with no dynamite. The
 * local rig's shot throws sparks from where it is drawn now; every cell a bore opens throws its
 * debris and dust onward from that rig. Visual only: the cell and its ore never wait on it.
 */
import { drillPresence } from '../../../scene/drillPresence'
import { vehiclePresence } from '../../../scene/vehiclePresence'
import { requestSpray } from '../../../store/sprayRequests'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { createSprayScratch, writeCellSpray, writeMuzzleSpray } from '../systems/render/boreSpray'
import { FIRE_TILE_FEEL } from '../systems/render/fireTileFeel'

/** One request reused for every piece: `requestSpray` reads it at once and never keeps it. */
const scratch = createSprayScratch()

/** A `listenForDomainEvents` listener. */
export function throwBoreTracer(events: readonly DomainEvent[], playerId: string): void {
  events.forEach((event) => throwTracerOf(event, playerId))
}

function throwTracerOf(event: DomainEvent, playerId: string): void {
  if (event.type === 'BoreFired' && event.playerId === playerId) throwShotSparks(event.bearing)
  if (event.type === 'TileDestroyed' && event.cause === 'bore') throwCellPieces(event.tx, event.ty)
}

function throwShotSparks(bearing: number): void {
  const { sparksPerShot } = FIRE_TILE_FEEL.tracer
  requestSpray(writeMuzzleSpray(scratch, vehiclePresence, drillPresence.up, bearing, sparksPerShot))
}

function throwCellPieces(tx: number, ty: number): void {
  const { debrisPerCell, dustPerCell } = FIRE_TILE_FEEL.tracer
  requestSpray(writeCellSpray(scratch, 'debris', tx, ty, vehiclePresence, debrisPerCell))
  requestSpray(writeCellSpray(scratch, 'dust', tx, ty, vehiclePresence, dustPerCell))
}

/**
 * What the gate hints hear (ticket 238): the local player's stops at gated cells (`DrillGated`,
 * logged as `gate_hit`), the cells it freed (`mining-gates.GateCleared`), and the moments a new
 * dive starts (reaching the dock, entering a planet). A teammate's events never show, as with
 * #172's chips. Pure over the authority's event batches; writes nothing.
 */
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  addGateHitToBoard,
  startDiveOnBoard,
  type GateChipBoard,
  type GateHitAt,
} from './gateChipBoard'

type DrillGated = Extract<DomainEvent, { type: 'DrillGated' }>

const DIVE_STARTS: ReadonlySet<DomainEvent['type']> = new Set(['DockEntered', 'PlanetEntered'])

/** The board after one batch, in event order: a dive start clears it, a stop may show a chip. */
export function boardAfterEvents(
  board: GateChipBoard,
  events: readonly DomainEvent[],
  playerId: string,
): GateChipBoard {
  return events.reduce((next, event) => boardAfterEvent(next, event, playerId), board)
}

/** The local player's stops in the batch, in order. */
export function gateHitsOf(events: readonly DomainEvent[], playerId: string): GateHitAt[] {
  return events.filter(isDrillGated).filter(isLocal(playerId)).map(gateHitAtOf)
}

/** Whether the batch freed a gated cell of the local player's. */
export function hasClearedGate(events: readonly DomainEvent[], playerId: string): boolean {
  return events.some(
    (event) => event.type === 'mining-gates.GateCleared' && isLocal(playerId)(event),
  )
}

function boardAfterEvent(board: GateChipBoard, event: DomainEvent, playerId: string) {
  if (!isLocal(playerId)(event)) return board
  if (DIVE_STARTS.has(event.type)) return startDiveOnBoard()
  return isDrillGated(event) ? addGateHitToBoard(board, gateHitAtOf(event)) : board
}

function gateHitAtOf(event: DrillGated): GateHitAt {
  const { gateKind, outcome, required, have, tx, ty, tick } = event
  return { gateKind, outcome, required, have, tx, ty, tick }
}

function isDrillGated(event: DomainEvent): event is DrillGated {
  return event.type === 'DrillGated'
}

/** The local player's event, or a playerless one (a planet entered is everyone's). */
function isLocal(playerId: string) {
  return (event: DomainEvent) => event.playerId === undefined || event.playerId === playerId
}

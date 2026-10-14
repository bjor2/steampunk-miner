/**
 * What a fork re-choice asks of the Works turntable (GD lock on #255, G&V's feel rule; ticket
 * 270): the platform swaps the branch's parts with the #177 turntable beat, not a menu flash. The
 * request names the new branch's piece and the turn that faces it to the camera; the workshop's
 * showcase, the turntable's one driver, eases there, holds and hands back. A re-choice made where
 * no showcase is up asks for nothing anyone plays. Render-only, read from the answering events.
 */
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import type { AttachId } from '../../../../systems/registries/vehicleAttach'
import type { TechLane } from '../techNode'
import { forkMountsOf, forkPieceOf, FORK_PIECES, type ForkPiece } from './forkPieces'

/** The turntable beat a re-choice asks for, from the tick the authority answered it. */
export interface ForkTurntableRequest {
  lane: TechLane
  branch: string
  /** Where the new branch's first piece hangs: the part the beat faces to the camera. */
  attachId: AttachId
  faceTurnRadians: number
  tick: number
}

type ForkRechosen = Extract<DomainEvent, { type: 'tech-tree.ForkRechosen' }>

/** One request per re-choice the player made in the batch, in order; none for other players. */
export function forkTurntableRequestsOf(
  events: readonly DomainEvent[],
  playerId: string,
  pieces: readonly ForkPiece[] = FORK_PIECES,
): ForkTurntableRequest[] {
  return events
    .filter((event): event is ForkRechosen => isRechoiceBy(event, playerId))
    .flatMap((event) => requestOf(event, pieces))
}

function isRechoiceBy(event: DomainEvent, playerId: string): boolean {
  return event.type === 'tech-tree.ForkRechosen' && event.playerId === playerId
}

function requestOf(event: ForkRechosen, pieces: readonly ForkPiece[]): ForkTurntableRequest[] {
  const piece = forkPieceOf(event.lane, event.to, pieces)
  const [mount] = forkMountsOf(event.lane, event.to, pieces)
  if (piece === null || mount === undefined) return []
  const { lane, faceTurnRadians } = piece
  return [{ lane, branch: event.to, attachId: mount.attachId, faceTurnRadians, tick: event.tick }]
}

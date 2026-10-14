/**
 * What one client's sensing panels and layer show at a tick (#203): the reveal board with its
 * run-out pings gone and its buoy rings re-pinged, and the passives read a few times a second,
 * not every frame, since a lens read walks a sight line to every cell in its ring. A new planet or
 * a clock that went back (a restored or restarted session) starts from nothing and reads at once.
 * An unchanged board or reading keeps its object, so a panel renders only when what it shows
 * changed.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { NO_PASSIVE_READS, passiveReadsOf, type PassiveReads } from './passiveReads'
import { boardAt, EMPTY_REVEAL_BOARD, type RevealBoard } from './revealBoard'

export interface SensingView {
  board: RevealBoard
  passives: PassiveReads
  /** The tick the passives were last read on. */
  readTick: number
  planetIndex: number
}

/** Six reads a second at 60 ticks a second. */
export const PASSIVE_READ_EVERY_TICKS = 10

export const EMPTY_SENSING_VIEW: SensingView = {
  board: EMPTY_REVEAL_BOARD,
  passives: NO_PASSIVE_READS,
  readTick: 0,
  planetIndex: 0,
}

export function sensingViewAt(
  view: SensingView,
  state: AuthorityState,
  playerId: string,
  tick: number,
): SensingView {
  const kept = isStale(view, state, tick) ? freshViewOn(state, tick) : view
  return withPassivesRead(withBoardAt(kept, state, tick), state, playerId, tick)
}

function isStale(view: SensingView, state: AuthorityState, tick: number): boolean {
  return view.planetIndex !== state.planet.index || tick < view.readTick
}

function freshViewOn(state: AuthorityState, tick: number): SensingView {
  const readTick = tick - PASSIVE_READ_EVERY_TICKS
  return { ...EMPTY_SENSING_VIEW, planetIndex: state.planet.index, readTick }
}

function withBoardAt(view: SensingView, state: AuthorityState, tick: number): SensingView {
  const board = boardAt(view.board, state, tick)
  return board === view.board ? view : { ...view, board }
}

function withPassivesRead(
  view: SensingView,
  state: AuthorityState,
  playerId: string,
  tick: number,
): SensingView {
  if (tick - view.readTick < PASSIVE_READ_EVERY_TICKS) return view
  const passives = passiveReadsOf(state, playerId)
  const isSame = signatureOf(passives) === signatureOf(view.passives)
  return { ...view, passives: isSame ? view.passives : passives, readTick: tick }
}

/** Readings carry Money, which writes itself as its canonical string. */
function signatureOf(passives: PassiveReads): string {
  return JSON.stringify(passives)
}

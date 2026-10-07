/**
 * What one client shows of the sensing uses (#203, the TD lock on its Q1 and the GD's smaller
 * readings): the cells its own echo pings and flare maps mark, every buoy pin in the world, and
 * the rings those buoys re-ping. Derived from `PowerUpUsed` and pure reads of the authority state
 * on each client, never kept by the authority, so nothing reaches the digest. A reload or a late
 * joiner starts with an empty board; a flare's map lasts until the dock.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { droppedPinOf, pinAfterPasses, pinsWithBuoy, type BuoyPin } from './buoyPins'
import { echoMarksOf } from './echoPing'
import { flareLandingOf } from './flareMortar'
import { BUOY_PIN_CAP, REVEAL_MARK_CAP } from './revealBudget'
import {
  buoyRepingTicks,
  buoyRingTilesAt,
  echoRadiusTiles,
  echoRevealTicksAt,
  flareRadiusTilesAt,
  flareRangeTiles,
} from './revealReach'
import {
  marksAfterDock,
  marksAfterPing,
  marksShownAt,
  type RevealMark,
  type RevealPing,
} from './revealPing'
import { ECHO_SOUNDER, SIGNAL_BUOY, sensingUsesOf, type SensingUse } from './sensingUses'

export interface RevealBoard {
  marks: readonly RevealMark[]
  pins: readonly BuoyPin[]
}

export const EMPTY_REVEAL_BOARD: RevealBoard = { marks: [], pins: [] }

/** The board after a batch of events: its uses, then the trip's flare maps gone if it docked. */
export function boardAfterHeard(
  board: RevealBoard,
  events: readonly DomainEvent[],
  state: AuthorityState,
  localPlayerId: string,
): RevealBoard {
  const used = boardAfterUses(board, events, state, localPlayerId)
  return hasDockedIn(events, localPlayerId) ? boardAfterDock(used) : used
}

/** The board after a batch's uses: the local player's pings, and anyone's buoy. */
export function boardAfterUses(
  board: RevealBoard,
  events: readonly DomainEvent[],
  state: AuthorityState,
  localPlayerId: string,
): RevealBoard {
  return sensingUsesOf(events).reduce(
    (running, use) => boardAfterUse(running, use, state, localPlayerId),
    board,
  )
}

/** The board on `tick`: run-out pings gone, and a ring re-pinged where a vehicle came inside. */
export function boardAt(board: RevealBoard, state: AuthorityState, tick: number): RevealBoard {
  return boardAfterPasses(boardWithoutRunOutMarks(board, tick), state)
}

/** The local player docked: the trip's flare maps go. */
export function boardAfterDock(board: RevealBoard): RevealBoard {
  const marks = marksAfterDock(board.marks)
  return marks.length === board.marks.length ? board : { ...board, marks }
}

function hasDockedIn(events: readonly DomainEvent[], playerId: string): boolean {
  return events.some((event) => event.type === 'DockEntered' && event.playerId === playerId)
}

function boardAfterUse(
  board: RevealBoard,
  use: SensingUse,
  state: AuthorityState,
  localPlayerId: string,
): RevealBoard {
  if (use.itemId === SIGNAL_BUOY) return boardWithBuoy(board, use, state)
  if (use.playerId !== localPlayerId) return board
  return boardWithPing(board, pingOfUse(use, state))
}

function pingOfUse(use: SensingUse, state: AuthorityState): RevealPing {
  return use.itemId === ECHO_SOUNDER ? echoPingOf(use, state) : flareMapOf(use, state)
}

function echoPingOf(use: SensingUse, state: AuthorityState): RevealPing {
  return {
    centre: use.origin,
    marks: echoMarksOf(state, use.origin, echoRadiusTiles()),
    bornTick: use.tick,
    untilTick: use.tick + echoRevealTicksAt(use.mark),
  }
}

/** The ring round where the shell lands, mapped for the rest of the trip. */
function flareMapOf(use: SensingUse, state: AuthorityState): RevealPing {
  const landing = flareLandingOf(state, use.playerId, use.origin, flareRangeTiles())
  return {
    centre: landing,
    marks: echoMarksOf(state, landing, flareRadiusTilesAt(use.mark)),
    bornTick: use.tick,
    untilTick: null,
  }
}

/** The pin, and its ring pinged as it lands. */
function boardWithBuoy(board: RevealBoard, use: SensingUse, state: AuthorityState): RevealBoard {
  const pin = droppedPinOf(state, {
    tile: use.origin,
    ownerId: use.playerId,
    placedTick: use.tick,
    ringTiles: buoyRingTilesAt(use.mark),
  })
  const pinned = { ...board, pins: pinsWithBuoy(board.pins, pin, BUOY_PIN_CAP) }
  return boardWithPing(pinned, ringPingOf(pin, state, use.tick))
}

function ringPingOf(pin: BuoyPin, state: AuthorityState, tick: number): RevealPing {
  return {
    centre: pin.tile,
    marks: echoMarksOf(state, pin.tile, pin.ringTiles),
    bornTick: tick,
    untilTick: tick + buoyRepingTicks(),
  }
}

function boardWithPing(board: RevealBoard, ping: RevealPing): RevealBoard {
  return { ...board, marks: marksAfterPing(board.marks, ping, REVEAL_MARK_CAP) }
}

function boardWithoutRunOutMarks(board: RevealBoard, tick: number): RevealBoard {
  const marks = marksShownAt(board.marks, tick)
  return marks.length === board.marks.length ? board : { ...board, marks }
}

/** Each buoy a vehicle came inside re-pings its ring; an unchanged board comes back as it was. */
function boardAfterPasses(board: RevealBoard, state: AuthorityState): RevealBoard {
  const reads = board.pins.map((pin) => pinAfterPasses(state, pin))
  if (reads.every((read, at) => read.pin === board.pins[at])) return board
  return boardWithRingsPinged({ ...board, pins: reads.map((read) => read.pin) }, reads, state)
}

function boardWithRingsPinged(
  board: RevealBoard,
  reads: readonly { pin: BuoyPin; isPassed: boolean }[],
  state: AuthorityState,
): RevealBoard {
  const passed = reads.filter((read) => read.isPassed).map((read) => read.pin)
  return passed.reduce<RevealBoard>(
    (running, pin) => boardWithPing(running, ringPingOf(pin, state, state.tick)),
    board,
  )
}

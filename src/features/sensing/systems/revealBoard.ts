/**
 * What one client shows of the sensing uses (#203, the TD lock on its Q1 and the GD's smaller
 * readings): the cells its own echo pings and flare maps mark, every buoy pin in the world, and
 * the rings those buoys re-ping; each where and as far as its Mark milestone or link says (#256).
 * Derived from `PowerUpUsed` and pure reads of the authority state on each client, never kept by
 * the authority, so nothing reaches the digest. A reload or a late joiner starts with an empty board; a flare's map lasts until the dock. Inside a magnetic field
 * each reach is cut to the kernel's field share, read where the ping, map or ring is centred
 * (spec #258, ticket 290).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { sensingReachAt } from '../../../systems/authority/magnetic/sensingReach'
import { droppedPinOf, pinAfterPasses, pinsWithBuoy, type BuoyPin } from './buoyPins'
import { echoConeTilesOf, twistedDownOf } from './deepStriker'
import { divinerPingOf } from './divinerCone'
import { echoMarksOf, echoMarksOn } from './echoPing'
import { BUOY_PIN_CAP, REVEAL_MARK_CAP } from './revealBudget'
import { buoyRepingTicks } from './revealReach'
import {
  buoyRingOf,
  buoyTileOf,
  echoCentreOf,
  echoRadiusOf,
  echoUntilOf,
  flareLandingOfUse,
  flareRadiusOf,
} from './revealVerbs'
import {
  marksAfterDock,
  marksAfterPing,
  marksShownAt,
  type RevealMark,
  type RevealPing,
} from './revealPing'
import { ECHO_SOUNDER, SIGNAL_BUOY, sensingUsesOf, type SensingUse } from './sensingUses'
import { tilesWithin } from './tileDisc'

export interface RevealBoard {
  marks: readonly RevealMark[]
  pins: readonly BuoyPin[]
}

export const EMPTY_REVEAL_BOARD: RevealBoard = { marks: [], pins: [] }

/**
 * The board after a batch of events: its uses, the Diviner's read if the local drill cut (ticket
 * 269), then the trip's flare maps and Scout pings gone if it docked.
 */
export function boardAfterHeard(
  board: RevealBoard,
  events: readonly DomainEvent[],
  state: AuthorityState,
  localPlayerId: string,
): RevealBoard {
  const used = boardAfterUses(board, events, state, localPlayerId)
  const read = boardAfterCut(used, events, state, localPlayerId)
  return hasDockedIn(events, localPlayerId) ? boardAfterDock(read) : read
}

/**
 * The Diviner reads its cone once for the batch's last cell the local drill broke: every cut in a
 * batch reads the one state the batch left, so one read marks what each would.
 */
function boardAfterCut(
  board: RevealBoard,
  events: readonly DomainEvent[],
  state: AuthorityState,
  localPlayerId: string,
): RevealBoard {
  const cut = events.filter((event) => isCutBy(event, localPlayerId)).at(-1)
  const ping = cut === undefined ? null : divinerPingOf(state, localPlayerId, cut.tick)
  return ping === null ? board : boardWithPing(board, ping)
}

/** A cell the player's own drill broke: a blast, bore or edit names its cause. */
function isCutBy(event: DomainEvent, playerId: string): boolean {
  return event.type === 'TileDestroyed' && event.playerId === playerId && event.cause === undefined
}

/** The board after a batch's uses: the local player's pings, and anyone's buoy. */
export function boardAfterUses(
  board: RevealBoard,
  events: readonly DomainEvent[],
  state: AuthorityState,
  localPlayerId: string,
): RevealBoard {
  return sensingUsesOf(events, state).reduce(
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

/**
 * The ping round its centre, for its reveal time (`revealVerbs.ts`: a milestone, a link); with
 * the Deep Striker held, the cone below it instead (`deepStriker.ts`).
 */
function echoPingOf(use: SensingUse, state: AuthorityState): RevealPing {
  const centre = echoCentreOf(use, state)
  return {
    centre,
    marks: echoMarksOn(state, echoTilesOf(use, state, centre)),
    bornTick: use.tick,
    untilTick: echoUntilOf(use),
  }
}

/** The ring's tiles, or the cone's when the twist is held. */
function echoTilesOf(use: SensingUse, state: AuthorityState, centre: TilePoint): TilePoint[] {
  const radius = sensingReachAt(state, centre, echoRadiusOf(use))
  const down = twistedDownOf(use, state, radius)
  return down === null ? tilesWithin(centre, radius) : echoConeTilesOf(centre, down, radius)
}

/** The ring round where the shell lands, mapped for the rest of the trip. */
function flareMapOf(use: SensingUse, state: AuthorityState): RevealPing {
  const landing = flareLandingOfUse(use, state)
  return {
    centre: landing,
    marks: echoMarksOf(state, landing, sensingReachAt(state, landing, flareRadiusOf(use))),
    bornTick: use.tick,
    untilTick: null,
  }
}

/** The pin, and its ring pinged as it lands. */
function boardWithBuoy(board: RevealBoard, use: SensingUse, state: AuthorityState): RevealBoard {
  const tile = buoyTileOf(use, state)
  const pin = droppedPinOf(state, {
    tile,
    ownerId: use.playerId,
    placedTick: use.tick,
    ringTiles: sensingReachAt(state, tile, buoyRingOf(use)),
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

export function boardWithPing(board: RevealBoard, ping: RevealPing): RevealBoard {
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

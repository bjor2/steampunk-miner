/**
 * The bores on the authority's clock (ticket 313, #309), each tick in the order they were fired:
 *
 * - a bore still opening works on its next cell when that cell's tick comes (`boreCell.ts`), one
 *   cell every `openIntervalTicks`, so a 4-cell line opens at fire +2, +4, +6 and +8;
 * - when its line ends (its range walked, or a stop) it says so in `BoreEnded`, and if it opened
 *   anything its blocks are checked `collapseHoldTicks` later (`boreCollapse.ts`);
 * - each cell it opens moves its `nextShotTick` to the fire tick plus the recovery of the dig
 *   ticks spent so far, at the rate the shot fired with;
 * - once checked and past its `nextShotTick` it leaves the state.
 *
 * A shaped shot (ticket 377) is one pending bore per line, all fired in the same tick by the same
 * player. They share the shot's budget and recovery: each cell any line opens spends from all of
 * them, so the shot's dig ticks summed over every line and turn stay within `boreBudgetTicks`, and
 * `nextShotTick` stays the recovery of that sum. Each line stops on its own, and a line whose shot
 * names a lining type lines its opened cells as it ends (`boreLining.ts`); one whose shot grounds
 * grounds them until its `BoreEnded`'s `groundedUntilTick` (ticket 378, `groundedLines.ts`). A
 * line whose shot wedges struts stops at a hollow's edge and leaves a strut in its mouth
 * (`boreStrut.ts`, ticket 379).
 *
 * Cell events carry the bore's player in their stamp; collapse warnings, like every collapse
 * event, carry only the tick.
 */
import type { PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import type { AuthorityState } from '../authorityState'
import type { TickOutcome } from '../combat/combatTick'
import type { RuleEffect } from '../commandRule'
import type { BoreStop, DomainEvent, DomainEventBodies, DomainEventBody } from '../domainEvent'
import { gunRecoveryTicks } from '../../registries/boreGun'
import { planetParamsOf } from '../planetOfState'
import { openBoreCell, type CellOpening } from './boreCell'
import { groundedUntilOf, groundEndedBore } from '../magnetic/groundedLines'
import { checkBoreBlocks } from './boreCollapse'
import { lineCellsOnEnd } from './boreLine'
import { lineEndedBore } from './boreLining'
import {
  boresOf,
  isBoreOpening,
  isSameShot,
  NO_BORES,
  withBores,
  type PendingBore,
} from './boreState'
import { strutOnStop, strutStopOr } from './boreStrut'

type BoreStep = (state: AuthorityState) => TickOutcome

type BoreEndedBody = { type: 'BoreEnded' } & DomainEventBodies['BoreEnded']

/** The next tick a bore opens a cell, checks its blocks or leaves; null with none. */
export function nextBoreTick(state: AuthorityState): number | null {
  const ticks = boresOf(state).map((bore) => Math.max(dueTickOf(bore), state.tick + 1))
  return ticks.length === 0 ? null : Math.min(...ticks)
}

export function runBoreTick(state: AuthorityState, tick: number): TickOutcome {
  if (boresOf(state).length === 0) return { state, events: [] }
  const params = planetParamsOf(state.planet)
  if (params === null) return { state: withBores(state, NO_BORES), events: [] }
  const stepped = runSteps(
    state,
    boresOf(state).map((_, index) => (current) => stepBore(current, params, index, tick)),
  )
  return { state: withoutDoneBores(stepped.state, tick), events: stepped.events }
}

function dueTickOf(bore: PendingBore): number {
  if (isBoreOpening(bore)) return bore.nextOpenTick
  return bore.checkTick ?? bore.nextShotTick
}

function stepBore(
  state: AuthorityState,
  params: PlanetParams,
  index: number,
  tick: number,
): TickOutcome {
  const bore = boresOf(state)[index]
  if (isCellDue(bore, tick)) return openNextCell(state, params, index, tick)
  if (isCheckDue(bore, tick)) return checkBlocks(state, params, index, tick)
  return { state, events: [] }
}

function isCellDue(bore: PendingBore, tick: number): boolean {
  return isBoreOpening(bore) && tick === bore.nextOpenTick
}

function isCheckDue(bore: PendingBore, tick: number): boolean {
  return bore.checkTick !== null && tick >= bore.checkTick
}

function openNextCell(
  state: AuthorityState,
  params: PlanetParams,
  index: number,
  tick: number,
): TickOutcome {
  const bore = boresOf(state)[index]
  const [tile, ...rest] = bore.cells
  const ask = { playerId: bore.playerId, tick, shot: bore.shot, budgetLeft: bore.budgetLeft, tile }
  const opening = strutStopOr(state, bore, tile, openBoreCell(state, params, ask))
  const moved = movedBore(bore, tile, rest, opening, tick)
  const effect = effectOf(state, opening)
  const cell = { bore: moved, tile, opening, tick }
  const ended = endEventsOf(state, index, cell)
  const left = leftOnEnd(effect.state, params, cell)
  return {
    state: withShotSpent(withBoreAt(left.state, index, moved), moved),
    events: stampedFor(bore.playerId, [...effect.events, ...ended, ...left.events], tick),
  }
}

/** The cell a line just worked on, what it found there, and when. */
interface LineCell {
  bore: PendingBore
  tile: TilePoint
  opening: CellOpening
  tick: number
}

/**
 * What an ended line leaves: its walls lined when its shot lines them, then its strut when it
 * stopped at a hollow's edge, then its opened cells grounded when its shot grounds them (ticket
 * 378); unchanged while it still opens.
 */
function leftOnEnd(state: AuthorityState, params: PlanetParams, cell: LineCell): RuleEffect {
  if (isBoreOpening(cell.bore)) return { state, events: [] }
  const lined = lineEndedBore(state, params, cell.bore)
  const strut = strutOnStop(lined.state, cell.bore, cell.tile, cell.opening, cell.tick)
  const grounded = groundEndedBore(strut.state, cell.bore, cell.tick)
  return { state: grounded, events: [...lined.events, ...strut.events] }
}

/** Every line of `spent`'s shot takes its budget left and recovery: the shot spends as one. */
function withShotSpent(state: AuthorityState, spent: PendingBore): AuthorityState {
  return withBores(
    state,
    boresOf(state).map((bore) => (isSameShot(bore, spent) ? sharedSpendOf(bore, spent) : bore)),
  )
}

function sharedSpendOf(bore: PendingBore, spent: PendingBore): PendingBore {
  if (bore === spent) return bore
  return { ...bore, budgetLeft: spent.budgetLeft, nextShotTick: spent.nextShotTick }
}

/** The bore after this cell: on to the next cell, or ended with its blocks due after the hold. */
function movedBore(
  bore: PendingBore,
  tile: TilePoint,
  rest: readonly TilePoint[],
  opening: CellOpening,
  tick: number,
): PendingBore {
  if (opening.kind === 'stopped') return endedBore(bore, tick)
  const advanced = {
    ...spentOn(bore, tile, opening),
    cells: rest,
    nextOpenTick: tick + bore.shot.openIntervalTicks,
  }
  return rest.length === 0 ? endedBore(advanced, tick) : advanced
}

/**
 * An opened cell spends its dig ticks, joins the bored line and moves the recovery on; an open
 * one passes free.
 */
function spentOn(bore: PendingBore, tile: TilePoint, opening: CellOpening): PendingBore {
  if (opening.kind !== 'opened') return bore
  const budgetLeft = bore.budgetLeft - opening.ticks
  const spentDigTicks = bore.shot.boreBudgetTicks - budgetLeft
  return {
    ...bore,
    budgetLeft,
    bored: [...bore.bored, tile],
    nextShotTick: bore.firedTick + gunRecoveryTicks(spentDigTicks, bore.shot),
  }
}

function endedBore(bore: PendingBore, tick: number): PendingBore {
  const checkTick = bore.bored.length === 0 ? null : tick + bore.shot.collapseHoldTicks
  return { ...bore, cells: [], checkTick }
}

/**
 * `BoreEnded` when this cell ended the line at `index`: a stop at it, or the last cell of the
 * range; with the tick its cells are grounded until when the line grounds them, and the shot's
 * opened cells when it ends the shot and a listener wants them (ticket 412).
 */
function endEventsOf(state: AuthorityState, index: number, cell: LineCell): DomainEventBody[] {
  if (isBoreOpening(cell.bore)) return []
  const groundedUntilTick = groundedUntilOf(cell.bore, cell.tick)
  const lineCells = lineCellsOnEnd(state, index, cell.bore)
  return [
    {
      ...endedBodyOf(cell),
      ...(groundedUntilTick === null ? {} : { groundedUntilTick }),
      ...(lineCells === null ? {} : { lineCells }),
    },
  ]
}

function endedBodyOf({ bore, tile, opening }: LineCell): BoreEndedBody {
  const stop: BoreStop = opening.kind === 'stopped' ? opening.stop : 'range'
  return { type: 'BoreEnded', stop, ...tile, cellsOpened: bore.bored.length }
}

/** What the cell changed: the opened cell's effect, or a stop's own events on the same state. */
function effectOf(state: AuthorityState, opening: CellOpening): RuleEffect {
  if (opening.kind === 'opened') return opening.effect
  return { state, events: opening.kind === 'stopped' ? opening.events : [] }
}

function checkBlocks(
  state: AuthorityState,
  params: PlanetParams,
  index: number,
  tick: number,
): TickOutcome {
  const checked = checkBoreBlocks(state, params, boresOf(state)[index])
  return {
    state: withBoreAt(checked.effect.state, index, checked.bore),
    events: checked.effect.events.map((body): DomainEvent => ({ tick, ...body })),
  }
}

function withBoreAt(state: AuthorityState, index: number, bore: PendingBore): AuthorityState {
  return withBores(
    state,
    boresOf(state).map((kept, at) => (at === index ? bore : kept)),
  )
}

/** A bore whose line ended, whose blocks are checked and whose recovery ran out is gone. */
function withoutDoneBores(state: AuthorityState, tick: number): AuthorityState {
  return withBores(
    state,
    boresOf(state).filter((bore) => !isBoreDone(bore, tick)),
  )
}

function isBoreDone(bore: PendingBore, tick: number): boolean {
  return !isBoreOpening(bore) && bore.checkTick === null && tick >= bore.nextShotTick
}

function stampedFor(playerId: string, bodies: DomainEventBody[], tick: number): DomainEvent[] {
  return bodies.map((body): DomainEvent => ({ tick, playerId, ...body }))
}

function runSteps(state: AuthorityState, steps: readonly BoreStep[]): TickOutcome {
  return steps.reduce<TickOutcome>(
    (outcome, step) => {
      const next = step(outcome.state)
      return { state: next.state, events: [...outcome.events, ...next.events] }
    },
    { state, events: [] },
  )
}

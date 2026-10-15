/**
 * The sounding bore's echo (ticket 415, S-echo; TD lock 6180863028 on #320 section 2, accepted by
 * the GD ruling 6180873822): when the local player's bore shot ends carrying its opened cells
 * (`BoreEnded.lineCells`, ticket 412), one ping marks the tiles within a radius of those cells for
 * an echo's time. The kernel adds `lineCells` only while a listener wants them (the combos slice,
 * once its owner holds the sounding bore), so with none the board draws nothing new.
 *
 * The echo sounder's Mark lifts the radius and the echo time toward their caps, asymptotically:
 * `v(m) = base + floor((cap - base) x (1 - 2^-(m-1)))`, the VS's form, kept literal. The echo
 * time never passes the echo sounder's own reveal at its top Mark (the GD's hard cap). Reveal only:
 * nothing here reaches the authority, so yield, hardness and price never move.
 *
 * Cost: at most 50 cells x (2 x 6 + 1)^2 tile reads, deduplicated, once per `BoreEnded` heard,
 * never per tick or per cell cut, whatever the drill speed.
 */
import { sensingReachAt } from '../../../systems/authority/magnetic/sensingReach'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { researchedMarkOf } from '../../tech-tree'
import { echoMarksOn } from './echoPing'
import { echoRevealTicksAtTopMark } from './revealReach'
import type { RevealPing } from './revealPing'
import { SENSING_ECONOMY, type MarkScaledRange } from './sensingEconomy'
import { ECHO_SOUNDER } from './sensingUses'
import { tilesWithinOfCells } from './tileDisc'

/** Mark 1 is the item as bought (#162 4.6); Mark 0, none researched, sounds as bought. */
const BOUGHT_MARK = 1

type BoreEnded = Extract<DomainEvent, { type: 'BoreEnded' }>

/** One ping per local bore shot that ended carrying cells, in the order they were heard. */
export function soundingPingsOf(
  events: readonly DomainEvent[],
  state: AuthorityState,
  localPlayerId: string,
): RevealPing[] {
  return events
    .filter((event): event is BoreEnded => isLocalSoundedLine(event, localPlayerId))
    .map((event) => soundingPingOf(event, state))
}

/** The ping's radius in whole tiles at the echo sounder's Mark `mark`. */
export function soundingRadiusAt(mark: number): number {
  return towardCapAt(SENSING_ECONOMY.soundingBore.radiusTiles, mark)
}

/** How long the ping stays shown at the echo sounder's Mark `mark`, in ticks. */
export function soundingEchoTicksAt(mark: number): number {
  const echoTicks = towardCapAt(SENSING_ECONOMY.soundingBore.echoTicks, mark)
  return Math.min(echoTicks, echoRevealTicksAtTopMark())
}

function isLocalSoundedLine(event: DomainEvent, localPlayerId: string): boolean {
  if (event.type !== 'BoreEnded' || event.playerId !== localPlayerId) return false
  return (event.lineCells?.length ?? 0) > 0
}

/** Centred on the line's first cell, so a ping past the mark cap keeps the cells nearest the gun. */
function soundingPingOf(event: BoreEnded, state: AuthorityState): RevealPing {
  const cells: readonly TilePoint[] = event.lineCells ?? []
  const mark = sounderMarkOf(state, event.playerId ?? '')
  const radius = sensingReachAt(state, cells[0], soundingRadiusAt(mark))
  return {
    centre: cells[0],
    marks: echoMarksOn(state, tilesWithinOfCells(cells, radius)),
    bornTick: event.tick,
    untilTick: event.tick + soundingEchoTicksAt(mark),
  }
}

function sounderMarkOf(state: AuthorityState, playerId: string): number {
  return Math.max(researchedMarkOf(state, playerId, ECHO_SOUNDER), BOUGHT_MARK)
}

/**
 * `v(m) = base + floor((cap - base) x (1 - 2^-(m-1)))`, in exact integers: the floor equals
 * `span - ceil(span / 2^(m-1))`. Mark 1 is the base, and no Mark reaches the cap.
 */
function towardCapAt({ base, cap }: MarkScaledRange, mark: number): number {
  return cap - shortOfCapAfter(cap - base, Math.max(mark, BOUGHT_MARK) - 1)
}

/** `ceil(span / 2^steps)`: a ceil-halving per step, which stays at 1 once it gets there. */
function shortOfCapAfter(span: number, steps: number): number {
  let short = span
  for (let step = 0; step < steps && short > 1; step += 1) short = Math.ceil(short / 2)
  return short
}

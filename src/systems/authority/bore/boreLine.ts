/**
 * What a bore shot's opened line tells the slices that read it (K-line, ticket 412, the TD lock
 * 6180863028 on #320 and the GD ruling 6180873822), derived from the saved pending bores with no
 * new state:
 *
 * - `lineCellsOnEnd`: the shot's opened cells for its last `BoreEnded`, line by line in the order
 *   the lines were fired, each in walk order, the first `maxLineCells` of them, asked only of the
 *   line that ends the shot and only kept while a `boreLineListeners` listener wants them (the
 *   sounding bore's echo, S-echo). Once per shot, never per tick.
 * - `boreFarEndOf`: the last cell the player's most recently fired pending bore opened, and when it
 *   fired (the winch bore's far end, M-winch).
 */
import { isBoreLineWanted } from '../../registries/boreLineListeners'
import type { TilePoint } from '../../world/tileGrid'
import type { AuthorityState } from '../authorityState'
import { boresOf, isBoreOpening, isSameShot, type PendingBore } from './boreState'
import BORE_BEARINGS from './boreBearings.json'
import { SHOT_SHAPE_CAPS } from './shotShape'

export interface BoreEventCaps {
  /** Opened cells one `BoreEnded` carries: the longest line times the most lines of a shot. */
  maxLineCells: number
}

export const BORE_EVENT_CAPS: BoreEventCaps = {
  maxLineCells: BORE_BEARINGS.boreEventCaps.rangeCap * SHOT_SHAPE_CAPS.maxLines,
}

/** Where a player's latest bore reached: its last opened cell and the tick it fired. */
export interface BoreFarEnd {
  tile: TilePoint
  firedTick: number
}

/**
 * The cells the shot opened, for the `BoreEnded` of the line at `index` as it becomes `ended`;
 * null while another line of the shot still opens, or when no listener wants them.
 */
export function lineCellsOnEnd(
  state: AuthorityState,
  index: number,
  ended: PendingBore,
): readonly TilePoint[] | null {
  const lines = shotLinesWith(state, index, ended)
  if (lines.some(isBoreOpening) || !isBoreLineWanted(state, ended.playerId)) return null
  return cappedLineCellsOf(lines)
}

/** The last cell the player's most recently fired bore opened; null with none or none opened. */
export function boreFarEndOf(state: AuthorityState, playerId: string): BoreFarEnd | null {
  const latest = boresOf(state)
    .filter((bore) => bore.playerId === playerId)
    .at(-1)
  const tile = latest?.bored.at(-1)
  if (latest === undefined || tile === undefined) return null
  return { tile: { tx: tile.tx, ty: tile.ty }, firedTick: latest.firedTick }
}

/** Every line of `ended`'s shot in fire order, with the one at `index` as it ends. */
function shotLinesWith(state: AuthorityState, index: number, ended: PendingBore): PendingBore[] {
  return boresOf(state)
    .map((bore, at) => (at === index ? ended : bore))
    .filter((bore) => isSameShot(bore, ended))
}

function cappedLineCellsOf(lines: readonly PendingBore[]): TilePoint[] {
  return lines
    .flatMap((line) => line.bored)
    .slice(0, BORE_EVENT_CAPS.maxLineCells)
    .map((tile) => ({ tx: tile.tx, ty: tile.ty }))
}

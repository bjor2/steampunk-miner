/**
 * The HUD hint chip's board (ticket 238; #142 "Shown once per cell per dive"): the local player's
 * first stop at a gated cell in a dive shows that cell's ledger line for `chipShowTicks`; a later
 * stop at the same cell shows nothing until the next dive, which starts when the miner reaches the
 * dock or enters a planet. A newer cell's chip takes the place of the one showing. Presentation
 * only: never in the authority state, a section or the digest.
 */
import LEDGER_FILE from '../ledgerLines.json'
import { ledgerIconIdOf, ledgerLineOf, type GateHit } from './ledgerLines'

/** A stopped cell as the chip hears it: `DrillGated`'s words, its tile and the tick it came on. */
export interface GateHitAt extends GateHit {
  tx: number
  ty: number
  tick: number
}

export interface GateChip {
  line: string
  iconId: string
  gateKind: string
  outcome: GateHit['outcome']
  tx: number
  ty: number
  shownAtTick: number
}

export interface GateChipBoard {
  /** Cells met this dive, as `tx,ty`. */
  metThisDive: ReadonlySet<string>
  chip: GateChip | null
}

export const EMPTY_GATE_CHIP_BOARD: GateChipBoard = { metThisDive: new Set(), chip: null }

export const CHIP_SHOW_TICKS: number = LEDGER_FILE.chipShowTicks

/** The board after a stop: a cell first met this dive shows its chip; a known one changes nothing. */
export function addGateHitToBoard(board: GateChipBoard, hit: GateHitAt): GateChipBoard {
  const key = cellKeyOf(hit)
  if (board.metThisDive.has(key)) return board
  const chip = gateChipOf(hit)
  return { metThisDive: new Set([...board.metThisDive, key]), chip: chip ?? board.chip }
}

/** A new dive: every cell may show its chip again, and the chip showing clears. */
export function startDiveOnBoard(): GateChipBoard {
  return EMPTY_GATE_CHIP_BOARD
}

/** The chip showing at `tick`, or null once it has held `showTicks`. */
export function chipShownAt(
  board: GateChipBoard,
  tick: number,
  showTicks = CHIP_SHOW_TICKS,
): GateChip | null {
  const { chip } = board
  return chip !== null && tick - chip.shownAtTick < showTicks ? chip : null
}

/** The board with an ended chip taken off, so nothing re-renders for it. */
export function withoutEndedChip(board: GateChipBoard, tick: number): GateChipBoard {
  if (board.chip === null || chipShownAt(board, tick) !== null) return board
  return { ...board, chip: null }
}

function gateChipOf(hit: GateHitAt): GateChip | null {
  const line = ledgerLineOf(hit)
  const iconId = ledgerIconIdOf(hit)
  if (line === null || iconId === null) return null
  const { gateKind, outcome, tx, ty, tick } = hit
  return { line, iconId, gateKind, outcome, tx, ty, shownAtTick: tick }
}

function cellKeyOf({ tx, ty }: GateHitAt): string {
  return `${tx},${ty}`
}

/**
 * How the reveal layer draws the board (#162 Sensing rows; one pooled quad per instance, the TD
 * lock on #203 Q1): a tile-sized tinted quad per marked cell, coloured by what the ping found, a
 * gated cell in its gate's badge colour, and a smaller brass diamond per buoy pin. Pins come
 * first, so a full layer never drops one. Presentation only: no rule reads these.
 */
import type { CellGateKind } from '../../../mining-gates'
import type { EchoMarkKind } from '../echoPing'
import type { RevealBoard } from '../revealBoard'

/** One placed quad: its centre in metres (a tile is a metre), its size, turn and colour. */
export interface RevealQuad {
  x: number
  y: number
  size: number
  turn: number
  colour: string
}

/** Open cave, lava and ore silhouettes read apart at a glance; the palette's tints. */
export const MARK_COLOURS: Readonly<Record<Exclude<EchoMarkKind, 'gate'>, string>> = {
  cave: '#5fb7c9',
  lava: '#e0552b',
  ore: '#d9c27a',
}

/** The badge colours of the mining-gates cards: rig copper, dynamite red, drill steel. */
export const GATE_COLOURS: Readonly<Record<Exclude<CellGateKind, 'none'>, string>> = {
  rig: '#b8733a',
  dynamite: '#c23b2b',
  drillSignature: '#8fa3b0',
  dense: '#6c6c78',
}

export const BUOY_PIN_COLOUR = '#f2d36b'

const HALF_TILE = 0.5
const MARK_SIZE = 0.9
const PIN_SIZE = 0.6
const PIN_TURN = Math.PI / 4

/** Every quad the board draws, pins first, then marks in the order they were kept. */
export function revealQuadsOf(board: RevealBoard): RevealQuad[] {
  return [
    ...board.pins.map((pin) => quadAt(pin.tile, PIN_SIZE, PIN_TURN, BUOY_PIN_COLOUR)),
    ...board.marks.map((mark) => quadAt(mark.tile, MARK_SIZE, 0, colourOfMark(mark))),
  ]
}

function colourOfMark(mark: RevealBoard['marks'][number]): string {
  if (mark.kind === 'gate' && mark.gate !== null) return GATE_COLOURS[mark.gate]
  return mark.kind === 'gate' ? MARK_COLOURS.ore : MARK_COLOURS[mark.kind]
}

function quadAt(
  tile: { tx: number; ty: number },
  size: number,
  turn: number,
  colour: string,
): RevealQuad {
  return { x: tile.tx + HALF_TILE, y: tile.ty + HALF_TILE, size, turn, colour }
}

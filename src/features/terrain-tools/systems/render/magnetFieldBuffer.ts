/**
 * The magnet fields' one vertex buffer (TD ruling on #286 Q1): allocated once at the layer's cap,
 * never per tick or per frame. Fields are written in the order given (the local player's first,
 * then the others nearest the view) while their pieces fit under `MAGNET_FIELD_CAP`; a field that
 * does not fit is dropped, never queued. Every vertex carries its field's timing, so between
 * rebuilds only the layer's clock uniforms move.
 *
 * Ticks are written after the rebuild's epoch tick, so a float holds them exactly however long
 * the session has run; a tick that never comes is written `FAR_TICKS` away.
 */
import { MAGNET_FIELD_CAP } from './magnetFieldBudget'
import { levelsOfField, type FieldLevels } from './magnetFieldLight'
import { MAGNET_FIELD_LOOK, type MagnetFieldLook } from './magnetFieldLook'
import { piecesOfMagnetField, type FieldPiece, type FieldSegment } from './magnetFieldPieces'
import {
  centreOfField,
  piecesOfField,
  type MagnetField,
  type MagnetFieldKind,
  type MagnetFieldTiming,
} from './magnetFields'

/** Far enough for any field, near enough for a float to hold. */
export const FAR_TICKS = 10_000_000

/** A field the last rebuild wrote, for the debug read and the specs. */
export interface DrawnMagnetField {
  kind: MagnetFieldKind
  playerId: string
  pieces: number
  timing: MagnetFieldTiming
  levels: FieldLevels
}

export interface MagnetFieldBuffer {
  /** x, y, z of both ends of each segment, piece after piece, `segmentsPerPiece` a piece. */
  readonly positions: Float32Array
  /** Per vertex: the centre the field opens from (x, y) and its ticks to open. */
  readonly grow: Float32Array
  /** Per vertex: start, bright-from and end ticks after the epoch, and its share along the piece. */
  readonly timing: Float32Array
  /** Per vertex: the faint and the bright opacity; 0 on a piece's unused segments. */
  readonly levels: Float32Array
  readonly segmentsPerPiece: number
  /** Pieces written, from the first; the rest of the buffer is stale. */
  pieceCount: number
  /** The tick the written times count from. */
  epochTick: number
  drawn: DrawnMagnetField[]
  /** How many times the fields were written, for the bench and the specs. */
  rebuilds: number
}

export function createMagnetFieldBuffer(look: MagnetFieldLook = MAGNET_FIELD_LOOK) {
  const vertices = MAGNET_FIELD_CAP * look.segmentsPerPiece * 2
  const buffer: MagnetFieldBuffer = {
    positions: new Float32Array(vertices * 3),
    grow: new Float32Array(vertices * 3),
    timing: new Float32Array(vertices * 4),
    levels: new Float32Array(vertices * 2),
    segmentsPerPiece: look.segmentsPerPiece,
    pieceCount: 0,
    epochTick: 0,
    drawn: [],
    rebuilds: 0,
  }
  return buffer
}

/** Writes the fields that fit, in order, timed from `epochTick`. */
export function writeMagnetFields(
  buffer: MagnetFieldBuffer,
  fields: readonly MagnetField[],
  epochTick: number,
  look: MagnetFieldLook = MAGNET_FIELD_LOOK,
): void {
  buffer.epochTick = epochTick
  buffer.pieceCount = 0
  buffer.drawn = []
  writeFieldsThatFit(buffer, fields, look)
  buffer.rebuilds += 1
}

/** Each field in turn while its pieces fit after those written before it. */
function writeFieldsThatFit(
  buffer: MagnetFieldBuffer,
  fields: readonly MagnetField[],
  look: MagnetFieldLook,
): void {
  for (const field of fields) {
    if (fitsUnderCap(buffer, field, look)) writeField(buffer, field, look)
  }
}

/** Whether the field's pieces fit under the cap after those already written. */
function fitsUnderCap(buffer: MagnetFieldBuffer, field: MagnetField, look: MagnetFieldLook) {
  return buffer.pieceCount + piecesOfField(field, look) <= MAGNET_FIELD_CAP
}

function writeField(buffer: MagnetFieldBuffer, field: MagnetField, look: MagnetFieldLook): void {
  const stamp = vertexStampOf(buffer, field, look)
  const pieces = piecesOfMagnetField(field, look)
  pieces.forEach((piece) => {
    writePiece(buffer, piece, stamp)
    buffer.pieceCount += 1
  })
  buffer.drawn.push({
    kind: field.kind,
    playerId: field.playerId,
    pieces: pieces.length,
    timing: field.timing,
    levels: levelsOfField(field.kind, look),
  })
}

/** What every vertex of the field shares: where it opens from, its times, its light. */
interface VertexStamp {
  centreX: number
  centreY: number
  growTicks: number
  start: number
  brightFrom: number
  end: number
  faint: number
  bright: number
}

function vertexStampOf(
  buffer: MagnetFieldBuffer,
  field: MagnetField,
  look: MagnetFieldLook,
): VertexStamp {
  const centre = centreOfField(field)
  const levels = levelsOfField(field.kind, look)
  const { timing } = field
  return {
    centreX: centre.x,
    centreY: centre.y,
    growTicks: timing.growTicks,
    start: afterEpoch(buffer, timing.startTick),
    brightFrom: afterEpoch(buffer, timing.brightFromTick),
    end: afterEpoch(buffer, timing.endTick),
    faint: levels.faint,
    bright: levels.bright,
  }
}

function afterEpoch(buffer: MagnetFieldBuffer, tick: number): number {
  return Math.min(Math.max(tick - buffer.epochTick, -FAR_TICKS), FAR_TICKS)
}

/** The piece's segments, then its unused ones folded onto its start and left dark. */
function writePiece(buffer: MagnetFieldBuffer, piece: FieldPiece, stamp: VertexStamp): void {
  const first = buffer.pieceCount * buffer.segmentsPerPiece
  for (let at = 0; at < buffer.segmentsPerPiece; at++) {
    const segment = piece[at] ?? null
    const vertex = (first + at) * 2
    writeSegmentEnds(buffer, vertex, segment ?? foldedSegmentOf(piece[0]))
    writeStamp(buffer, vertex, stamp, segment === null ? DARK : [stamp.faint, stamp.bright])
  }
}

function foldedSegmentOf(start: FieldSegment): FieldSegment {
  return { from: start.from, to: start.from, fromShare: 0, toShare: 0 }
}

function writeSegmentEnds(buffer: MagnetFieldBuffer, vertex: number, segment: FieldSegment): void {
  buffer.positions.set([segment.from.x, segment.from.y, 0], vertex * 3)
  buffer.positions.set([segment.to.x, segment.to.y, 0], vertex * 3 + 3)
  buffer.timing[vertex * 4 + 3] = segment.fromShare
  buffer.timing[vertex * 4 + 7] = segment.toShare
}

const DARK = [0, 0] as const

function writeStamp(
  buffer: MagnetFieldBuffer,
  vertex: number,
  stamp: VertexStamp,
  light: readonly [number, number],
): void {
  for (const at of [vertex, vertex + 1]) {
    buffer.grow.set([stamp.centreX, stamp.centreY, stamp.growTicks], at * 3)
    buffer.timing.set([stamp.start, stamp.brightFrom, stamp.end], at * 4)
    buffer.levels.set(light, at * 2)
  }
}

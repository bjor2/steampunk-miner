/**
 * The lock marker the ground draws (ticket 299): the kernel's drawn gate (`drawnGateOf`, the
 * terrain shader's rule) read back as #142's marker kinds, so a debug read can check the ground
 * against `lockMarkerOf` for the same tile.
 */
import {
  drawnGateOf,
  isMovingPattern,
  type DrawnGate,
  type GateViewer,
} from '../../../../systems/render/gatePatterns'
import type { LockMarkerKind } from './lockMarkers'

export interface DrawnMarker {
  kind: LockMarkerKind
  /** The surface motion drawn, set exactly when `kind` is `motion`. */
  motion: string | null
  /** The motion held still as its engraved glyph (reduce motion). */
  isGlyph: boolean
}

/** A tile's drawn marker, and whether the tile is drawn at all. */
export interface DrawnMarkerRead extends DrawnMarker {
  isDrawn: boolean
}

const NONE_DRAWN: DrawnMarker = { kind: 'none', motion: null, isGlyph: false }

/** What a tile's gate bits draw for `viewer`; null bits are a tile not drawn now. */
export function drawnMarkerReadOf(bits: number | null, viewer: GateViewer): DrawnMarkerRead {
  if (bits === null) return { isDrawn: false, ...NONE_DRAWN }
  return { isDrawn: true, ...drawnMarkerOf(drawnGateOf(bits, viewer)) }
}

/** #142's marker for what a tile draws; `none` for no marker or a kind this slice never writes. */
export function drawnMarkerOf(drawn: DrawnGate | null): DrawnMarker {
  if (drawn === null || drawn.pattern === null) return NONE_DRAWN
  if (isMovingPattern(drawn.pattern)) {
    return { kind: 'motion', motion: drawn.pattern, isGlyph: drawn.isGlyph }
  }
  return { kind: staticMarkerKindOf(drawn), motion: null, isGlyph: false }
}

function staticMarkerKindOf({ pattern, isOpen }: DrawnGate): LockMarkerKind {
  if (pattern === 'cracked_shell') return 'cracked_shell'
  return pattern === 'hard_rim' && isOpen ? 'hard_rim_open' : 'hard_rim'
}

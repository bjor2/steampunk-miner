/**
 * The sensing view as the debug read reports it (#203): marks counted by kind, every buoy pin,
 * and how many warnings or readings each owned passive holds (null when not owned), so a browser
 * spec checks what a client reveals without reading pixels or Money.
 */
import type { SensingView } from './sensingView'

export interface RevealCounts {
  marks: number
  marksByKind: Readonly<Record<string, number>>
  pins: readonly { tx: number; ty: number; ownerId: string }[]
  periscope: number | null
  lens: number | null
  barometer: number | null
}

export function revealCountsOf(view: SensingView): RevealCounts {
  const { board, passives } = view
  return {
    marks: board.marks.length,
    marksByKind: countsByKindOf(board.marks.map((mark) => mark.kind)),
    pins: board.pins.map((pin) => ({ tx: pin.tile.tx, ty: pin.tile.ty, ownerId: pin.ownerId })),
    periscope: passives.periscope?.length ?? null,
    lens: passives.lens?.length ?? null,
    barometer: passives.barometer?.length ?? null,
  }
}

function countsByKindOf(kinds: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const kind of kinds) counts[kind] = (counts[kind] ?? 0) + 1
  return counts
}

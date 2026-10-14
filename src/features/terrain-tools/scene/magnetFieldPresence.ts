/**
 * The magnet fields the mounted layer draws now (#286), for the debug read: set while the layer is
 * mounted. A plain module record, never React state or the store, because the buffer is rewritten
 * from the frame loop.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import type { MagnetFieldBuffer } from '../systems/render/magnetFieldBuffer'
import { fieldGrowthAt, fieldLightAt } from '../systems/render/magnetFieldLight'

export const magnetFieldPresence: { buffer: MagnetFieldBuffer | null } = { buffer: null }

/** Shows the layer's buffer until the returned call takes it back. */
export function showMagnetFieldPool(pool: { buffer: MagnetFieldBuffer }): () => void {
  const { buffer } = pool
  magnetFieldPresence.buffer = buffer
  return () => {
    if (magnetFieldPresence.buffer === buffer) magnetFieldPresence.buffer = null
  }
}

/** One field as it shows now. */
export interface DrawnMagnetFieldNow {
  kind: string
  playerId: string
  pieces: number
  /** Its opacity this tick, 0 to 1. */
  light: number
  /** How far it has opened from its centre, 0 to 1. */
  growth: number
}

/**
 * What the layer drew on its last write, each field's light and growth at the authority tick, and
 * how often it wrote; null with no layer mounted.
 */
export function drawnMagnetFields(): {
  pieces: number
  rebuilds: number
  fields: DrawnMagnetFieldNow[]
} | null {
  const buffer = magnetFieldPresence.buffer
  if (buffer === null) return null
  const { tick } = readAuthorityState()
  return {
    pieces: buffer.pieceCount,
    rebuilds: buffer.rebuilds,
    fields: buffer.drawn.map((field) => ({
      kind: field.kind,
      playerId: field.playerId,
      pieces: field.pieces,
      light: fieldLightAt(field.timing, field.levels, tick),
      growth: fieldGrowthAt(field.timing, tick),
    })),
  }
}

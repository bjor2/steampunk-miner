/**
 * The material pop prototype's mode (ticket 614, the GD's split of #442): A is no pop (the popup
 * chip and the pickup sound), B a chunk that pops after the cell clears and flies to the hold.
 * Cosmetic and client-only: the mode is never a command, never saved and never in the digest, so
 * switching it changes no yield, energy, heat, digest or protocol. A session starts on A unless
 * its URL asks for B (`?pop=B`); the debug flag panel switches it live.
 */
export const MATERIAL_POP_MODES = ['A', 'B'] as const

export type MaterialPopMode = (typeof MATERIAL_POP_MODES)[number]

/** The G&V bar on #442: the switch defaults to A. */
export const DEFAULT_MATERIAL_POP_MODE: MaterialPopMode = 'A'

/** Where a session's mode came from, as its log line says. */
export const MATERIAL_POP_MODE_SOURCES = ['default', 'url', 'panel', 'debugApi'] as const

export type MaterialPopModeSource = (typeof MATERIAL_POP_MODE_SOURCES)[number]

/** The URL's `pop` value read as a mode, either case; null when absent or not a mode. */
export function materialPopModeOfParam(param: string | null): MaterialPopMode | null {
  const asked = param?.toUpperCase()
  return isMaterialPopMode(asked) ? asked : null
}

export function isMaterialPopMode(value: unknown): value is MaterialPopMode {
  return MATERIAL_POP_MODES.some((mode) => mode === value)
}

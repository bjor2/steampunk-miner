/**
 * The terrain gate channel's per-cell bits (ticket 298, the TD lock and GD ruling on #238): how a
 * gated cell's look rides to the terrain shader in one number per tile. Sized for the whole act
 * table up front, so frozen, magnetic and hollow gates land with no second kernel change:
 *
 * | bits | meaning                                                          |
 * | ---- | ---------------------------------------------------------------- |
 * | 0-3  | gate kind, 0 to 15: which placeholder or final pattern draws     |
 * | 4-6  | gate state, 0 to 7: locked, revealed, cleared, then five spare   |
 * | 7    | set on every gated cell; 0 is a cell with no gate                |
 *
 * The act tint never rides here: the shader takes it from the planet (#151 theme tint).
 */

/** What a gated cell shows: its kind and state, each a small integer the shader decodes. */
export interface CellGateLook {
  /** 0 to `MAX_GATE_KIND`; the provider names its kinds, the kernel only draws them apart. */
  kind: number
  /** 0 to `MAX_GATE_STATE`; `GATE_STATE` names the ones in use. */
  state: number
}

export const GATE_KIND_BITS = 4
export const GATE_STATE_BITS = 3
export const MAX_GATE_KIND = (1 << GATE_KIND_BITS) - 1
export const MAX_GATE_STATE = (1 << GATE_STATE_BITS) - 1

/** The states #142 names; 3 to 7 are spare for later acts. */
export const GATE_STATE = { locked: 0, revealed: 1, cleared: 2 } as const

/** The bits of a cell with no gate: the shader draws no marker. */
export const NO_GATE_BITS = 0

const GATED_BIT = 1 << (GATE_KIND_BITS + GATE_STATE_BITS)

/** The bits for `look`; a kind or state outside the channel is refused, never trimmed. */
export function gateBitsOf(look: CellGateLook | null): number {
  if (look === null) return NO_GATE_BITS
  refuseOutOfChannel(look)
  return GATED_BIT | (look.state << GATE_KIND_BITS) | look.kind
}

/** The look the bits carry, or null for a cell with no gate. */
export function gateLookOfBits(bits: number): CellGateLook | null {
  if ((bits & GATED_BIT) === 0) return null
  return { kind: bits & MAX_GATE_KIND, state: (bits >> GATE_KIND_BITS) & MAX_GATE_STATE }
}

function refuseOutOfChannel({ kind, state }: CellGateLook): void {
  if (isInChannel(kind, MAX_GATE_KIND) && isInChannel(state, MAX_GATE_STATE)) return
  throw new RangeError(
    `gate look {kind: ${kind}, state: ${state}} is outside the channel: kind 0-${MAX_GATE_KIND}, state 0-${MAX_GATE_STATE}`,
  )
}

function isInChannel(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= max
}

/**
 * The terrain gate channel's per-cell bits (ticket 298, the TD lock and GD ruling on #238): how a
 * gated cell's look rides to the terrain shader in one number per tile. Sized for the whole act
 * table up front, so frozen, magnetic and hollow gates land with no second kernel change:
 *
 * | bits | meaning                                                                  |
 * | ---- | ------------------------------------------------------------------------ |
 * | 0-3  | gate kind, 0 to 15: which pattern draws (`gatePatterns.ts`)             |
 * | 4-6  | gate state, 0 to 7: locked, revealed, cleared, then five spare           |
 * | 7    | set on every gated cell; 0 is a cell with no gate                        |
 * | 8-20 | the drill tip major that opens a rim, plus one; 0 for a gate no tip opens |
 *
 * The act tint never rides here: the shader takes it from the planet (#151 theme tint). Nor does
 * the player's tip: the shader compares the cell's opening major with the local player's
 * (`uGateTipMajor`, ticket 299), so a tip buy rebuilds no chunk (the TD's "tip-major uniform"). The
 * highest bits stay below 2^24, so the value is exact in a float attribute.
 */

/** What a gated cell shows: its kind and state, each a small integer the shader decodes. */
export interface CellGateLook {
  /** 0 to `MAX_GATE_KIND`; the provider names its kinds, the kernel only draws them apart. */
  kind: number
  /** 0 to `MAX_GATE_STATE`; `GATE_STATE` names the ones in use. */
  state: number
  /**
   * The drill tip major from which the cell's rim stands open (#142: the rim "glints once your
   * tip can cut it"), 0 to `MAX_GATE_OPENING_MAJOR`; absent for a gate no tip opens.
   */
  opensAtTipMajor?: number
}

export const GATE_KIND_BITS = 4
export const GATE_STATE_BITS = 3
export const MAX_GATE_KIND = (1 << GATE_KIND_BITS) - 1
export const MAX_GATE_STATE = (1 << GATE_STATE_BITS) - 1
export const GATE_OPENING_BITS = 13
/** The field holds the major plus one, so its top value is one major short of the field's. */
export const MAX_GATE_OPENING_MAJOR = (1 << GATE_OPENING_BITS) - 2

/** The states #142 names; 3 to 7 are spare for later acts. */
export const GATE_STATE = { locked: 0, revealed: 1, cleared: 2 } as const

/** The bits of a cell with no gate: the shader draws no marker. */
export const NO_GATE_BITS = 0

/** Set on every gated cell, above the kind and state bits. */
export const GATED_BIT = 1 << (GATE_KIND_BITS + GATE_STATE_BITS)

/** The opening field's place value: the bits above the gated bit. */
export const GATE_OPENING_UNIT = GATED_BIT * 2

/** The bits for `look`; a kind or state outside the channel is refused, never trimmed. */
export function gateBitsOf(look: CellGateLook | null): number {
  if (look === null) return NO_GATE_BITS
  refuseOutOfChannel(look)
  return openingFieldOf(look) * GATE_OPENING_UNIT + lowBitsOf(look)
}

/** The look the bits carry, or null for a cell with no gate. */
export function gateLookOfBits(bits: number): CellGateLook | null {
  if ((bits & GATED_BIT) === 0) return null
  const look = { kind: bits & MAX_GATE_KIND, state: (bits >> GATE_KIND_BITS) & MAX_GATE_STATE }
  const opening = Math.floor(bits / GATE_OPENING_UNIT)
  return opening === 0 ? look : { ...look, opensAtTipMajor: opening - 1 }
}

function lowBitsOf({ kind, state }: CellGateLook): number {
  return GATED_BIT | (state << GATE_KIND_BITS) | kind
}

/** 0 for a gate no tip opens, else the major plus one. */
function openingFieldOf({ opensAtTipMajor }: CellGateLook): number {
  return opensAtTipMajor === undefined ? 0 : opensAtTipMajor + 1
}

function refuseOutOfChannel(look: CellGateLook): void {
  if (isLookInChannel(look)) return
  const { kind, state, opensAtTipMajor } = look
  throw new RangeError(
    `gate look {kind: ${kind}, state: ${state}, opensAtTipMajor: ${opensAtTipMajor}} is outside the channel: kind 0-${MAX_GATE_KIND}, state 0-${MAX_GATE_STATE}, opening major 0-${MAX_GATE_OPENING_MAJOR}`,
  )
}

function isLookInChannel({ kind, state, opensAtTipMajor }: CellGateLook): boolean {
  return (
    isInChannel(kind, MAX_GATE_KIND) &&
    isInChannel(state, MAX_GATE_STATE) &&
    (opensAtTipMajor === undefined || isInChannel(opensAtTipMajor, MAX_GATE_OPENING_MAJOR))
  )
}

function isInChannel(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= max
}

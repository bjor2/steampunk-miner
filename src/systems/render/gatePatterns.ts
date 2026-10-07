/**
 * The gate markers the terrain shader draws (ticket 299; #142 "Before contact", #151 draw order and
 * motion budget), by the number a gated cell carries in its kind bits (`cellGateBits.ts`). The
 * kernel owns the catalogue because its shader draws it; a provider picks a pattern per gate, and
 * the pattern names a look only, never an extractor's name or icon (Horizontal's guard on #238).
 *
 * | pattern          | look                                                        | moves     |
 * | ---------------- | ----------------------------------------------------------- | --------- |
 * | hard_rim         | a thick dark rim; once open, a glint runs round it          | the glint |
 * | cracked_shell    | a dark shell band, the cell split by cracks                 | no        |
 * | concentric-rings | rings spreading out from the centre                         | yes       |
 * | vapour-wisps     | wisps curling up off the face                               | yes       |
 * | drip-lines       | streaks running down the skin                               | yes       |
 * | filing-lines     | short filings slowly turning into line                      | yes       |
 * | rising-ripples   | bands rising through the cell                               | yes       |
 * | bare_rim         | the hard rim, gone once open (an ordinary cell, from P7)    | no        |
 *
 * "Up" is away from the planet's centre. A pattern moves at constant brightness: no light, no
 * sparkle, no pulse (#142), so it never reads as grade. With reduce motion (the shake switch, #33,
 * #48) a moving pattern stops as its engraved glyph, the same shape cut as a groove with a lit lip
 * (#142), and the open rim's glint holds still (#151 "a static glint"). Kinds past the last are
 * free for frozen, magnetic and hollow; until they get a pattern the shader draws #298's
 * placeholder for them.
 *
 * States draw apart at a glance: locked is the whole pattern, revealed adds a lit inner edge,
 * cleared leaves a faint trace; the spare states draw as locked.
 *
 * `drawnGateOf` is the shader's rule in TypeScript, for the debug reads that check the ground.
 */
import { vehicleOf, type AuthorityState } from '../authority/authorityState'
import { majorOf } from '../economy/upgradeSteps'
import { gateLookOfBits, type CellGateLook } from './cellGateBits'

export const GATE_PATTERNS = [
  'hard_rim',
  'cracked_shell',
  'concentric-rings',
  'vapour-wisps',
  'drip-lines',
  'filing-lines',
  'rising-ripples',
  'bare_rim',
] as const

export type GatePattern = (typeof GATE_PATTERNS)[number]

const MOVING_PATTERNS: ReadonlySet<GatePattern> = new Set([
  'concentric-rings',
  'vapour-wisps',
  'drip-lines',
  'filing-lines',
  'rising-ripples',
])

/** The one pattern still drawn once open, glinting; any other opened marker is no longer drawn. */
const GLINTING_PATTERN: GatePattern = 'hard_rim'

/** Who the ground is drawn for: the local player's tip major and their reduce-motion choice. */
export interface GateViewer {
  tipMajor: number
  isMotionReduced: boolean
}

/** What a gated cell's marker draws for a viewer. */
export interface DrawnGate {
  /** The pattern of the cell's kind; null for a kind with none yet, drawn as the placeholder. */
  pattern: GatePattern | null
  kind: number
  state: number
  /** The viewer's tip major has reached the cell's opening major. */
  isOpen: boolean
  /** A moving pattern held still as its engraved glyph. */
  isGlyph: boolean
}

/**
 * Writes the viewer `playerId` is into `into`: the tip of their last completed major, as the
 * drill gates read it (#180 amendment 2), so a rim opens in the ground on the same major as in
 * `canMine`; reduce motion is the player's own setting.
 */
export function writeGateViewer(
  into: GateViewer,
  state: AuthorityState,
  playerId: string,
  isMotionReduced: boolean,
): GateViewer {
  into.tipMajor = majorOf(vehicleOf(state, playerId).levels.drill_tip)
  into.isMotionReduced = isMotionReduced
  return into
}

/** The kind number a provider writes for `pattern`. */
export function gateKindOfPattern(pattern: GatePattern): number {
  return GATE_PATTERNS.indexOf(pattern)
}

/** The catalogue as GLSL defines, `GATE_HARD_RIM` 0 and on, so the shader names what it draws. */
export function gatePatternDefines(): Record<string, number> {
  return Object.fromEntries(GATE_PATTERNS.map((pattern, kind) => [defineNameOf(pattern), kind]))
}

/** What the bits draw for `viewer`, or null where no marker draws. */
export function drawnGateOf(bits: number, viewer: GateViewer): DrawnGate | null {
  const look = gateLookOfBits(bits)
  return look === null ? null : drawnLookOf(look, viewer)
}

/** Whether the pattern moves, so reduce motion holds it as its glyph. */
export function isMovingPattern(pattern: GatePattern | null): boolean {
  return pattern !== null && MOVING_PATTERNS.has(pattern)
}

function drawnLookOf(look: CellGateLook, viewer: GateViewer): DrawnGate | null {
  const pattern = GATE_PATTERNS[look.kind] ?? null
  const isOpen = isOpenFor(look, viewer)
  if (isOpen && pattern !== GLINTING_PATTERN) return null
  const isGlyph = viewer.isMotionReduced && isMovingPattern(pattern)
  return { pattern, kind: look.kind, state: look.state, isOpen, isGlyph }
}

function isOpenFor({ opensAtTipMajor }: CellGateLook, { tipMajor }: GateViewer): boolean {
  return opensAtTipMajor !== undefined && tipMajor >= opensAtTipMajor
}

function defineNameOf(pattern: GatePattern): string {
  return `GATE_${pattern.toUpperCase().replace(/-/g, '_')}`
}

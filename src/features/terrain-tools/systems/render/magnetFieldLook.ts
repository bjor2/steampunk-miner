/**
 * How the terrain magnets' fields look (GD lock on #246 build 5, the GD and TD rulings on #286):
 * brass outlines with an arc-blue sweep, read once from `magnetFieldLooks.json` and refused whole
 * when broken. Look numbers only, tuned by eye; nothing here reaches the authority, a snapshot or
 * a digest.
 */
import looksFile from '../../magnetFieldLooks.json'

export interface MagnetFieldLook {
  colour: string
  /** The sweep that runs along each outline, toward the beacon or out from the coil. */
  arcColour: string
  segmentsPerPiece: number
  /** A planted beacon waiting for its dock: under the hazard strip's contrast (GD on #286 Q2). */
  faintOpacity: number
  brightOpacity: number
  /** The gather brightens the beacon's arcs over this many ticks, never popping on. */
  rampTicks: number
  /** A field going out fades over its last this-many ticks. */
  fadeTicks: number
  /** Sweeps a second along an outline; reduce motion holds them. */
  sweepPerSecond: number
  attract: { arcs: number; bendShare: number }
  repel: {
    flares: number
    /** The ring opens from the coil to its radius in the 6-tick response. */
    growTicks: number
    /** How long the wave shows after it fires, fade included. */
    lingerTicks: number
    flareInnerShare: number
    flareOuterShare: number
    flareBendShare: number
  }
  anchor: { cellInsetM: number; blockInsetM: number }
}

type Raw = Record<string, unknown>

export const MAGNET_FIELD_LOOK: MagnetFieldLook = loadMagnetFieldLook(looksFile)

/** Why the file is not a magnet field look; empty when it is. */
export function magnetFieldLookProblems(file: unknown): string[] {
  const raw = file as Raw
  const { attract = {}, repel = {}, anchor = {} } = raw as Record<string, Raw | undefined>
  return [
    ...colourProblems(raw, ['colour', 'arcColour']),
    ...wholeProblems('', raw, ['segmentsPerPiece', 'rampTicks', 'fadeTicks']),
    ...shareProblems('', raw, ['faintOpacity', 'brightOpacity']),
    ...positiveProblems('', raw, ['sweepPerSecond']),
    ...wholeProblems('attract.', attract, ['arcs']),
    ...positiveProblems('attract.', attract, ['bendShare']),
    ...wholeProblems('repel.', repel, ['flares', 'growTicks', 'lingerTicks']),
    ...positiveProblems('repel.', repel, ['flareInnerShare', 'flareOuterShare', 'flareBendShare']),
    ...positiveProblems('anchor.', anchor, ['cellInsetM', 'blockInsetM']),
  ]
}

function loadMagnetFieldLook(file: typeof looksFile): MagnetFieldLook {
  const problems = magnetFieldLookProblems(file)
  if (problems.length > 0)
    throw new Error(`The terrain-tools magnet field looks are refused:\n${problems.join('\n')}`)
  return file
}

function colourProblems(raw: Raw, keys: readonly string[]): string[] {
  return keys
    .filter((key) => !(typeof raw[key] === 'string' && /^#[0-9a-f]{6}$/i.test(raw[key])))
    .map((key) => `${key} must be a #rrggbb colour`)
}

function wholeProblems(block: string, raw: Raw, keys: readonly string[]): string[] {
  return keys
    .filter((key) => !(Number.isSafeInteger(raw[key]) && (raw[key] as number) > 0))
    .map((key) => `${block}${key} must be a whole number above 0`)
}

function positiveProblems(block: string, raw: Raw, keys: readonly string[]): string[] {
  return keys
    .filter((key) => !(typeof raw[key] === 'number' && (raw[key] as number) > 0))
    .map((key) => `${block}${key} must be a number above 0`)
}

function shareProblems(block: string, raw: Raw, keys: readonly string[]): string[] {
  return keys
    .filter((key) => !(typeof raw[key] === 'number' && raw[key] >= 0 && raw[key] <= 1))
    .map((key) => `${block}${key} must be 0 to 1`)
}

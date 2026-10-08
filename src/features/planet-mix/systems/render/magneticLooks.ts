/**
 * How a magnetic planet looks (GD lock on spec #258 Q1 "On screen", GD ruling on #293 Q1): the
 * aurora the kernel's planet sky band draws, and the faint dashed field lines between ferrous veins,
 * read once from `magneticLooks.json` and refused whole when broken. Look numbers only, tuned by
 * eye; nothing here reaches the authority, a snapshot or a digest.
 */
import looksFile from '../../magneticLooks.json'

export interface AuroraLook {
  colour: string
  heightM: number
  thicknessM: number
  flicker: number
}

export interface FieldLineLook {
  colour: string
  opacity: number
  /** One dash and its gap, metres along the line. */
  dashM: number
  /** How fast the dashes run along each line from its start; reduce motion holds them. */
  flowMPerSecond: number
  segmentsPerArc: number
  /** A lone vein's poles sit this share of its field's radius from its centre. */
  lobeReachShare: number
  /** Each pole-to-pole lobe bows out this share of the field's radius, on both sides. */
  lobeBendShares: readonly number[]
  /** Two veins whose fields touch are joined by a line bowing this share of their span. */
  pairBendShare: number
}

export interface MagneticLooks {
  aurora: AuroraLook
  fieldLines: FieldLineLook
}

type Raw = Record<string, unknown>

export const MAGNETIC_LOOKS: MagneticLooks = loadMagneticLooks(looksFile)

/** Why the file is not a magnetic look; empty when it is. */
export function magneticLookProblems(file: unknown): string[] {
  const { aurora = {}, fieldLines = {} } = file as { aurora?: Raw; fieldLines?: Raw }
  return [
    ...colourProblems('aurora', aurora),
    ...positiveProblems('aurora', aurora, ['heightM', 'thicknessM']),
    ...shareProblems('aurora', aurora, ['flicker']),
    ...colourProblems('fieldLines', fieldLines),
    ...positiveProblems('fieldLines', fieldLines, ['dashM', 'flowMPerSecond', 'segmentsPerArc']),
    ...shareProblems('fieldLines', fieldLines, ['opacity', 'lobeReachShare', 'pairBendShare']),
    ...bendProblems(fieldLines.lobeBendShares),
  ]
}

function loadMagneticLooks(file: typeof looksFile): MagneticLooks {
  const problems = magneticLookProblems(file)
  if (problems.length > 0)
    throw new Error(`The planet-mix magnetic looks are refused:\n${problems.join('\n')}`)
  return { aurora: file.aurora, fieldLines: file.fieldLines }
}

function colourProblems(block: string, raw: Raw): string[] {
  const isColour = typeof raw.colour === 'string' && /^#[0-9a-f]{6}$/i.test(raw.colour)
  return isColour ? [] : [`${block}.colour must be a #rrggbb colour`]
}

function positiveProblems(block: string, raw: Raw, keys: readonly string[]): string[] {
  return keys
    .filter((key) => !(typeof raw[key] === 'number' && (raw[key] as number) > 0))
    .map((key) => `${block}.${key} must be a number above 0`)
}

function shareProblems(block: string, raw: Raw, keys: readonly string[]): string[] {
  return keys.filter((key) => !isShare(raw[key])).map((key) => `${block}.${key} must be 0 to 1`)
}

function bendProblems(bends: unknown): string[] {
  const isBendList = Array.isArray(bends) && bends.length > 0 && bends.every(isShare)
  return isBendList ? [] : ['fieldLines.lobeBendShares must list shares from 0 to 1']
}

function isShare(value: unknown): boolean {
  return typeof value === 'number' && value >= 0 && value <= 1
}

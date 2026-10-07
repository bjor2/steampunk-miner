/**
 * The five extractor verbs (#142 "The extraction rigs" and its [Feel] verb parameters), read once
 * from `extractorVerbs.json` and refused whole when broken. Each verb names the extractor that
 * carries it; a rig with no verb row is refused too, so every extractor works some way.
 *
 * - **Tune** (Resonance Fork): stand within `rangeTiles`, at most `maxSpeedMmPerSecond`, for
 *   `tuneTicks` after the drill touches the ore, and it and its connected cells of the same ore
 *   stay drillable for `tunedHoldTicks`.
 * - **Capture** (Containment Hood): each cell the drill frees fills one of `canistersPerDive`
 *   canisters; refilled free with the recharge at the dock.
 * - **Mark** (Acid Etcher): the drill's touch sprays a mark `markRadiusTiles` round the cell (3x3),
 *   one of `marksPerDive`; after `etchTicks` its cells drill normally.
 * - **Pull** (Induction Coil): `pullTicks` after the touch, with the cell within `rangeTiles` and
 *   in line of sight, its ore comes out of the wall and the cell is open.
 * - **Tow** (Aether Tether): the freed lump is harpooned and towed, `lumpsInTow` at a time, and
 *   sold with the hold at the Sell bay.
 */
import { createFieldReader, type FieldReader } from '../../../systems/economy/economyFieldReader'
import verbsFile from '../extractorVerbs.json'
import { GATE_ROWS, type Rig } from './gateRows'

export interface VerbRows {
  tune: {
    rig: string
    tuneTicks: number
    maxSpeedMmPerSecond: number
    rangeTiles: number
    tunedHoldTicks: number
    maxTunedCells: number
  }
  capture: { rig: string; canistersPerDive: number }
  mark: { rig: string; marksPerDive: number; markRadiusTiles: number; etchTicks: number }
  pull: { rig: string; rangeTiles: number; pullTicks: number }
  tow: { rig: string; lumpsInTow: number }
}

export type VerbName = keyof VerbRows

export const VERB_NAMES: readonly VerbName[] = ['tune', 'capture', 'mark', 'pull', 'tow']

export const VERB_ROWS: VerbRows = loadVerbRows(verbsFile, GATE_ROWS.rigs)

/** Every problem with the file, or the rows when it has none. */
export function readVerbRows(
  raw: unknown,
  rigs: readonly Rig[],
): { rows: VerbRows } | { problems: string[] } {
  const reader = createFieldReader()
  const file = reader.object('extractorVerbs', raw)
  const rows = readEveryVerb(reader, file)
  missingVerbProblems(rows, rigs).forEach((problem) => reader.record(problem))
  return reader.problems.length > 0 ? { problems: reader.problems } : { rows }
}

/** The verb the extractor carries. */
export function verbOfRig(rig: Rig, rows: VerbRows = VERB_ROWS): VerbName {
  const verb = VERB_NAMES.find((name) => rows[name].rig === rig.id)
  if (verb === undefined) throw new Error(`extractor ${rig.id} has no verb`)
  return verb
}

function readEveryVerb(reader: FieldReader, file: Record<string, unknown>): VerbRows {
  const tune = reader.object('tune', file.tune)
  const capture = reader.object('capture', file.capture)
  const mark = reader.object('mark', file.mark)
  const pull = reader.object('pull', file.pull)
  const tow = reader.object('tow', file.tow)
  const count = (path: string, value: unknown) => reader.safeInteger(path, value)
  return {
    tune: {
      rig: reader.text('tune.rig', tune.rig),
      tuneTicks: count('tune.tuneTicks', tune.tuneTicks),
      maxSpeedMmPerSecond: count('tune.maxSpeedMmPerSecond', tune.maxSpeedMmPerSecond),
      rangeTiles: count('tune.rangeTiles', tune.rangeTiles),
      tunedHoldTicks: count('tune.tunedHoldTicks', tune.tunedHoldTicks),
      maxTunedCells: count('tune.maxTunedCells', tune.maxTunedCells),
    },
    capture: {
      rig: reader.text('capture.rig', capture.rig),
      canistersPerDive: count('capture.canistersPerDive', capture.canistersPerDive),
    },
    mark: {
      rig: reader.text('mark.rig', mark.rig),
      marksPerDive: count('mark.marksPerDive', mark.marksPerDive),
      markRadiusTiles: count('mark.markRadiusTiles', mark.markRadiusTiles),
      etchTicks: count('mark.etchTicks', mark.etchTicks),
    },
    pull: {
      rig: reader.text('pull.rig', pull.rig),
      rangeTiles: count('pull.rangeTiles', pull.rangeTiles),
      pullTicks: count('pull.pullTicks', pull.pullTicks),
    },
    tow: {
      rig: reader.text('tow.rig', tow.rig),
      lumpsInTow: count('tow.lumpsInTow', tow.lumpsInTow),
    },
  }
}

/** Each extractor carries exactly one verb, and each verb names an extractor. */
function missingVerbProblems(rows: VerbRows, rigs: readonly Rig[]): string[] {
  const named = VERB_NAMES.map((verb) => rows[verb].rig)
  return [
    ...rigs
      .filter((rig) => named.filter((id) => id === rig.id).length !== 1)
      .map((rig) => `extractor ${rig.id} must carry exactly one verb`),
    ...VERB_NAMES.filter((verb) => !rigs.some((rig) => rig.id === rows[verb].rig)).map(
      (verb) => `${verb}.rig must name an extractor, got ${JSON.stringify(rows[verb].rig)}`,
    ),
  ]
}

function loadVerbRows(raw: unknown, rigs: readonly Rig[]): VerbRows {
  const reading = readVerbRows(raw, rigs)
  if ('problems' in reading) {
    throw new Error(`mining-gates extractor verbs are refused:\n${reading.problems.join('\n')}`)
  }
  return reading.rows
}

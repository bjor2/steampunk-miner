/**
 * What makes a track's bands unloadable (ticket 809; the VS rule via Systems and the GD lock of
 * 24 Oct on #647): a step that breaks the VS rule, edges that are not its multiples or sit under 2
 * purchases apart, an authored step off its edge; a finish cycle too short to keep every finish
 * and pip count apart, with a neighbour repeated or an unknown finish; a finish that is not a
 * material named in 3 words or fewer; and a glint that would reach its track's cap.
 */
import { bandStepOf, finishesNeededOf } from './render/rigLookBands'
import type { RigLookGlint } from './render/rigLookGlint'
import type { RigLookFinish, TrackLookRows } from './render/rigLookIndex'

const FINISHES_MAX = 12
const HEX_COLOUR = /^#[0-9a-f]{6}$/
/** A band name is a data string of 3 words or fewer (Progression on #647). */
const BAND_NAME_WORDS_MAX = 3
/** Systems on #647: neighbouring edges at least 2 levels apart. */
const EDGE_GAP_MIN = 2

/** The VS step rule, its multiples as edges, and the authored steps on the first of them. */
export function bandProblemsOf(rows: TrackLookRows): string[] {
  const { decadeStep, twoPlanetBuys, step, edges } = rows.band
  const problems: string[] = []
  if (!isCountFrom(decadeStep, 1)) problems.push('decade step is not a count from 1')
  if (!isCountFrom(twoPlanetBuys, 0)) problems.push('two-planet buys are not a count')
  if (step !== bandStepOf(decadeStep, twoPlanetBuys)) problems.push(`step ${step} breaks the rule`)
  if (step < EDGE_GAP_MIN) problems.push(`step ${step} puts edges under ${EDGE_GAP_MIN} apart`)
  if (edges.some((edge, at) => edge !== (at + 1) * step)) problems.push('edges are not the steps')
  if (edges.length < rows.steps.length) problems.push('has more steps than edges')
  const offEdge = rows.steps.filter((row, at) => row.from !== edges[at])
  problems.push(...offEdge.map((row) => `step from ${row.from} is not on its edge`))
  return problems.map((problem) => `band: ${problem}`)
}

/** Long enough that no finish and pip count repeat, no two neighbours alike, the wrap included. */
export function finishCycleProblemsOf(
  rows: TrackLookRows,
  finishes: Readonly<Record<string, RigLookFinish>>,
): string[] {
  const cycle = rows.band.finishes
  const needed = finishesNeededOf(rows.band.step, rows.band.decadeStep)
  const problems = cycle.filter((id) => !(id in finishes)).map((id) => `${id} is not a finish`)
  if (cycle.length < needed || cycle.length > FINISHES_MAX) {
    problems.push(`has ${cycle.length} finishes, not ${needed} to ${FINISHES_MAX}`)
  }
  if (cycle.some((id, at) => id === cycle[(at + 1) % cycle.length])) {
    problems.push('repeats a neighbour')
  }
  if (finishes[cycle[0]]?.colour === rows.steps.at(-1)?.colour)
    problems.push('starts on the top step')
  return problems.map((problem) => `finishes: ${problem}`)
}

export function finishCatalogueProblemsOf(
  finishes: Readonly<Record<string, RigLookFinish>>,
): string[] {
  return Object.entries(finishes).flatMap(([id, finish]) =>
    finishProblemsOf(finish).map((problem) => `finish ${id}: ${problem}`),
  )
}

function finishProblemsOf(finish: RigLookFinish): string[] {
  const problems: string[] = []
  if (!isBandName(finish.name)) problems.push(`name ${finish.name} is not 1 to 3 words`)
  if (!HEX_COLOUR.test(finish.colour)) problems.push(notHexProblem(finish.colour))
  if (!isShare(finish.metalness)) problems.push('metalness is not 0 to 1')
  if (!isShare(finish.roughness)) problems.push('roughness is not 0 to 1')
  return problems
}

export function glintProblemsOf(glint: RigLookGlint): string[] {
  const problems: string[] = []
  if (!isCountFrom(glint.ticks, 1)) problems.push('ticks is not a count from 1')
  if (!HEX_COLOUR.test(glint.colour)) problems.push(notHexProblem(glint.colour))
  if (!(glint.glow > 0)) problems.push('glow is not above 0')
  return problems.map((problem) => `glint: ${problem}`)
}

/** A glint over the track's brightest look stays under the track's own cap. */
export function glintCapProblemsOf(
  rows: TrackLookRows,
  glint: RigLookGlint,
  cap: number,
): string[] {
  const brightest = Math.max(0, ...rows.steps.flatMap((step) => step.glows))
  return brightest + glint.glow < cap ? [] : ['glint reaches its cap']
}

export function isBandName(name: string): boolean {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
  return words.length >= 1 && words.length <= BAND_NAME_WORDS_MAX
}

function isCountFrom(value: number, least: number): boolean {
  return Number.isInteger(value) && value >= least
}

function isShare(value: number): boolean {
  return value >= 0 && value <= 1
}

function notHexProblem(colour: string): string {
  return `colour ${colour} is not #rrggbb`
}

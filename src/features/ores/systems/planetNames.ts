/**
 * Each planet's display name on its planet registry row (ticket 702, spec #678; Planet &
 * Narrative's copy): `ores.economy.json` `planets.rows[].name` on every planet before
 * `planets.generatedNames.fromPlanet` (planets 1 to 7), and a generated name on every planet from
 * it, so a planet past the last row, however far, still has one. No gameplay reads a name.
 *
 * - Row names: the planet in a word or two, in the ledger voice: no digit, at most
 *   `PLANET_NAME_CHARACTERS_MAX` characters and `TITLE_WORDS_MAX` words, no two the same.
 * - Generated names: a stem and an ending, walked stem first, so the first `stems × endings`
 *   generated planets each get their own; every lap after that adds its number ("Ashholt 2").
 *   The longest stem and ending leave room for a lap of `LAP_DIGITS_RESERVED` digits inside the
 *   budget, which runs past planet 600,000.
 */
import { PLANET_NAME_CHARACTERS_MAX, TITLE_WORDS_MAX } from '../../../constants/uiParts'
import { wordCountOf } from '../../../systems/views/uiTextBudget'

export interface GeneratedPlanetNames {
  /** The first planet named by the generator; every row before it carries its own name. */
  fromPlanet: number
  /** Capitalised openings, as "Brass". */
  stems: readonly string[]
  /** Lower-case closings, as "holt". */
  endings: readonly string[]
}

type Raw = Record<string, unknown>

const PATH = 'ore.planets'
const FIRST_PLANET = 1
/** Room kept in the budget for a lap number and its space: laps up to 9999. */
const LAP_DIGITS_RESERVED = 4
const STEM = /^[A-Z][a-z]+$/
const ENDING = /^[a-z]+$/
const DIGIT = /\d/

/** Why the names on the planet block break the rules above; empty when they keep them. */
export function planetNameProblems(planets: unknown, rows: unknown): string[] {
  const block = isRawMap(planets) ? planets : {}
  const generatedProblems = generatedNameProblems(block.generatedNames)
  if (generatedProblems.length > 0 || !Array.isArray(rows)) return generatedProblems
  const fromPlanet = (block.generatedNames as Raw).fromPlanet as number
  const list = rows.map((row) => (isRawMap(row) ? row : {}))
  return [...rowNamePresenceProblems(list, fromPlanet), ...rowNameCopyProblems(list)]
}

/** The block's generator typed; call only on a block `planetNameProblems` accepts. */
export function generatedPlanetNamesOf(generated: Raw): GeneratedPlanetNames {
  return {
    fromPlanet: generated.fromPlanet as number,
    stems: generated.stems as string[],
    endings: generated.endings as string[],
  }
}

/** The name a planet past its row's own name gets: a stem, an ending and, past one lap, the lap. */
export function generatedPlanetNameOf(
  generated: GeneratedPlanetNames,
  planetIndex: number,
): string {
  const { stems, endings } = generated
  const step = planetIndex - generated.fromPlanet
  const stem = stems[step % stems.length]
  const ending = endings[Math.floor(step / stems.length) % endings.length]
  const lap = Math.floor(step / (stems.length * endings.length)) + 1
  return lap === 1 ? `${stem}${ending}` : `${stem}${ending} ${lap}`
}

function generatedNameProblems(generated: unknown): string[] {
  const where = `${PATH}.generatedNames`
  if (!isRawMap(generated)) return [`${where} must hold fromPlanet, stems and endings`]
  const listProblems = [
    ...wordListProblems(generated.stems, STEM, `${where}.stems`, 'capitalised words'),
    ...wordListProblems(generated.endings, ENDING, `${where}.endings`, 'lower-case words'),
  ]
  return [
    ...(isWholeAbove(generated.fromPlanet, FIRST_PLANET)
      ? []
      : [`${where}.fromPlanet must be a whole planet after planet 1`]),
    ...(listProblems.length > 0
      ? listProblems
      : generatedFitProblems(generated.stems as string[], generated.endings as string[])),
  ]
}

function wordListProblems(list: unknown, pattern: RegExp, where: string, what: string): string[] {
  const isWordList =
    Array.isArray(list) &&
    list.length > 0 &&
    list.every((word) => typeof word === 'string' && pattern.test(word))
  if (!isWordList) return [`${where} must list ${what}`]
  return new Set(list).size === list.length ? [] : [`${where} lists a word twice`]
}

function generatedFitProblems(stems: readonly string[], endings: readonly string[]): string[] {
  const longest = longestLengthOf(stems) + longestLengthOf(endings) + 1 + LAP_DIGITS_RESERVED
  if (longest <= PLANET_NAME_CHARACTERS_MAX) return []
  return [
    `${PATH}.generatedNames: the longest name with a lap takes ${longest} characters, over ${PLANET_NAME_CHARACTERS_MAX}`,
  ]
}

/** Rows before the generator's first planet carry a name; rows from it carry none. */
function rowNamePresenceProblems(rows: readonly Raw[], fromPlanet: number): string[] {
  return rows.flatMap((row, at) => {
    const planet = at + FIRST_PLANET
    const isNamedRow = planet < fromPlanet
    const hasName = row.name !== undefined
    if (isNamedRow === hasName) return []
    const where = `${PATH}.rows[${at}]`
    return isNamedRow
      ? [`${where} must carry a name: planet ${planet} is before the generated names`]
      : [`${where}.name is set, but planet ${planet} takes a generated name`]
  })
}

function rowNameCopyProblems(rows: readonly Raw[]): string[] {
  const names = rows.map((row) => row.name).filter((name) => name !== undefined)
  const duplicates = names.filter((name, at) => names.indexOf(name) !== at)
  return [
    ...rows.flatMap((row, at) =>
      row.name === undefined ? [] : nameCopyProblems(row.name, `${PATH}.rows[${at}].name`),
    ),
    ...duplicates.map((name) => `${PATH}.rows: the name "${String(name)}" names two planets`),
  ]
}

function nameCopyProblems(name: unknown, where: string): string[] {
  if (typeof name !== 'string' || name.trim() !== name || name === '')
    return [`${where} must be a name with no outer spaces`]
  return [
    ...(name.length <= PLANET_NAME_CHARACTERS_MAX
      ? []
      : [`${where} "${name}" is over ${PLANET_NAME_CHARACTERS_MAX} characters`]),
    ...(wordCountOf(name) <= TITLE_WORDS_MAX
      ? []
      : [`${where} "${name}" is over ${TITLE_WORDS_MAX} words`]),
    ...(DIGIT.test(name) ? [`${where} "${name}" holds a digit`] : []),
  ]
}

function longestLengthOf(words: readonly string[]): number {
  return Math.max(...words.map((word) => word.length))
}

function isWholeAbove(value: unknown, floor: number): boolean {
  return Number.isSafeInteger(value) && (value as number) > floor
}

function isRawMap(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

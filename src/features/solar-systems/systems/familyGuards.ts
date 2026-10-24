/**
 * Why a new-content family row is not ticket 780's (`paletteRows.ts`); empty when it is. Each
 * family of Progression's SS2-B set carries a stable snake_case id, a kind, a display name, one rig
 * part on a vehicle attach point, a behaviour (its own effect, a summary, whether it telegraphs,
 * and the "Never" column: effects of the first system's content it never has) and its copy
 * templates. The copy keeps the budgets the game already holds other copy to: a name of at most
 * `NAME_WORDS_MAX` words inside the palette's display budget, a tag of one or two words as the
 * ores slice's hazard tags, an arrival line that opens with the tag and fits two lines of the 360 px
 * card (`CARD_LINE_CHARACTERS`), and hover lines within the kernel's tooltip budget, each measured
 * with the longest planet name filled in. Behaviour against the first system is `familyBehaviours.ts`.
 */
import { TOOLTIP_LINE_WORDS_MAX, TOOLTIP_LINES_MAX } from '../../../constants/uiParts'
import { isAttachId } from '../../../systems/registries/vehicleAttach'
import { wordCountOf } from '../../../systems/views/uiTextBudget'
import { CARD_LINE_CHARACTERS } from '../../ores'
import { filledCopyOf } from './familyCopy'

type Raw = Record<string, unknown>

/** A generated or family name is at most this many words (ticket 780). */
export const NAME_WORDS_MAX = 4
/** A planet card tag is one or two words in sentence case (the ores slice's hazard tag rule). */
const TAG = /^[A-Z][a-z]+(-[a-z]+)?( [a-z]+)?$/
export const TAG_CHARACTERS_MAX = 12
const SNAKE_ID = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/
const NEW_CONTENT_KINDS = ['enemy', 'hazard', 'ore_family']
const FAMILY_FIELDS = ['id', 'kind', 'name', 'rigPart', 'behaviour', 'copy']

/** The longest fill a template meets: the longest `<Prefix> <Noun> <g>` the palette can draw. */
export interface CopyFillBudget {
  longestName: string
  longestFolio: string
}

export function familyRowProblems(family: Raw, where: string, budget: CopyFillBudget): string[] {
  const isKind = typeof family.kind === 'string' && NEW_CONTENT_KINDS.includes(family.kind)
  return [
    ...(typeof family.id === 'string' && SNAKE_ID.test(family.id)
      ? []
      : [`${where}.id must be snake_case`]),
    ...(isKind ? [] : [`${where}.kind must be one of ${NEW_CONTENT_KINDS.join(', ')}`]),
    ...nameProblems(family.name, `${where}.name`, budget),
    ...rigPartProblems(asMap(family.rigPart), `${where}.rigPart`),
    ...behaviourProblems(asMap(family.behaviour), `${where}.behaviour`),
    ...copyProblems(asMap(family.copy), `${where}.copy`, budget),
    ...Object.keys(family)
      .filter((field) => !FAMILY_FIELDS.includes(field))
      .map((field) => `${where}.${field} is not a family field`),
  ]
}

function nameProblems(name: unknown, where: string, budget: CopyFillBudget): string[] {
  if (!isText(name)) return [`${where} must be the display name`]
  return [
    ...(wordCountOf(name) <= NAME_WORDS_MAX ? [] : [`${where} is over ${NAME_WORDS_MAX} words`]),
    ...(name.length <= budget.longestName.length
      ? []
      : [`${where} is over ${budget.longestName.length} characters, the display budget`]),
  ]
}

function rigPartProblems(part: Raw, where: string): string[] {
  return [
    ...(isText(part.name) && wordCountOf(part.name) <= NAME_WORDS_MAX
      ? []
      : [`${where}.name must name the part in at most ${NAME_WORDS_MAX} words`]),
    ...(typeof part.attach === 'string' && isAttachId(part.attach)
      ? []
      : [`${where}.attach must be a vehicle attach point`]),
  ]
}

function behaviourProblems(behaviour: Raw, where: string): string[] {
  return [
    ...(typeof behaviour.effect === 'string' && SNAKE_ID.test(behaviour.effect)
      ? []
      : [`${where}.effect must be a snake_case effect`]),
    ...(isText(behaviour.summary) ? [] : [`${where}.summary must say what the family does`]),
    ...(typeof behaviour.telegraphed === 'boolean'
      ? []
      : [`${where}.telegraphed must be true or false`]),
    ...neverColumnProblems(behaviour.never, `${where}.never`),
  ]
}

function neverColumnProblems(never: unknown, where: string): string[] {
  if (!Array.isArray(never)) return [`${where} must list the effects the family never has`]
  return never.flatMap((entry, at) => {
    const row = asMap(entry)
    const isEffect = typeof row.effect === 'string' && SNAKE_ID.test(row.effect)
    const isOwner = typeof row.of === 'string' && SNAKE_ID.test(row.of)
    return [
      ...(isEffect ? [] : [`${where}[${at}].effect must be a snake_case effect`]),
      ...(isOwner ? [] : [`${where}[${at}].of must name the first-system id that has it`]),
    ]
  })
}

function copyProblems(copy: Raw, where: string, budget: CopyFillBudget): string[] {
  const tag = typeof copy.tag === 'string' ? copy.tag : ''
  return [
    ...(isTag(tag)
      ? []
      : [
          `${where}.tag must be one or two capitalised words, ${TAG_CHARACTERS_MAX} characters at most`,
        ]),
    ...arrivalLineProblems(copy.arrivalLine, tag, `${where}.arrivalLine`, budget),
    ...hoverLineProblems(copy.hoverLines, `${where}.hoverLines`, budget),
  ]
}

function isTag(tag: string): boolean {
  return TAG.test(tag) && tag.length <= TAG_CHARACTERS_MAX
}

/** The tag, a full stop, one clause ending in a full stop, no digit, two card lines when filled. */
function arrivalLineProblems(
  line: unknown,
  tag: string,
  where: string,
  budget: CopyFillBudget,
): string[] {
  if (typeof line !== 'string') return [`${where} must be the arrival line`]
  const opening = `${tag}. `
  const isRead = line.startsWith(opening) && line.length > opening.length && line.endsWith('.')
  return [
    ...(isRead ? [] : [`${where} must open with "${opening}" and end with a full stop`]),
    ...(/\d/.test(line) ? [`${where} holds a digit: the ledger voice spells numbers out`] : []),
    ...cardLineProblems(line, where, budget),
  ]
}

function hoverLineProblems(lines: unknown, where: string, budget: CopyFillBudget): string[] {
  if (!Array.isArray(lines) || lines.length === 0) return [`${where} must list the hover lines`]
  return [
    ...(lines.length <= TOOLTIP_LINES_MAX
      ? []
      : [`${where} has ${lines.length} lines, over ${TOOLTIP_LINES_MAX}`]),
    ...lines.flatMap((line, at) => hoverLineProblemsOf(line, `${where}[${at}]`, budget)),
  ]
}

function hoverLineProblemsOf(line: unknown, where: string, budget: CopyFillBudget): string[] {
  if (!isText(line) || !line.endsWith('.')) return [`${where} must be a sentence`]
  const words = wordCountOf(longestFillOf(line, budget))
  return [
    ...(words <= TOOLTIP_LINE_WORDS_MAX
      ? []
      : [`${where} has ${words} words filled, over ${TOOLTIP_LINE_WORDS_MAX}`]),
    ...cardLineProblems(line, where, budget),
  ]
}

function cardLineProblems(line: string, where: string, budget: CopyFillBudget): string[] {
  const filled = longestFillOf(line, budget).length
  return filled <= CARD_LINE_CHARACTERS
    ? []
    : [`${where} is ${filled} characters filled, over ${CARD_LINE_CHARACTERS}, the 360 px card`]
}

/** The template filled with the longest name the palette can draw and its folio. */
function longestFillOf(template: string, budget: CopyFillBudget): string {
  return filledCopyOf(template, { planet: budget.longestName, g: budget.longestFolio })
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim() === value
}

function asMap(value: unknown): Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : {}
}

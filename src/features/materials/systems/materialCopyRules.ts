/**
 * The copy guards of a material (ticket 444): its name, the epithet plus the family's display name
 * ("Gilded Brassvein"), is at most four words, and its flavour at most twelve words in the Guild
 * quartermaster ledger voice of #159, judged by the descriptions slice's own flavour rules.
 */
import { flavourProblemsOf } from '../../descriptions'

export const MATERIAL_NAME_MAX_WORDS = 4
export const MATERIAL_FLAVOUR_MAX_WORDS = 12

/**
 * The species' own name, as the pickup popup shows a unit of it (ticket 695): the epithet alone,
 * with no family after it, so two species of one family never read alike.
 */
export function speciesNameOf(epithet: string): string {
  return epithet.trim()
}

/** `<epithet> <family name>`, the name a ledger line and the codex show. */
export function materialNameOf(epithet: string, familyName: string): string {
  return `${epithet.trim()} ${familyName}`
}

export function materialCopyProblems(
  id: string,
  epithet: string,
  familyName: string,
  flavour: string,
): string[] {
  return [
    ...nameProblems(id, materialNameOf(epithet, familyName)),
    ...flavourWordProblems(id, flavour),
    ...flavourProblemsOf(flavour).map((problem) => `${id} flavour ${problem}`),
  ]
}

function nameProblems(id: string, name: string): string[] {
  const words = wordCountOf(name)
  if (words <= MATERIAL_NAME_MAX_WORDS) return []
  return [`${id} name "${name}" is ${words} words, over ${MATERIAL_NAME_MAX_WORDS}`]
}

function flavourWordProblems(id: string, flavour: string): string[] {
  const words = wordCountOf(flavour)
  if (words <= MATERIAL_FLAVOUR_MAX_WORDS) return []
  return [`${id} flavour is ${words} words, over ${MATERIAL_FLAVOUR_MAX_WORDS}`]
}

function wordCountOf(text: string): number {
  return text.trim().split(/\s+/).length
}

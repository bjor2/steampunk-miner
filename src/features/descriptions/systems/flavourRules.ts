/**
 * The flavour line's copy rules (#159 section 3 rule 2 and section 4; the #164 card contract
 * section 3): one present-tense sentence of at most 80 characters, no digits, ending in a full
 * stop, and none of the banned words. "Rig" is the Guild's name for the vehicle, so item text never
 * uses it (Game Director's naming ruling on #159). Numbers live only on the stat lines, so a
 * flavour line cannot go stale when a curve moves.
 */

export const FLAVOUR_MAX_CHARACTERS = 80

/** #159 section 3 rule 2, plus "rig" by the naming ruling; matched as whole words. */
export const BANNED_FLAVOUR_WORDS: readonly string[] = ['magic', 'spell', 'best', 'ultimate', 'rig']

const DIGIT = /\d/
const SENTENCE_END = /[.!?]/g

/** Every way a flavour line breaks the copy rules; empty when it may ship. */
export function flavourProblemsOf(flavour: string): string[] {
  return [
    ...digitProblems(flavour),
    ...lengthProblems(flavour),
    ...endingProblems(flavour),
    ...sentenceCountProblems(flavour),
    ...bannedWordProblems(flavour),
  ]
}

function digitProblems(flavour: string): string[] {
  return DIGIT.test(flavour) ? ['holds a digit; numbers belong on the stat lines'] : []
}

function lengthProblems(flavour: string): string[] {
  if (flavour.length <= FLAVOUR_MAX_CHARACTERS) return []
  return [`is ${flavour.length} characters, over ${FLAVOUR_MAX_CHARACTERS}`]
}

function endingProblems(flavour: string): string[] {
  return flavour.endsWith('.') ? [] : ['does not end in a full stop']
}

function sentenceCountProblems(flavour: string): string[] {
  const ends = flavour.match(SENTENCE_END)?.length ?? 0
  return ends > 1 ? ['is more than one sentence'] : []
}

function bannedWordProblems(flavour: string): string[] {
  return BANNED_FLAVOUR_WORDS.filter((word) => isWordUsed(flavour, word)).map(
    (word) => `uses the banned word "${word}"`,
  )
}

function isWordUsed(flavour: string, word: string): boolean {
  return new RegExp(`\\b${word}s?\\b`, 'i').test(flavour)
}

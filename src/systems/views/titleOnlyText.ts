/**
 * Text a panel carries only in a `title=` attribute (spec #470 section 3, ticket 476): a hover
 * title never shows on touch, so any title whose words no drawn line repeats is information a
 * phone player cannot reach. Pure: it reads server-rendered markup, where React escapes text and
 * attributes alike; a brass tooltip's plate counts as drawn, since a tap opens it.
 */

const TITLE_ATTRIBUTE = /\stitle="([^"]*)"/g
const TAG = /<[^>]*>/g

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#39;': "'",
}

/** Every `title=` text the markup's drawn text does not contain, in order. */
export function titleOnlyTextsOf(markup: string): string[] {
  const drawn = drawnTextOf(markup)
  return [...markup.matchAll(TITLE_ATTRIBUTE)]
    .map((match) => normalisedTextOf(match[1]))
    .filter((title) => title !== '' && !drawn.includes(title))
}

function drawnTextOf(markup: string): string {
  return normalisedTextOf(markup.replace(TAG, ' '))
}

function normalisedTextOf(text: string): string {
  return text
    .replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (entity) => ENTITIES[entity])
    .replace(/<!-- -->/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

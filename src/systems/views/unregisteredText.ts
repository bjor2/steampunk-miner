/**
 * Text a panel draws outside the shared Title+OneLine element (TD ruling on #424 Q1): every
 * element that holds text of its own outside a `data-ui-text` element or its `data-tooltip` plate
 * is one unregistered element, so a panel nobody moved onto the element is over budget. Pure: it
 * reads server-rendered markup, where React escapes `<` and `>` in text and attributes alike.
 */

/** Elements that never close (HTML void elements). */
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

const MARKUP_TOKEN = /<!--[\s\S]*?-->|<\/[^>]*>|<[a-zA-Z][^>]*>|[^<]+/g
const REGISTERED_ATTRIBUTE = /\sdata-(?:ui-text|tooltip)=/

interface OpenElement {
  readonly tag: string
  readonly isRegistered: boolean
  hasStrayText: boolean
}

/** One entry per element holding unregistered text: its tag and the text, for the report. */
export function unregisteredTextsOf(markup: string): string[] {
  const stack: OpenElement[] = [openElementOf('#root', false)]
  const found: string[] = []
  for (const token of markup.match(MARKUP_TOKEN) ?? []) readToken(token, stack, found)
  return found
}

function readToken(token: string, stack: OpenElement[], found: string[]): void {
  if (token.startsWith('<!--')) return
  if (token.startsWith('</')) return closeElement(stack)
  if (token.startsWith('<')) return openTag(token, stack)
  noteText(token, stack[stack.length - 1], found)
}

function openTag(token: string, stack: OpenElement[]): void {
  const tag = /^<([a-zA-Z][\w:-]*)/.exec(token)?.[1].toLowerCase() ?? ''
  if (VOID_TAGS.has(tag) || token.endsWith('/>')) return
  const parent = stack[stack.length - 1]
  stack.push(openElementOf(tag, parent.isRegistered || REGISTERED_ATTRIBUTE.test(token)))
}

function closeElement(stack: OpenElement[]): void {
  if (stack.length > 1) stack.pop()
}

function openElementOf(tag: string, isRegistered: boolean): OpenElement {
  return { tag, isRegistered, hasStrayText: false }
}

/** The first stray text of an element marks it; more text in the same element is the same one. */
function noteText(text: string, element: OpenElement, found: string[]): void {
  const shown = text.replace(/\s+/g, ' ').trim()
  if (shown === '' || element.isRegistered || element.hasStrayText) return
  element.hasStrayText = true
  found.push(`<${element.tag}> ${shown}`)
}

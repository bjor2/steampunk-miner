/**
 * Rules for the stylesheets on a touch screen (spec #470 section 3, ticket 476): a hover style
 * sits inside `@media (hover: hover)` so it never sticks after a tap; a viewport-height length
 * carries a `dvh` twin for the same selector and property, so a phone's sliding URL bar never
 * jumps the layout (the `vh` stays as the fallback); and the page root turns off the browser's
 * pull-to-refresh, double-tap zoom, long-press callout, tap flash and text selection. Pure: it
 * reads sheet text, so the tree-wide spec feeds it every `.css` under `src/`.
 */

/** One style rule: its selector, the at-rule preludes around it, and its declarations. */
export interface CssRule {
  readonly selector: string
  readonly atRules: readonly string[]
  readonly declarations: readonly CssDeclaration[]
}

export interface CssDeclaration {
  readonly property: string
  readonly value: string
}

/** What the page root declares on `html, body` for touch (the TD's list on #470 section 3). */
export const ROOT_TOUCH_DECLARATIONS: readonly CssDeclaration[] = [
  { property: 'overscroll-behavior', value: 'none' },
  { property: 'touch-action', value: 'manipulation' },
  { property: '-webkit-touch-callout', value: 'none' },
  { property: '-webkit-tap-highlight-color', value: 'transparent' },
  { property: 'user-select', value: 'none' },
]

const HOVER_MEDIA = /@media[^{]*\(\s*hover\s*:\s*hover\s*\)/
/** A length in `vh`: a digit right before the unit, so `dvh`, `svh` and `lvh` never match. */
const VIEWPORT_HEIGHT = /\d(?:\.\d+)?vh\b/
const DYNAMIC_VIEWPORT_HEIGHT = /\d(?:\.\d+)?dvh\b/

/** Every style rule of a sheet, in order; at-rule blocks are kept as each inner rule's context. */
export function cssRulesOf(css: string): CssRule[] {
  const rules: CssRule[] = []
  const openPreludes: string[] = []
  let text = ''
  for (const char of withoutComments(css)) {
    if (char === '{') openPreludes.push(compactSpaces(text))
    else if (char === '}') closeBlock(openPreludes, text, rules)
    else text += char
    if (char === '{' || char === '}') text = ''
  }
  return rules
}

/** The selectors styling `:hover` outside a `(hover: hover)` media block. */
export function stickyHoverSelectorsOf(rules: readonly CssRule[]): string[] {
  return rules.filter(isHoverRuleOutsideHoverMedia).map((rule) => rule.selector)
}

/** `selector { property }` for each `vh` length with no `dvh` twin for that selector and property. */
export function viewportHeightsWithoutTwinOf(rules: readonly CssRule[]): string[] {
  const twins = new Set(rules.flatMap(dynamicHeightKeysOf))
  return rules.flatMap((rule) =>
    rule.declarations
      .filter((declaration) => VIEWPORT_HEIGHT.test(declaration.value))
      .map((declaration) => keyOf(rule.selector, declaration.property))
      .filter((key) => !twins.has(key)),
  )
}

/** The root touch declarations the sheet's `html, body` rule lacks; all of them when it has none. */
export function missingRootTouchDeclarationsOf(rules: readonly CssRule[]): string[] {
  const declared = new Set(
    rules.filter(isRootRule).flatMap((rule) => rule.declarations.map(declarationTextOf)),
  )
  return ROOT_TOUCH_DECLARATIONS.map(declarationTextOf).filter((text) => !declared.has(text))
}

function closeBlock(openPreludes: string[], body: string, rules: CssRule[]): void {
  const selector = openPreludes.pop() ?? ''
  if (selector.startsWith('@')) return
  rules.push({ selector, atRules: [...openPreludes], declarations: declarationsOf(body) })
}

function declarationsOf(body: string): CssDeclaration[] {
  return body
    .split(';')
    .map((part) => /^\s*([-\w]+)\s*:([\s\S]*)$/.exec(part))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ property: match[1].toLowerCase(), value: compactSpaces(match[2]) }))
}

function isHoverRuleOutsideHoverMedia(rule: CssRule): boolean {
  return rule.selector.includes(':hover') && !rule.atRules.some((at) => HOVER_MEDIA.test(at))
}

function dynamicHeightKeysOf(rule: CssRule): string[] {
  return rule.declarations
    .filter((declaration) => DYNAMIC_VIEWPORT_HEIGHT.test(declaration.value))
    .map((declaration) => keyOf(rule.selector, declaration.property))
}

/** A rule whose selector list names both `html` and `body`. */
function isRootRule(rule: CssRule): boolean {
  const selectors = rule.selector.split(',').map((selector) => selector.trim())
  return selectors.includes('html') && selectors.includes('body')
}

function keyOf(selector: string, property: string): string {
  return `${selector} { ${property} }`
}

function declarationTextOf(declaration: CssDeclaration): string {
  return `${declaration.property}: ${declaration.value}`
}

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function compactSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

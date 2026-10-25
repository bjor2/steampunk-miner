/**
 * The brass crop check on a screen's markup (ticket 885, spec #678): every control on it is a
 * kit control (`data-kit-control`), and every figure on it sits in an icon-plus-value fact
 * (`data-fact`), so no browser-default control and no bare number shows. A hidden subtree (a shut
 * tooltip plate) shows nothing and is not judged. The e2e crop (`e2e/browser/ui/brassCrop.ts`)
 * reads the same two marks off the live DOM; this one reads a server render, so the rule holds
 * in the unit suite too.
 */

export interface BrassCropFindings {
  /** Each control drawn without the kit, by its opening tag. */
  defaultControls: string[]
  /** Each shown text with a digit outside a fact. */
  bareNumbers: string[]
}

export const NO_BRASS_CROP_FINDINGS: BrassCropFindings = { defaultControls: [], bareNumbers: [] }

interface OpenElement {
  tag: string
  isFact: boolean
  isHidden: boolean
}

const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|[^<]+/g
const VOID_TAGS = new Set([
  'area',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'wbr',
])
const CONTROL_TAGS = new Set(['button', 'input', 'select', 'textarea'])
const DIGIT = /\d/

export function brassCropFindingsOf(markup: string): BrassCropFindings {
  const findings: BrassCropFindings = { defaultControls: [], bareNumbers: [] }
  const open: OpenElement[] = []
  for (const token of markup.matchAll(TOKEN)) readToken(token, open, findings)
  return findings
}

function readToken(
  token: RegExpMatchArray,
  open: OpenElement[],
  findings: BrassCropFindings,
): void {
  const [whole, closing, tag, attributes] = token
  if (whole.startsWith('<!--')) return
  if (tag === undefined) return judgeText(whole, open, findings)
  if (closing === '/') {
    open.pop()
    return
  }
  judgeElement(tag.toLowerCase(), attributes, open, findings)
}

function judgeElement(
  tag: string,
  attributes: string,
  open: OpenElement[],
  findings: BrassCropFindings,
): void {
  const parent = open.at(-1)
  const element = {
    tag,
    isFact: (parent?.isFact ?? false) || hasAttribute(attributes, 'data-fact'),
    isHidden: (parent?.isHidden ?? false) || hasAttribute(attributes, 'hidden'),
  }
  if (isDefaultControl(tag, attributes) && !element.isHidden) {
    findings.defaultControls.push(`<${tag}${attributes}>`)
  }
  if (!VOID_TAGS.has(tag) && !attributes.trimEnd().endsWith('/')) open.push(element)
}

function judgeText(text: string, open: OpenElement[], findings: BrassCropFindings): void {
  const parent = open.at(-1)
  if (parent?.isFact || parent?.isHidden || !DIGIT.test(text)) return
  if (parent?.tag === 'style' || parent?.tag === 'script') return
  findings.bareNumbers.push(text.trim())
}

function isDefaultControl(tag: string, attributes: string): boolean {
  const isControl = CONTROL_TAGS.has(tag) || /\brole="button"/.test(attributes)
  return isControl && !hasAttribute(attributes, 'data-kit-control')
}

function hasAttribute(attributes: string, name: string): boolean {
  return new RegExp(`(^|\\s)${name}(=|\\s|$)`).test(attributes)
}

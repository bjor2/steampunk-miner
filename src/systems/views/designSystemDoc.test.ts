import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DESIGN_TOKENS } from './designSystem'

// docs/ui/design-system.md is the design spec (ticket 679) and designTokens.json is its source of
// truth: every token has a row in the document's reference with the same value, and every rule of
// the GD lock on #678 is mapped to a token or a limit there. Read as text, so a token edit that
// forgets the document, or a document edit that invents a number, fails here.

const DOC = readFileSync(new URL('../../../docs/ui/design-system.md', import.meta.url), 'utf8')

type TokenRow = [path: string, value: string]

function textOf(value: unknown): string {
  return Array.isArray(value) ? value.join(', ') : String(value)
}

/** A token's path and value, one row per leaf; a listed object (a cue, a tier) is one row by its id or name. */
function rowsOf(path: string, value: unknown): TokenRow[] {
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
    return value.map((entry: Record<string, unknown>) => rowOfListed(path, entry))
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, inner]) =>
      rowsOf(path === '' ? key : `${path}.${key}`, inner),
    )
  }
  return [[path, textOf(value)]]
}

function rowOfListed(path: string, entry: Record<string, unknown>): TokenRow {
  const key = String(entry.id ?? entry.name)
  const rest = Object.entries(entry)
    .filter(([field]) => field !== 'id' && field !== 'name')
    .map(([field, inner]) => `${field} ${textOf(inner)}`)
    .join(' · ')
  return [`${path}.${key}`, rest]
}

/** The reference tables of section 16, where a row is a token's path then its value. */
const REFERENCE = DOC.slice(DOC.indexOf('## 16.')).split('\n')

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function referenceRowOf(path: string): string | undefined {
  const row = new RegExp(`^\\| \`${escapeForRegExp(path)}\`\\s+\\|`)
  return REFERENCE.find((line) => row.test(line))
}

const TOKEN_ROWS = rowsOf('', DESIGN_TOKENS)

/** The GD lock's rules (spec #678, ticket 679 body), each a phrase the rule map must carry. */
const GD_LOCK_RULES = [
  '12% of a phone screen, 8% on desktop',
  'middle band',
  'heat only above 60%',
  'depth the only always-on number',
  '3 significant figures, 6 characters',
  'prices round up, balances down',
  'odometer rolls in 0.6 s or less',
  'titles of 3 words, hover lines of 12, toasts of 6 words',
  'tap targets at least 44 px, text at least 14 px',
  'top 15%',
  'edge glows plus an icon and a sound',
  '30%, 15% and 0%',
  'needle ease 150 to 250 ms',
  '200 ms or less; Reduce Motion',
  're-skin through tokens only',
  'Outfitter, Patent Office, Hold, Ledger, Gearbox',
  '360x640 and 1440x900',
  '4 thumb slots plus overflow',
  'status icons 3 on phone and 6 on desktop',
  'one tabbed base panel',
  'a new kind needs a ticket',
  'no economy change',
]

describe('the design system document', () => {
  it('has a reference row for every token, with its value', () => {
    const missing = TOKEN_ROWS.filter(([path, value]) => !referenceRowOf(path)?.includes(value))
    expect(missing).toEqual([])
  })

  it('lists no token the file does not hold', () => {
    const known = new Set(TOKEN_ROWS.map(([path]) => path))
    const listed = REFERENCE.flatMap((line) => {
      const match = /^\| `([a-zA-Z0-9_.]+)`\s+\|/.exec(line)
      return match === null ? [] : [match[1]]
    })
    expect(listed.filter((path) => !known.has(path))).toEqual([])
  })

  it('maps every rule of the GD lock to a token or a limit', () => {
    const unmapped = GD_LOCK_RULES.filter((rule) => !DOC.includes(rule))
    expect(unmapped).toEqual([])
  })

  it('names the ticket that builds each part of the component inventory', () => {
    const inventory = DOC.slice(DOC.indexOf('## 10.'), DOC.indexOf('## 11.'))
    const rows = inventory.split('\n').filter((line) => /^\| [a-z]/.test(line))
    expect(rows.length).toBeGreaterThanOrEqual(15)
    expect(rows.every((row) => /\| (#\d{3}|exists)\s+\|$/.test(row))).toBe(true)
  })
})

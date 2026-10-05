import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import economyFile from './economy.json'

// #20 acceptance: only integer exponents in the formula modules (a static check), and no price,
// ratio, tier or fee number in game code outside economy.json.

const SRC = new URL('../../', import.meta.url)
const ECONOMY_DIR = new URL('./', import.meta.url)

function sourceFilesUnder(directory: URL): URL[] {
  return readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.tsx?$/.test(path) && !path.endsWith('.test.ts'))
    .map((path) => new URL(path, directory))
}

/** Source text without comments, so a cited formula in a doc comment is not code. */
function codeOf(file: URL): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Numeric literals in code, with string and template contents removed first. */
function numericLiteralsOf(code: string): string[] {
  const withoutText = code.replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`|\/\^[^\n]*\$\//g, "''")
  return withoutText.match(/(?<![\w.])\d[\d_]*(\.\d+)?(e[+-]?\d+)?n?(?![\w.])/g) ?? []
}

/** Every decimal string in economy.json. */
function decimalStringsOf(value: unknown): string[] {
  if (typeof value === 'string') return /^\d+(\.\d+)?$/.test(value) ? [value] : []
  if (Array.isArray(value)) return value.flatMap(decimalStringsOf)
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap(decimalStringsOf)
  }
  return []
}

/**
 * Economy numbers distinctive enough to search for across the code base: the data's fractional
 * decimal strings of four or more characters, and the planet 1 prices they produce. Whole numbers
 * and short ones such as "0.5" also mean other things (a half tile, a band, a percentage) and are
 * covered by the formula modules holding no literal at all.
 */
function distinctiveEconomyNumbers(): string[] {
  const fromData = decimalStringsOf(economyFile).filter(
    (text) => text.includes('.') && text.length >= 4,
  )
  return [...new Set([...fromData, '0.045', '6.75', '11.25', '67.5', '675', '60.75'])]
}

describe('economy source scan', () => {
  it('keeps every number out of the economy formula modules except 0 and 1', () => {
    for (const file of sourceFilesUnder(ECONOMY_DIR)) {
      const literals = numericLiteralsOf(codeOf(file)).filter((text) => !['0', '1'].includes(text))
      expect({ file: file.pathname, literals }).toEqual({ file: file.pathname, literals: [] })
    }
  })

  it('raises to a power only in curveFamilies, which refuses a non-integer exponent', () => {
    const inexact = /\*\*|Math\.(pow|exp|log\w*)\b|\.pow\(/
    for (const file of sourceFilesUnder(ECONOMY_DIR)) {
      const code = codeOf(file)
      expect({ file: file.pathname, inexact: inexact.test(code) }).toEqual({
        file: file.pathname,
        inexact: false,
      })
      if (!file.pathname.endsWith('/curveFamilies.ts')) {
        expect({ file: file.pathname, powInt: code.includes('powInt(') }).toEqual({
          file: file.pathname,
          powInt: false,
        })
      }
    }
  })

  it('finds no economy price, ratio or fee number in game code outside economy.json', () => {
    const wanted = distinctiveEconomyNumbers()
    for (const file of sourceFilesUnder(SRC)) {
      const literals = numericLiteralsOf(codeOf(file))
      const found = literals.filter((text) => wanted.includes(text))
      expect({ file: file.pathname, found }).toEqual({ file: file.pathname, found: [] })
    }
  })

  it('searches for the ratios and coefficients that define the curves', () => {
    expect(distinctiveEconomyNumbers()).toEqual(
      expect.arrayContaining(['1.2544', '1.12', '1.24', '1.5376', '0.002', '17.5', '16.5']),
    )
  })
})

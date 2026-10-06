import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import economyFile from './economy.json'

// #20 acceptance: only integer exponents in the formula modules (a static check), and no price,
// ratio, tier or fee number in game code outside economy.json. A slice's numbers live in its own
// `src/features/<slice>/<slice>.economy.json` (feature-slices.md 1.1), so the scan reads those
// too and searches every slice's code, its `systems/` included.

const SRC = new URL('../../', import.meta.url)
const ECONOMY_DIR = new URL('./', import.meta.url)
const FEATURES_DIR = new URL('../../features/', import.meta.url)

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

/** Every slice's economy file: `<features>/<slice>/<slice>.economy.json`. */
function sliceEconomyFiles(featuresDir: URL): unknown[] {
  return readdirSync(featuresDir, { recursive: true, encoding: 'utf8' })
    .filter((path) => /^[^/\\]+[/\\][^/\\]+\.economy\.json$/.test(path))
    .map((path) => JSON.parse(readFileSync(new URL(path, featuresDir), 'utf8')) as unknown)
}

/**
 * Economy numbers distinctive enough to search for across the code base: the data's fractional
 * decimal strings of four or more characters, and the planet 1 prices they produce. Whole numbers
 * and short ones such as "0.5" also mean other things (a half tile, a band, a percentage) and are
 * covered by the formula modules holding no literal at all.
 */
function distinctiveEconomyNumbers(featuresDir: URL = FEATURES_DIR): string[] {
  return distinctiveNumbersOf([economyFile, ...sliceEconomyFiles(featuresDir)])
}

function distinctiveNumbersOf(economyFiles: readonly unknown[]): string[] {
  const fromData = economyFiles
    .flatMap(decimalStringsOf)
    .filter((text) => text.includes('.') && text.length >= 4)
  return [...new Set([...fromData, '0.045', '6.75', '11.25', '67.5', '675', '60.75'])]
}

/** The literals in `code` the economy data owns. */
function economyLiteralsIn(code: string, wanted: readonly string[]): string[] {
  return numericLiteralsOf(code).filter((text) => wanted.includes(text))
}

/** Each source file under `root` holding an economy literal, with what it holds. */
function economyLiteralFindings(root: URL, featuresDir: URL) {
  const wanted = distinctiveEconomyNumbers(featuresDir)
  return sourceFilesUnder(root)
    .map((file) => ({ file: file.pathname, found: economyLiteralsIn(codeOf(file), wanted) }))
    .filter((finding) => finding.found.length > 0)
}

/** A features folder in a temp dir holding one slice: its economy file and one systems/ rule. */
function plantedSliceFolder(): URL {
  const root = mkdtempSync(join(tmpdir(), 'economy-scan-'))
  mkdirSync(join(root, 'fuse-probe', 'systems'), { recursive: true })
  const economy = { fuse: { seconds: '2.75', blastShare: '0.3125' } }
  writeFileSync(join(root, 'fuse-probe', 'fuse-probe.economy.json'), JSON.stringify(economy))
  const rule = 'export function fuseSeconds(): number {\n  return 2.75\n}\n'
  writeFileSync(join(root, 'fuse-probe', 'systems', 'fuseSeconds.ts'), rule)
  return pathToFileURL(`${root}/`)
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
    expect(economyLiteralFindings(SRC, FEATURES_DIR)).toEqual([])
  })

  it("searches every slice's code, its systems/ folder included", () => {
    const scanned = sourceFilesUnder(SRC).map((file) => file.pathname)
    expect(scanned).toContainEqual(
      expect.stringMatching(/\/src\/features\/example\/systems\/describeExample\.ts$/),
    )
  })

  it("fails a fractional literal from a slice's economy file planted in its systems/", () => {
    const features = plantedSliceFolder()
    try {
      expect(economyLiteralFindings(features, features)).toEqual([
        { file: expect.stringMatching(/fuse-probe\/systems\/fuseSeconds\.ts$/), found: ['2.75'] },
      ])
    } finally {
      rmSync(features, { recursive: true, force: true })
    }
  })

  it('searches for the ratios and coefficients that define the curves', () => {
    expect(distinctiveEconomyNumbers()).toEqual(
      expect.arrayContaining([
        '1.2544',
        '1.12',
        '1.24',
        '1.225',
        '1.500625',
        '0.002',
        '17.5',
        '16.5',
      ]),
    )
  })
})

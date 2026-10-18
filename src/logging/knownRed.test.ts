import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { KnownRedMarker } from '../constants/knownRed'
import { knownRedVerdict, type KnownRedProblems } from './knownRed'

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url))

/** #396 is closed, so its metrics file carries `closed`. */
const CLOSED_FINDING = 396
const OPEN_FINDING_FILE = JSON.stringify({ schema: 1, ticket: 417, closed: null })

const STALL = 'seed 31415 stalled on planet 6 before the core of planet 8'
const CADENCE =
  'the schedule leaves 3 campaign planets in a row without a horizontal row, at most 2'

const RED: KnownRedProblems = { covered: [STALL], uncovered: [] }
const GREEN: KnownRedProblems = { covered: [], uncovered: [] }

function markerFor(finding: number, reason = 'stalls on planets 5 to 7'): KnownRedMarker {
  return { finding, reason }
}

function readCommittedTicketFile(finding: number): string | null {
  const url = new URL(`../../docs/metrics/tickets/${finding}.json`, import.meta.url)
  return existsSync(url) ? readFileSync(url, 'utf8') : null
}

function readOpenTicketFile(): string | null {
  return OPEN_FINDING_FILE
}

function sourceFilesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => join(dir, file))
}

/** Every exported constant typed or named as a known-red marker. */
function exportedMarkersIn(file: string): string[] {
  const pattern =
    /export\s+const\s+(\w+)\s*:\s*KnownRedMarker\b|export\s+const\s+(\w*KNOWN_RED\w*)/g
  return [...readFileSync(file, 'utf8').matchAll(pattern)].map((match) => match[1] ?? match[2])
}

describe('known-red marker (ticket 419)', () => {
  it('fails every problem when there is no marker', () => {
    const verdict = knownRedVerdict(null, RED, readOpenTicketFile)

    expect(verdict.failures).toEqual([STALL])
    expect(verdict.knownRed).toEqual([])
  })

  it.each([
    ['a zero finding', markerFor(0)],
    ['a NaN finding', markerFor(Number.NaN)],
    ['a fractional finding', markerFor(417.5)],
    ['a blank reason', markerFor(417, '  ')],
  ])('fails a marker with %s as having no finding ticket', (_, marker) => {
    const verdict = knownRedVerdict(marker, RED, readOpenTicketFile)

    expect(verdict.failures).toEqual(['known-red marker has no finding ticket', STALL])
  })

  it('fails as expired once the finding ticket has closed', () => {
    const verdict = knownRedVerdict(markerFor(CLOSED_FINDING), RED, readCommittedTicketFile)

    expect(verdict.failures[0]).toMatch(
      /^known-red marker for #396 expired: the finding closed on 2026-10-15T\S+; delete the marker/,
    )
    expect(verdict.failures).toContain(STALL)
  })

  it('holds a red gate with an open finding as known red and prints the finding number', () => {
    const verdict = knownRedVerdict(markerFor(417), RED, readOpenTicketFile)

    expect(verdict.failures).toEqual([])
    expect(verdict.knownRed).toEqual([`known-red (#417): ${STALL}`])
  })

  it('treats a finding with no metrics file yet as open', () => {
    const verdict = knownRedVerdict(markerFor(417), RED, () => null)

    expect(verdict.failures).toEqual([])
  })

  it('fails a green gate that is still marked known red', () => {
    const verdict = knownRedVerdict(markerFor(417), GREEN, readOpenTicketFile)

    expect(verdict.failures).toEqual([
      'campaignPacingGate is green but still marked known-red for #417: delete the marker',
    ])
  })

  it('names the gate it holds when that gate turns green (ticket 552)', () => {
    const verdict = knownRedVerdict(markerFor(558), GREEN, readOpenTicketFile, 'the sub-step floor')

    expect(verdict.failures).toEqual([
      'the sub-step floor is green but still marked known-red for #558: delete the marker',
    ])
  })

  it('fails an uncovered cadence problem even with an active marker', () => {
    const problems = { covered: [STALL], uncovered: [CADENCE] }

    const verdict = knownRedVerdict(markerFor(417), problems, readOpenTicketFile)

    expect(verdict.failures).toEqual([CADENCE])
    expect(verdict.knownRed).toEqual([`known-red (#417): ${STALL}`])
  })

  it('has CAMPAIGN_PACING_KNOWN_RED as the only exported marker in src', () => {
    const markers = sourceFilesUnder(SRC_DIR).flatMap(exportedMarkersIn)

    expect(markers).toEqual(['CAMPAIGN_PACING_KNOWN_RED'])
  })
})

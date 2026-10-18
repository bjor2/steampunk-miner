/**
 * The end digests the exact carry moves (ticket 535, A6): with `drill.exactCarry` on, only the
 * two goldens whose pose reports drill move their end digest, recorded with the switch on; every
 * other golden replays to its committed digests and mined order byte for byte. The goldens'
 * reports are 12-tick, so the report capsule of ticket 537 (interval 1 only) never moves them,
 * with its switch on or off. Spec support for the kill-switch pins; it reads, never writes.
 */
import { readdirSync, readFileSync } from 'node:fs'
import type { GoldenRun } from './goldenRun'

const GOLDEN_FOLDER = new URL('../../tests/golden/', import.meta.url)

/** The end digest of each golden the charge moves, with the switch on, by tick. */
export const CHARGED_DIGESTS: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  'casing-lined-band-2': { 2137: '4f2b5b5df597d375' },
  'collapse-band-2-grade-1': { 2125: 'fd1d79ed2a080e24' },
}

export function committedGoldenRuns(): GoldenRun[] {
  return readdirSync(GOLDEN_FOLDER)
    .filter((name) => name.endsWith('.golden.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(new URL(name, GOLDEN_FOLDER), 'utf8')) as GoldenRun)
}

/** The golden as the charge records it: its moved digests swapped in. */
export function asCharged(golden: GoldenRun): GoldenRun {
  const moved = CHARGED_DIGESTS[golden.name] ?? {}
  return {
    ...golden,
    digests: golden.digests.map((record) => ({
      ...record,
      digest: moved[record.tick] ?? record.digest,
    })),
  }
}

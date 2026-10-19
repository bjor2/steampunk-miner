/**
 * The end digests the exact carry moves (ticket 535, A6), pinned as they were before every dev flag
 * shipped on (Bjor, 18 Oct 2026: "turn everything on"). With `drill.exactCarry` on, as it ships,
 * only the two goldens whose pose reports drill move their end digest, and the committed goldens
 * (`tests/golden`, regenerated with `npm run golden:update` that day) hold the moved ones; every
 * other golden is the same either way. The pins below are protocol 91's digests (92's to 94's
 * too: ticket 553, ticket 552's latch fix and ticket 558's drill quantum, whose level-0 rigs keep
 * the base one, moved no digest of these two) with the exact carry
 * off (the codex's species record, ticket 546, and the per-purchase drill of ticket 552 moved
 * them with the rest), what those two goldens replay to with it off: the kill-switch's parity
 * proof. The goldens' reports are 12-tick, so the report capsule of ticket 537 (interval 1 only)
 * never moves them, switch on or off. Spec support for the kill-switch pins; it reads, never writes.
 */
import { readdirSync, readFileSync } from 'node:fs'
import type { GoldenRun } from './goldenRun'

const GOLDEN_FOLDER = new URL('../../tests/golden/', import.meta.url)

/** The end digest of each golden the charge moves, with the exact carry off, by tick. */
export const UNCHARGED_DIGESTS: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  'casing-lined-band-2': { 2137: '0bb6c4e93bdba1e5' },
  'collapse-band-2-grade-1': { 2125: 'fca832a15047704b' },
}

export function committedGoldenRuns(): GoldenRun[] {
  return readdirSync(GOLDEN_FOLDER)
    .filter((name) => name.endsWith('.golden.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(new URL(name, GOLDEN_FOLDER), 'utf8')) as GoldenRun)
}

/** The golden as the game records it with the exact carry off: its moved digests swapped back. */
export function asUncharged(golden: GoldenRun): GoldenRun {
  const moved = UNCHARGED_DIGESTS[golden.name] ?? {}
  return {
    ...golden,
    digests: golden.digests.map((record) => ({
      ...record,
      digest: moved[record.tick] ?? record.digest,
    })),
  }
}

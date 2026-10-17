import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AUTHORITY_DEV_FLAGS } from '../constants/devFlags'
import { withDrillExactCarry } from '../systems/authority/cutCarryFixtures'
import { goldenRunProblems, type GoldenRun } from './goldenRun'

// The `drill.exactCarry` kill-switch (ticket 535, A6, the TD shape 6228682000 item 4 and the
// goldens gate). It ships off until #541's heat change has landed (the GD 6234312287 condition 1),
// so the committed goldens are protocol 84's digests and mined order under the current header,
// the cheapest proof that the charge on density removed changed nothing with the switch off. With
// the switch on, only the two goldens whose pose reports drill move their end digest, to the
// digests pinned below (recorded by `npm run golden:update` with the switch on at `f02d0774`);
// every other golden replays to its committed digests and mined order byte for byte.

const GOLDEN_FOLDER = new URL('../../tests/golden/', import.meta.url)

/** The end digest of each golden the charge moves, with the switch on, by tick. */
const CHARGED_DIGESTS: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  'casing-lined-band-2': { 2137: '4f2b5b5df597d375' },
  'collapse-band-2-grade-1': { 2125: 'fd1d79ed2a080e24' },
}

function committedGoldenRuns(): GoldenRun[] {
  return readdirSync(GOLDEN_FOLDER)
    .filter((name) => name.endsWith('.golden.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(new URL(name, GOLDEN_FOLDER), 'utf8')) as GoldenRun)
}

/** The golden as the charge records it: its moved digests swapped in. */
function asCharged(golden: GoldenRun): GoldenRun {
  const moved = CHARGED_DIGESTS[golden.name] ?? {}
  return {
    ...golden,
    digests: golden.digests.map((record) => ({
      ...record,
      digest: moved[record.tick] ?? record.digest,
    })),
  }
}

describe('drill.exactCarry kill-switch (ticket 535)', () => {
  it('ships with the charge on density removed off until #541 lands', () => {
    expect(AUTHORITY_DEV_FLAGS['drill.exactCarry']).toBe(false)
  })

  it('pins a charged digest only where the charge moves it', () => {
    const committed = committedGoldenRuns()
    for (const [name, moved] of Object.entries(CHARGED_DIGESTS)) {
      const records = committed.find((golden) => golden.name === name)?.digests ?? []
      for (const [tick, digest] of Object.entries(moved)) {
        const record = records.find((candidate) => candidate.tick === Number(tick))
        expect(record?.digest).toMatch(/^[0-9a-f]{16}$/)
        expect(record?.digest).not.toBe(digest)
      }
    }
  })

  it.each(committedGoldenRuns().map((golden) => [golden.name, golden] as const))(
    'replays %s with the switch on to its committed digests, except the two the charge moves',
    (_name, golden) => {
      expect(withDrillExactCarry(true, () => goldenRunProblems(asCharged(golden)))).toEqual([])
    },
  )
})

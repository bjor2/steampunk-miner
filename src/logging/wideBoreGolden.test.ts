import { describe, expect, it } from 'vitest'
import { DRILL_BORE_ROWS } from '../constants/balance'
import {
  WIDE_BORE_CLEARANCE_MM,
  withDrillSideClearance,
} from '../systems/vehicle/drillBoreFixtures'
import { committedGoldenRuns } from './chargedGoldenDigests'
import { goldenRunProblems, type GoldenRun } from './goldenRun'

// The bore's one data row (ticket 661, the GD lock on #661, split A; Q5 of the lock on #662): the
// cut is the body plus a side clearance. At decision #36's clearance (0.5 m) the stamp's radius,
// its lift and the ring lag are protocol 100's: the commit that derived them from the row
// (b144b7312), with every rule as it was, replayed every committed golden of protocol 100 byte for
// byte, digests and mined orders. Ticket 662 then changed rules that do not read the row: the ring
// moved into the wall, the drill's disc took its bore-wall edge, a level cut its floor band and a
// report its run-on stamp. At 0.5 m those move each drilling golden's digests and nothing else, so
// the six replay the digests below and the rest their committed files, all with the committed
// mined orders. A size that stops reading the row (a hardcoded radius, lift or lag) moves a replay.

type MovedDigests = Readonly<Record<string, Readonly<Record<number, string>>>>

/** Protocol 103's digests at the 0.5 m clearance, by tick, of the goldens the 0.15 m bore moves. */
const WIDE_BORE_DIGESTS: MovedDigests = {
  'casing-lined-band-2': { 2137: '5614fbdc5c606e86' },
  'collapse-band-2-grade-1': { 2125: '2f5e2c0a8eaf194a' },
  'destroyed-and-towed': { 704: '031687b79542f344' },
  'dig-and-return': { 247: '6747dfad71e3567b', 3600: 'cde1bb3e9abce134', 4000: '796b09bd67af67b5' },
  'mined-order-mixed': { 307: 'd7ab0627ecc59d9c' },
  'money-past-1e40': { 124: 'c8ea00df5bb63559', 166: '8d1ce7f50f4f6aa8', 2000: '563ed1565f617c83' },
}

const goldens = committedGoldenRuns().map((golden) => [golden.name, golden] as const)

function asWideBore(golden: GoldenRun): GoldenRun {
  const moved = WIDE_BORE_DIGESTS[golden.name] ?? {}
  return {
    ...golden,
    digests: golden.digests.map((record) => ({
      ...record,
      digest: moved[record.tick] ?? record.digest,
    })),
  }
}

describe('drill bore clearance row (tickets 661 and 662)', () => {
  it('ships the GD’s 0.15 m clearance', () => {
    expect(DRILL_BORE_ROWS.sideClearanceMm).toBe(150)
  })

  it('pins a wide-bore digest only where the narrower bore moved it', () => {
    for (const [name, moved] of Object.entries(WIDE_BORE_DIGESTS)) {
      const records = goldens.find(([candidate]) => candidate === name)?.[1].digests ?? []
      for (const [tick, digest] of Object.entries(moved)) {
        const record = records.find((candidate) => candidate.tick === Number(tick))
        expect(record?.digest).toMatch(/^[0-9a-f]{16}$/)
        expect(record?.digest).not.toBe(digest)
      }
    }
  })

  it.each(goldens)(
    'replays %s at decision #36’s clearance to its wide-bore digests and committed mined order',
    (_name, golden) => {
      const problems = withDrillSideClearance(WIDE_BORE_CLEARANCE_MM, () =>
        goldenRunProblems(asWideBore(golden)),
      )
      expect(problems).toEqual([])
    },
  )
})

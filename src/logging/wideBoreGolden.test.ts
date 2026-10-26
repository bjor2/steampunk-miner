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
// byte, digests and mined orders. Ticket 662 then changed rules that do not read the row: the
// drill's disc took its bore-wall edge, a level cut its floor band, a report its run-on stamp, the
// level floor a ramp on its circle and the swept cut's casing trail the body's line, its rings
// measured from their stretch of axis swept by the stamp's offset (the ring, which went into the
// wall and back to a sample inside it, is #36's own again at 0.5 m). At 0.5 m those move each
// drilling golden's digests and nothing else, so the six replay the digests below and the rest
// their committed files, all with the committed mined orders. A size that stops reading the row (a
// hardcoded radius, lift or lag) moves a replay.

type MovedDigests = Readonly<Record<string, Readonly<Record<number, string>>>>

/**
 * Protocol 121's digests (#894's casing prices) at the 0.5 m clearance, by tick, of the goldens the
 * 0.15 m bore moves; money-past-1e40's from protocol 124, whose fresh planet 80 takes ore rules 15
 * (ticket 890: the stamp alone moves them). Ticket 829's ladder (protocol 126) moved the two casing
 * digs, now parked past a 20 s burst, and money-past-1e40's early ticks, whose end the bore no
 * longer moves.
 */
const WIDE_BORE_DIGESTS: MovedDigests = {
  'casing-lined-band-2': { 3037: '247d79a3a80f1d7c' },
  'collapse-band-2-grade-1': { 3025: 'd6184d8895ce031d' },
  'destroyed-and-towed': { 704: 'e66dc96093fe4d24' },
  'dig-and-return': { 247: '4c15a692846812a7', 3600: '3b0028560b157e31', 4000: 'd803ac9fbce777f8' },
  'mined-order-mixed': { 307: 'f712d702536b3c05' },
  'money-past-1e40': { 124: '42a57e690da858cb', 166: '5e2d46b3e6b64752' },
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

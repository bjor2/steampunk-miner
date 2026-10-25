import { describe, expect, it } from 'vitest'
import { AUTHORITY_DEV_FLAGS } from '../../constants/devFlags'
import { committedGoldenRuns } from '../../logging/chargedGoldenDigests'
import { goldenRunProblems, type GoldenRun } from '../../logging/goldenRun'
import { withDrillExactCarry } from '../../systems/authority/cutCarryFixtures'
import { withMaterialContact } from './systems/materialFixtures'

// The `codex.materialContact` kill-switch (ticket 546, as ticket 537 pinned its own): the species
// record ships on, so the four goldens that dig planet 1's roster-bound cells moved their digests
// under protocol 89, and nothing else did (no mined order, no other golden, no device save). With
// the switch off every golden replays to protocol 88's digests: those below, as committed before
// the record, with the exact carry off (it ships on since 18 Oct 2026), and with it on, A6's
// charged digests. The two digs that buy drill power past stored step 1 replay to protocol 91's
// (the per-purchase drill of ticket 552) with the record off. Ticket 762 re-pinned all of them to
// planet 1's ore rules 10 stamp (ticket 737's rare clusters), which alone moved them: with planet 1
// stamped 2 again each replays to the pin it replaced. Ticket 713 re-pinned them to the gems' ore
// rules 12 stamp the same way: with no planet stamped 12 each replays to ticket 762's pin. Ticket
// 662's 1.2 m bore and its casing trail, rings measured from the hole each tick cut (protocol
// 118), moved all four again, and only them. Ticket 888 gave planet 80 its generated pool's
// species, so the record moves money-past-1e40 too: with the switch off it replays to the digests
// of its stamp-14 planet with no species touched.

type MovedDigests = Readonly<Record<string, Readonly<Record<number, string>>>>

/** Protocol 88's digests of the goldens the record moves, by tick (91's for the two digs). */
const PROTOCOL_88_DIGESTS: MovedDigests = {
  'casing-lined-band-2': { 2137: 'dad6225409d47136' },
  'collapse-band-2-grade-1': { 2125: '9c781106c485ea85' },
  'dig-and-return': { 247: 'c4db3f9c9dcff509', 3600: '180cf9913df8c848', 4000: '7a6bbd2124ee07d1' },
  'mined-order-mixed': { 307: '89db921635aa40b9' },
  'money-past-1e40': { 124: '80d0d52ae58e3434', 166: '2fb0ce610afa68d7', 2000: '26a52901206eb78a' },
}

/** Protocol 88's charged digests (A6, `drill.exactCarry` on) of the same goldens. */
const PROTOCOL_88_CHARGED_DIGESTS: MovedDigests = {
  ...PROTOCOL_88_DIGESTS,
  'casing-lined-band-2': { 2137: '6f16a4e6fdd78057' },
  'collapse-band-2-grade-1': { 2125: '26d3b8b63020e895' },
}

const goldens = committedGoldenRuns().map((golden) => [golden.name, golden] as const)

function withDigestsOf(golden: GoldenRun, table: MovedDigests): GoldenRun {
  const moved = table[golden.name] ?? {}
  return {
    ...golden,
    digests: golden.digests.map((record) => ({
      ...record,
      digest: moved[record.tick] ?? record.digest,
    })),
  }
}

describe('codex.materialContact kill-switch (ticket 546)', () => {
  it('ships with the species record on', () => {
    expect(AUTHORITY_DEV_FLAGS['codex.materialContact']).toBe(true)
  })

  it('pins an old digest only where the record moved it', () => {
    for (const [name, moved] of Object.entries(PROTOCOL_88_DIGESTS)) {
      const records = goldens.find(([candidate]) => candidate === name)?.[1].digests ?? []
      for (const [tick, digest] of Object.entries(moved)) {
        const record = records.find((candidate) => candidate.tick === Number(tick))
        expect(record?.digest).toMatch(/^[0-9a-f]{16}$/)
        expect(record?.digest).not.toBe(digest)
      }
    }
  })

  it.each(goldens)('replays %s with the switch off to protocol 88’s digests', (_name, golden) => {
    const before = withDigestsOf(golden, PROTOCOL_88_DIGESTS)
    const problems = withMaterialContact(false, () =>
      withDrillExactCarry(false, () => goldenRunProblems(before)),
    )
    expect(problems).toEqual([])
  })

  it.each(goldens)(
    'replays %s with the switch off and the exact carry on to A6’s charged digests',
    (_name, golden) => {
      const charged = withDigestsOf(golden, PROTOCOL_88_CHARGED_DIGESTS)
      const problems = withMaterialContact(false, () =>
        withDrillExactCarry(true, () => goldenRunProblems(charged)),
      )
      expect(problems).toEqual([])
    },
  )
})

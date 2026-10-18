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
// (the per-purchase drill of ticket 552) with the record off.

type MovedDigests = Readonly<Record<string, Readonly<Record<number, string>>>>

/** Protocol 88's digests of the goldens the record moves, by tick (91's for the two digs). */
const PROTOCOL_88_DIGESTS: MovedDigests = {
  'casing-lined-band-2': { 2137: '6a716de4327581ee' },
  'collapse-band-2-grade-1': { 2125: '0f4f8cb9b015775c' },
  'dig-and-return': { 247: '1e33c58bae0ccc65', 3600: 'fe80393ecc5f6472', 4000: 'd7583f1a4c4bb62f' },
  'mined-order-mixed': { 307: '4ebff3e7eb9d8cde' },
}

/** Protocol 88's charged digests (A6, `drill.exactCarry` on) of the same goldens. */
const PROTOCOL_88_CHARGED_DIGESTS: MovedDigests = {
  ...PROTOCOL_88_DIGESTS,
  'casing-lined-band-2': { 2137: '30c3f2483846f7fa' },
  'collapse-band-2-grade-1': { 2125: '210371f1101afbb9' },
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

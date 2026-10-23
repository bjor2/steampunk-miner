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
// stamped 2 again each replays to the pin it replaced.

type MovedDigests = Readonly<Record<string, Readonly<Record<number, string>>>>

/** Protocol 88's digests of the goldens the record moves, by tick (91's for the two digs). */
const PROTOCOL_88_DIGESTS: MovedDigests = {
  'casing-lined-band-2': { 2137: 'c2c74edb2065b6db' },
  'collapse-band-2-grade-1': { 2125: '247894ae56252cf7' },
  'dig-and-return': { 247: '089b68d73b2eebfc', 3600: '462c13aff7d429b9', 4000: '394e1a1c1372f9a8' },
  'mined-order-mixed': { 307: '74c4e95deda04f73' },
}

/** Protocol 88's charged digests (A6, `drill.exactCarry` on) of the same goldens. */
const PROTOCOL_88_CHARGED_DIGESTS: MovedDigests = {
  ...PROTOCOL_88_DIGESTS,
  'casing-lined-band-2': { 2137: 'c16e068f0f91a70b' },
  'collapse-band-2-grade-1': { 2125: 'c1529e40c34b22dc' },
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

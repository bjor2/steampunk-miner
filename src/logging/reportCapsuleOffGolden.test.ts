import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AUTHORITY_DEV_FLAGS } from '../constants/devFlags'
import { withReportCapsule } from '../systems/authority/cutCarryFixtures'
import { goldenRunProblems, type GoldenRun } from './goldenRun'

// The `drill.reportCapsule` kill-switch (ticket 537, A7, the TD shape 6228947744 section 4 and
// its goldens gate): with it off, every golden replays to the digests and mined order protocol 86
// recorded, byte for byte, the cheapest proof that the capsule changed nothing else. Only the two
// goldens whose pose reports drill on from a previous report moved under protocol 87, each at its
// end digest; their protocol-86 digests are pinned below from the golden files at d088aaae.

const GOLDEN_FOLDER = new URL('../../tests/golden/', import.meta.url)

/** The protocol-86 digest of each golden whose digest the capsule moved, by tick. */
const PROTOCOL_86_DIGESTS: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  'casing-lined-band-2': { 2137: 'b51f4e5a8a552c1e' },
  'collapse-band-2-grade-1': { 2125: 'ea282a1cfc739ec2' },
}

function committedGoldenRuns(): GoldenRun[] {
  return readdirSync(GOLDEN_FOLDER)
    .filter((name) => name.endsWith('.golden.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(new URL(name, GOLDEN_FOLDER), 'utf8')) as GoldenRun)
}

/** The golden as protocol 86 recorded it: its moved digests put back. */
function asProtocol86(golden: GoldenRun): GoldenRun {
  const moved = PROTOCOL_86_DIGESTS[golden.name] ?? {}
  return {
    ...golden,
    digests: golden.digests.map((record) => ({
      ...record,
      digest: moved[record.tick] ?? record.digest,
    })),
  }
}

describe('drill.reportCapsule kill-switch (ticket 537)', () => {
  it('ships with the report capsule on', () => {
    expect(AUTHORITY_DEV_FLAGS['drill.reportCapsule']).toBe(true)
  })

  it('pins a protocol-86 digest only where the capsule moved it', () => {
    const committed = committedGoldenRuns()
    for (const [name, moved] of Object.entries(PROTOCOL_86_DIGESTS)) {
      const records = committed.find((golden) => golden.name === name)?.digests ?? []
      for (const [tick, digest] of Object.entries(moved)) {
        const record = records.find((candidate) => candidate.tick === Number(tick))
        expect(record?.digest).toMatch(/^[0-9a-f]{16}$/)
        expect(record?.digest).not.toBe(digest)
      }
    }
  })

  it.each(committedGoldenRuns().map((golden) => [golden.name, golden] as const))(
    'replays %s to its protocol-86 digests and mined order with the switch off',
    (_name, golden) => {
      expect(withReportCapsule(false, () => goldenRunProblems(asProtocol86(golden)))).toEqual([])
    },
  )
})

import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AUTHORITY_DEV_FLAGS, type AuthorityDevFlags } from '../constants/devFlags'
import { goldenRunProblems, type GoldenRun } from './goldenRun'

// The `drill.exactCarry` kill-switch (ticket 535, A6, the TD shape 6228682000 item 4 and the
// goldens gate): with it off, every golden replays to the digests and mined order protocol 83
// recorded, byte for byte, the cheapest proof that the charge on density removed changed nothing
// else. Only the two goldens whose pose reports drill moved under protocol 84, each at its end
// digest; their protocol-83 digests are pinned below from the golden files at e8f104f0.

const GOLDEN_FOLDER = new URL('../../tests/golden/', import.meta.url)

/** The protocol-83 digest of each golden whose digest the charge moved, by tick. */
const PROTOCOL_83_DIGESTS: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  'casing-lined-band-2': { 2137: 'b51f4e5a8a552c1e' },
  'collapse-band-2-grade-1': { 2125: 'ea282a1cfc739ec2' },
}

function committedGoldenRuns(): GoldenRun[] {
  return readdirSync(GOLDEN_FOLDER)
    .filter((name) => name.endsWith('.golden.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(new URL(name, GOLDEN_FOLDER), 'utf8')) as GoldenRun)
}

/** The golden as protocol 83 recorded it: its moved digests put back. */
function asProtocol83(golden: GoldenRun): GoldenRun {
  const moved = PROTOCOL_83_DIGESTS[golden.name] ?? {}
  return {
    ...golden,
    digests: golden.digests.map((record) => ({
      ...record,
      digest: moved[record.tick] ?? record.digest,
    })),
  }
}

/**
 * Runs `run` with `drill.exactCarry` off. The rule tables read the flag from `AUTHORITY_DEV_FLAGS`
 * at call time (`reportedDrill.ts`), so a whole replay takes the switch; restored after.
 */
function withExactCarryOff<T>(run: () => T): T {
  const flags = AUTHORITY_DEV_FLAGS as { -readonly [K in keyof AuthorityDevFlags]: boolean }
  flags['drill.exactCarry'] = false
  try {
    return run()
  } finally {
    flags['drill.exactCarry'] = true
  }
}

describe('drill.exactCarry kill-switch (ticket 535)', () => {
  it('ships with the charge on density removed on', () => {
    expect(AUTHORITY_DEV_FLAGS['drill.exactCarry']).toBe(true)
  })

  it('pins a protocol-83 digest only where the charge moved it', () => {
    const committed = committedGoldenRuns()
    for (const [name, moved] of Object.entries(PROTOCOL_83_DIGESTS)) {
      const records = committed.find((golden) => golden.name === name)?.digests ?? []
      for (const [tick, digest] of Object.entries(moved)) {
        const record = records.find((candidate) => candidate.tick === Number(tick))
        expect(record?.digest).toMatch(/^[0-9a-f]{16}$/)
        expect(record?.digest).not.toBe(digest)
      }
    }
  })

  it.each(committedGoldenRuns().map((golden) => [golden.name, golden] as const))(
    'replays %s to its protocol-83 digests and mined order with the switch off',
    (_name, golden) => {
      expect(withExactCarryOff(() => goldenRunProblems(asProtocol83(golden)))).toEqual([])
    },
  )
})

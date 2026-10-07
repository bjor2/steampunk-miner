import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import {
  createScriptedSession,
  mineTile,
  surfaceOreTiles,
} from '../../../systems/authority/scriptedSession'
import {
  readSnapshot,
  takeSnapshot,
  type SessionSnapshot,
} from '../../../systems/authority/sessionSnapshot'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { KERNEL_ORE_INDEX_TAG } from '../../../systems/registries/oreTypes'
import { withSection } from '../../../systems/registries/saveSections'
import { slice as CODEX } from '../register'
import { base64OfBytes } from './base64Bytes'
import { bitsetOf } from './bitset'
import { CODEX_SECTION, type CodexSection } from './codexSection'

// The codex section v1 (#207): written only by the reaction, carried in the snapshot and the
// digest as it stands, and restored only in its one canonical form.

const ORE_TILES = surfaceOreTiles(3)

/** A session that mined three surface ore tiles with the codex loaded. */
function minedState(): AuthorityState {
  return withRegistrations([CODEX], () => {
    const session = createScriptedSession()
    ORE_TILES.forEach((tile, at) => mineTile(session, 1 + at * 100, tile))
    return session.state()
  })
}

const throughSnapshot = (state: AuthorityState) =>
  withRegistrations([CODEX], () => {
    const text = JSON.stringify(takeSnapshot(state))
    return readSnapshot(JSON.parse(text) as SessionSnapshot)
  })

const problemsOf = (body: unknown) => withRegistrations([CODEX], () => CODEX_SECTION.problems(body))

const b64 = (...bits: number[]) => base64OfBytes(bitsetOf(bits))

const oreBody = (contacted: string, mined: string, codec = KERNEL_ORE_INDEX_TAG) => ({
  ore: { codec, contacted, mined },
})

describe('codex section', () => {
  it('stays out of the state until the player touches an ore', () => {
    const fresh = withRegistrations([CODEX], () => createScriptedSession().state())
    expect('slices' in fresh.players.p1).toBe(false)
    expect(minedState().players.p1.slices?.codex).toEqual({
      ore: {
        codec: KERNEL_ORE_INDEX_TAG,
        contacted: expect.any(String),
        mined: expect.any(String),
      },
    })
  })

  it('round-trips through the snapshot with the same digest', () => {
    const state = minedState()
    const restored = throughSnapshot(state)
    expect(restored.problems).toEqual([])
    if (!('state' in restored)) return
    expect(restored.state.players.p1.slices).toEqual(state.players.p1.slices)
    expect(stateDigest(restored.state)).toBe(stateDigest(state))
  })

  it('is part of the state digest', () => {
    const state = minedState()
    const forgotten = withRegistrations([CODEX], () =>
      withSection(state, 'p1', CODEX_SECTION, CODEX_SECTION.initial),
    )
    expect('slices' in forgotten.players.p1).toBe(false)
    expect(stateDigest(forgotten)).not.toBe(stateDigest(state))
  })

  it('accepts its canonical form: sorted, deduped ids and trimmed ore bytes inside contacted', () => {
    const body: CodexSection = {
      ...oreBody(b64(2, 3, 40), b64(3)),
      enemy: { contacted: ['crawler', 'wrecker'], mined: ['crawler'] },
      hazard: { contacted: ['lava'] },
    }
    expect(problemsOf(body)).toEqual([])
    expect(CODEX_SECTION.ofPortable(CODEX_SECTION.toPortable(body))).toEqual(body)
  })

  it('refuses id lists that are unsorted, duplicated, empty or mine what was never contacted', () => {
    expect(problemsOf({ enemy: { contacted: ['wrecker', 'crawler'] } })).toEqual([
      'codex.enemy.contacted must be sorted and deduped',
    ])
    expect(problemsOf({ enemy: { contacted: ['crawler', 'crawler'] } })).toEqual([
      'codex.enemy.contacted must be sorted and deduped',
    ])
    expect(problemsOf({ enemy: { contacted: [] } })).toEqual([
      'codex.enemy.contacted must be left out while empty',
    ])
    expect(problemsOf({ enemy: { contacted: ['crawler'], mined: ['wrecker'] } })).toEqual([
      'codex.enemy.mined must lie inside contacted',
    ])
  })

  it('refuses ore bytes that are not their one encoding, or mined outside contacted', () => {
    expect(problemsOf(oreBody(base64OfBytes(Uint8Array.from([4, 0])), ''))).toEqual([
      'codex.ore.contacted must not end in an empty byte',
    ])
    expect(problemsOf(oreBody('Zg', ''))).toEqual([
      'codex.ore.contacted must be canonical padded base64',
    ])
    expect(problemsOf(oreBody(b64(2), b64(5)))).toEqual([
      'codex.ore.mined must lie inside contacted',
    ])
    expect(problemsOf(oreBody('', ''))).toEqual([
      'codex.ore must be left out while nothing is contacted',
    ])
  })

  it('refuses unknown kinds, unknown fields and an ore index this build cannot read', () => {
    expect(problemsOf({ relic: { contacted: ['a'] } })).toEqual([
      'codex.relic is not a discovery kind',
    ])
    expect(problemsOf({ hazard: { contacted: ['lava'], seen: 1 } })).toEqual([
      'codex.hazard.seen is not a codex field',
    ])
    expect(problemsOf(oreBody(b64(2), '', 'ores.someday'))).toEqual([
      `codex.ore.codec "ores.someday" is an ore index this build cannot read (${KERNEL_ORE_INDEX_TAG})`,
    ])
    expect(problemsOf([])).toEqual(['codex must be an object'])
  })
})

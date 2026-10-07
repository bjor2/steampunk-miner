import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { readSection, withSection, type SaveSection } from '../registries/saveSections'
import { createAuthorityState, type AuthorityState } from './authorityState'
import {
  readSnapshot,
  sectionsRestoredBy,
  takeSnapshot,
  type SessionSnapshot,
} from './sessionSnapshot'
import { stateDigest } from './stateDigest'

// A slice's save sections ride in the snapshot under `slices`, each restored by exact version
// (feature-slices.md 3.13), or at its initial value when an older snapshot lacks it (#224); a fake slice registers them through withRegistrations.

const START = { planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] }

function countSection(version: number): SaveSection<number> {
  return {
    id: 'section-probe',
    version,
    scope: 'session',
    initial: 0,
    problems: (body) => (Number.isSafeInteger(body) ? [] : ['must be a whole number']),
    toPortable: (value) => value,
    ofPortable: (body) => body as number,
  }
}

const NOTES: SaveSection<readonly string[]> = {
  id: 'section-probe.notes',
  version: 1,
  scope: 'player',
  initial: [],
  problems: (body) => (Array.isArray(body) ? [] : ['must be a list']),
  toPortable: (value) => [...value],
  ofPortable: (body) => [...(body as string[])],
}

function probeSliceOf(sections: readonly SaveSection<never>[]): SliceDefinition {
  return {
    id: 'section-probe',
    register: (r) => sections.forEach((section) => r.saveSection(section)),
  }
}

const BOTH_SECTIONS = probeSliceOf([countSection(1), NOTES] as SaveSection<never>[])

/** A state with the counter at 7 and p1's notes written, taken as JSON text and read back. */
function writtenState(): AuthorityState {
  const counted = withSection(createAuthorityState(START), null, countSection(1), 7)
  return withSection(counted, 'p1', NOTES, ['first ore'])
}

const snapshotText = (state: AuthorityState) => JSON.stringify(takeSnapshot(state))
const readText = (text: string) => readSnapshot(JSON.parse(text) as SessionSnapshot)

describe('slice save sections in the snapshot', () => {
  it('keeps the slices key off the state, its players and the snapshot while no section is registered', () => {
    const state = withRegistrations([], () => createAuthorityState(START))
    const snapshot = withRegistrations([], () => takeSnapshot(state))
    expect('slices' in state).toBe(false)
    expect('slices' in state.players.p1).toBe(false)
    expect('slices' in snapshot.state).toBe(false)
    expect('slices' in snapshot.state.players.p1).toBe(false)
  })

  it('leaves a registered section out of the state until it leaves its initial value', () => {
    const { fresh, reset } = withRegistrations([BOTH_SECTIONS], () => ({
      fresh: createAuthorityState(START),
      reset: withSection(writtenState(), null, countSection(1), 0),
    }))
    expect('slices' in fresh).toBe(false)
    expect('slices' in fresh.players.p1).toBe(false)
    expect('slices' in reset).toBe(false)
    expect(reset.players.p1.slices).toEqual({ 'section-probe.notes': ['first ore'] })
  })

  it('snapshots every registered section, at its initial value when the state leaves it out', () => {
    const snapshot = withRegistrations([BOTH_SECTIONS], () =>
      takeSnapshot(createAuthorityState(START)),
    )
    expect(snapshot.state.slices).toEqual({ 'section-probe': { version: 1, body: 0 } })
    expect(snapshot.state.players.p1.slices).toEqual({
      'section-probe.notes': { version: 1, body: [] },
    })
  })

  it('restores a snapshot of sections at their initial values to the same digest', () => {
    const { reading, digest } = withRegistrations([BOTH_SECTIONS], () => {
      const state = createAuthorityState(START)
      return { reading: readText(snapshotText(state)), digest: stateDigest(state) }
    })
    expect(reading.problems).toEqual([])
    expect(stateDigest((reading as { state: AuthorityState }).state)).toBe(digest)
  })

  it('reads back what a section was set to, per scope', () => {
    const state = withRegistrations([BOTH_SECTIONS], writtenState)
    expect(readSection(state, null, countSection(1))).toBe(7)
    expect(readSection(state, 'p1', NOTES)).toEqual(['first ore'])
  })

  it('round-trips the session and player sections with the same digest', () => {
    const restored = withRegistrations([BOTH_SECTIONS], () => {
      const state = writtenState()
      const reading = readText(snapshotText(state))
      return { reading, digest: stateDigest(state) }
    })
    expect(restored.reading.problems).toEqual([])
    const state = (restored.reading as { state: AuthorityState }).state
    expect(state.slices).toEqual({ 'section-probe': 7 })
    expect(state.players.p1.slices).toEqual({ 'section-probe.notes': ['first ore'] })
    expect(stateDigest(state)).toBe(restored.digest)
  })

  it('refuses a section written under another version, restoring nothing', () => {
    const text = withRegistrations([BOTH_SECTIONS], () => snapshotText(writtenState()))
    const newer = probeSliceOf([countSection(2), NOTES] as SaveSection<never>[])
    expect(withRegistrations([newer], () => readText(text))).toEqual({
      problems: ['snapshot.state.slices.section-probe.version is 1, this build reads 2'],
    })
  })

  it('refuses a section this build does not register', () => {
    const text = withRegistrations([BOTH_SECTIONS], () => snapshotText(writtenState()))
    const notesOnly = probeSliceOf([NOTES] as SaveSection<never>[])
    expect(withRegistrations([notesOnly], () => readText(text))).toEqual({
      problems: ['snapshot.state.slices.section-probe is a section this build does not register'],
    })
  })

  it('restores a section an older snapshot lacks at its initial value, to the same digest', () => {
    const older = withRegistrations([], () => createAuthorityState(START))
    const text = withRegistrations([], () => snapshotText(older))
    const reading = withRegistrations([BOTH_SECTIONS], () => readText(text))
    expect(reading.problems).toEqual([])
    const state = (reading as { state: AuthorityState }).state
    expect(
      withRegistrations([BOTH_SECTIONS], () => readSection(state, null, countSection(1))),
    ).toBe(0)
    expect(withRegistrations([BOTH_SECTIONS], () => readSection(state, 'p1', NOTES))).toEqual([])
    expect(stateDigest(state)).toBe(stateDigest(older))
  })

  it('saves a snapshot that lacked a section the same as one taken fresh', () => {
    const fresh = withRegistrations([BOTH_SECTIONS], () =>
      snapshotText(createAuthorityState(START)),
    )
    const older = withRegistrations([], () => snapshotText(createAuthorityState(START)))
    const resaved = withRegistrations([BOTH_SECTIONS], () => {
      const reading = readText(older) as { state: AuthorityState }
      return snapshotText(reading.state)
    })
    expect(resaved).toBe(fresh)
  })

  it('names the registered sections a snapshot lacks, once each across its players', () => {
    const START_TWO = { ...START, playerIds: ['p1', 'p2'] }
    const older = withRegistrations([], () => takeSnapshot(createAuthorityState(START_TWO)))
    const partial = withRegistrations([probeSliceOf([NOTES] as SaveSection<never>[])], () =>
      takeSnapshot(createAuthorityState(START_TWO)),
    )
    expect(withRegistrations([BOTH_SECTIONS], () => sectionsRestoredBy(older))).toEqual([
      'section-probe',
      'section-probe.notes',
    ])
    expect(withRegistrations([BOTH_SECTIONS], () => sectionsRestoredBy(partial))).toEqual([
      'section-probe',
    ])
  })

  it("lists a section's own problems with its body", () => {
    const text = withRegistrations([BOTH_SECTIONS], () => snapshotText(writtenState()))
    const broken = text.replace('"body":7', '"body":"seven"')
    expect(withRegistrations([BOTH_SECTIONS], () => readText(broken))).toEqual({
      problems: ['snapshot.state.slices.section-probe.body: must be a whole number'],
    })
  })
})

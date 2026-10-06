import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { readSection, withSection, type SaveSection } from '../registries/saveSections'
import { createAuthorityState, type AuthorityState } from './authorityState'
import { readSnapshot, takeSnapshot, type SessionSnapshot } from './sessionSnapshot'
import { stateDigest } from './stateDigest'

// A slice's save sections ride in the snapshot under `slices`, each restored by exact version
// (feature-slices.md 3.13); a fake slice registers them through withRegistrations.

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

  it('starts a new state with every registered section at its initial value', () => {
    const state = withRegistrations([BOTH_SECTIONS], () => createAuthorityState(START))
    expect(state.slices).toEqual({ 'section-probe': 0 })
    expect(state.players.p1.slices).toEqual({ 'section-probe.notes': [] })
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

  it('refuses a snapshot missing a section this build registers', () => {
    const text = withRegistrations([], () => snapshotText(createAuthorityState(START)))
    expect(withRegistrations([BOTH_SECTIONS], () => readText(text))).toEqual({
      problems: [
        'snapshot.state.players.p1.slices.section-probe.notes is missing: this build registers it',
        'snapshot.state.slices.section-probe is missing: this build registers it',
      ],
    })
  })

  it("lists a section's own problems with its body", () => {
    const text = withRegistrations([BOTH_SECTIONS], () => snapshotText(writtenState()))
    const broken = text.replace('"body":7', '"body":"seven"')
    expect(withRegistrations([BOTH_SECTIONS], () => readText(broken))).toEqual({
      problems: ['snapshot.state.slices.section-probe.body: must be a whole number'],
    })
  })
})

import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { createAuthorityState, type AuthorityState } from '../authority/authorityState'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { stateDigest } from '../authority/stateDigest'
import { withSection, type SaveSection } from '../registries/saveSections'
import { readSaveSlot, saveSlotOf, type SaveSlotFile } from './saveSlot'

// The slices' save sections ride inside the save's world and profile parts (feature-slices.md
// 3.13), so the header and SAVE_FORMAT_VERSION stay as they are.

const START = { planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] }

function sectionOf(id: string, scope: 'session' | 'player', version = 1): SaveSection<number> {
  return {
    id,
    version,
    scope,
    initial: 0,
    problems: (body) => (Number.isSafeInteger(body) ? [] : ['must be a whole number']),
    toPortable: (value) => value,
    ofPortable: (body) => body as number,
  }
}

const SESSION = sectionOf('save-probe', 'session')
const PLAYER = sectionOf('save-probe.player', 'player')

function probeSliceOf(sections: readonly SaveSection<number>[]): SliceDefinition {
  return {
    id: 'save-probe',
    register: (r) => sections.forEach((section) => r.saveSection(section)),
  }
}

function writtenState(): AuthorityState {
  const state = withSection(createAuthorityState(START), null, SESSION, 3)
  return withSection(state, 'p1', PLAYER, 5)
}

const savedText = (state: AuthorityState) => JSON.stringify(saveSlotOf(takeSnapshot(state), 1))
const readText = (text: string) => readSaveSlot(JSON.parse(text) as SaveSlotFile)

describe('save slot sections', () => {
  it('writes no slices into the world or a profile player while no section is registered', () => {
    const file = withRegistrations([], () =>
      saveSlotOf(takeSnapshot(createAuthorityState(START)), 1),
    )
    expect('slices' in file.world).toBe(false)
    expect('slices' in file.profile.players.p1).toBe(false)
  })

  it('round-trips a session and a player section through the world and the profile', () => {
    const slice = probeSliceOf([SESSION, PLAYER])
    const { reading, digest } = withRegistrations([slice], () => {
      const state = writtenState()
      return { reading: readText(savedText(state)), digest: stateDigest(state) }
    })
    expect(reading.problems).toEqual([])
    const state = (reading as { state: AuthorityState }).state
    expect(state.slices).toEqual({ 'save-probe': 3 })
    expect(state.players.p1.slices).toEqual({ 'save-probe.player': 5 })
    expect(stateDigest(state)).toBe(digest)
  })

  it('refuses a save whose section another version wrote', () => {
    const text = withRegistrations([probeSliceOf([SESSION, PLAYER])], () =>
      savedText(writtenState()),
    )
    const newer = probeSliceOf([SESSION, sectionOf('save-probe.player', 'player', 2)])
    expect(withRegistrations([newer], () => readText(text))).toEqual({
      problems: [
        'snapshot.state.players.p1.slices.save-probe.player.version is 1, this build reads 2',
      ],
    })
  })
})

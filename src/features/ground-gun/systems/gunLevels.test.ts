import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { readSnapshot, takeSnapshot } from '../../../systems/authority/sessionSnapshot'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { contentOf, contentScheduleRowClaims } from '../../../systems/registries/content'
import { ARMOURY_FAMILY, BORE_GUN_KIND, BORE_GUN_SCHEDULE_ROW } from './boreGunContent'
import {
  gunLevelsOf,
  gunLevelsProblems,
  isGunMounted,
  mountedLevels,
  UNMOUNTED_GUN,
  withGunLevels,
} from './gunLevels'

const fresh = () => createAuthorityState({ planetIndex: 1, planetSeed: 1, playerIds: ['p1'] })

describe('ground-gun: the gun levels section', () => {
  it('starts unmounted and leaves the state and digest untouched while unmounted', () => {
    const state = fresh()
    expect(gunLevelsOf(state, 'p1')).toEqual(UNMOUNTED_GUN)
    expect(isGunMounted(UNMOUNTED_GUN)).toBe(false)
    expect(stateDigest(withGunLevels(state, 'p1', UNMOUNTED_GUN))).toBe(stateDigest(state))
  })

  it('round-trips bought levels through the save and the digest sees them', () => {
    const armed = withGunLevels(fresh(), 'p1', { rate: 3, penetration: 7, energy: 2 })
    const restored = readSnapshot(takeSnapshot(armed))
    if (!('state' in restored)) throw new Error(restored.problems.join('; '))
    expect(gunLevelsOf(restored.state, 'p1')).toEqual({ rate: 3, penetration: 7, energy: 2 })
    expect(stateDigest(armed)).not.toBe(stateDigest(fresh()))
  })

  it('mounts every track at its first level', () => {
    expect(mountedLevels()).toEqual({ rate: 1, penetration: 1, energy: 1 })
    expect(isGunMounted(mountedLevels())).toBe(true)
  })

  it('refuses a saved body without a whole level on every track', () => {
    expect(gunLevelsProblems({ rate: 1, penetration: 1, energy: 1 })).toEqual([])
    expect(gunLevelsProblems({ rate: 1, penetration: -1 })).toEqual([
      'ground-gun.penetration must be a whole level',
      'ground-gun.energy must be a whole level',
    ])
    expect(gunLevelsProblems('levels')).toEqual(['the ground-gun section must be an object'])
  })
})

describe('ground-gun: the armoury family and the schedule row', () => {
  it('tags the mount and all three tracks with the armoury family and nothing more', () => {
    const parts = contentOf(BORE_GUN_KIND)
    expect(parts.map((part) => part.id)).toEqual([
      'ground-gun.energy',
      'ground-gun.mount',
      'ground-gun.penetration',
      'ground-gun.rate',
    ])
    expect(parts.every((part) => part.familyId === ARMOURY_FAMILY)).toBe(true)
  })

  it('ships the bore_gun row through the mount', () => {
    expect(
      contentScheduleRowClaims().filter((claim) => claim.rowId === BORE_GUN_SCHEDULE_ROW),
    ).toEqual([{ rowId: 'bore_gun', entryId: 'ground-gun.mount', sliceId: 'ground-gun' }])
  })
})

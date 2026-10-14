import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES } from '../input/preferences'
import {
  DEFAULT_PLAYER_PROFILE,
  playerProfileOf,
  playerProfileText,
  readPlayerProfile,
} from './playerProfile'

const tunedProfile = playerProfileOf(
  { ...DEFAULT_PREFERENCES, shake: false, musicVolume: 0.5 },
  { 'hull.paint': 'brass' },
)

/** The profile's file with `extra` fields beside its own. */
const profileTextWith = (extra: Record<string, unknown>) =>
  JSON.stringify({ ...JSON.parse(playerProfileText(tunedProfile)), ...extra })

describe('player profile (ticket 407)', () => {
  it('reads back the settings and cosmetics it was written with', () => {
    expect(readPlayerProfile(playerProfileText(tunedProfile))).toEqual({
      profile: tunedProfile,
      problems: [],
    })
  })

  it('refuses a profile carrying the world: unlocks, items, picks, firsts, planet or money', () => {
    const reading = readPlayerProfile(
      profileTextWith({
        unlocked: ['tech.aetheric'],
        players: { player_1: { wallet: '1e30' } },
        owned: ['slot.powerup_5'],
        artefact: 'artefact.lodestone',
        firsts: ['core_reached'],
        planet: { index: 40, seed: 1 },
      }),
    )
    expect(reading.profile).toEqual(DEFAULT_PLAYER_PROFILE)
    expect(reading.problems.map((problem) => problem.split(' is not')[0])).toEqual([
      'profile.unlocked',
      'profile.players',
      'profile.owned',
      'profile.artefact',
      'profile.firsts',
      'profile.planet',
    ])
  })

  it('refuses settings the preferences file would refuse, naming them under the profile', () => {
    const reading = readPlayerProfile(profileTextWith({ settings: { preferencesVersion: 1 } }))
    expect(reading.profile).toEqual(DEFAULT_PLAYER_PROFILE)
    expect(reading.problems[0]).toMatch(/^profile\.settings: /)
  })

  it('refuses a cosmetic that is not an id, another profile version and text that is not JSON', () => {
    expect(readPlayerProfile(profileTextWith({ cosmetics: { 'hull.paint': 3 } })).problems).toEqual(
      ['profile.cosmetics.hull.paint must be a cosmetic id'],
    )
    expect(readPlayerProfile(profileTextWith({ profileVersion: 2 })).problems).toEqual([
      'profile.profileVersion is 2, this build reads 1',
    ])
    expect(readPlayerProfile('not json').problems).toEqual(['the profile must hold a JSON object'])
  })
})

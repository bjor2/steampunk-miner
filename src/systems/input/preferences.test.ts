import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PREFERENCES,
  nextMusicVolume,
  preferenceProblems,
  preferencesText,
  readPreferences,
  withPreference,
} from './preferences'

describe('preferences file', () => {
  it('gives the defaults when there is no file yet', () => {
    expect(readPreferences(null)).toEqual({ prefs: DEFAULT_PREFERENCES, problems: [] })
  })

  it('reads back what it wrote, rebinding included', () => {
    const prefs = {
      ...withPreference(DEFAULT_PREFERENCES, 'cameraMode', 'fixed'),
      bindings: { aim_left: { keyboard: ['KeyJ'] } },
      seenHints: ['hint_move', 'transmission_opening'],
      viewShortAxisMetres: 15,
    }
    expect(readPreferences(preferencesText(prefs))).toEqual({ prefs, problems: [] })
  })

  it('reads a file from before the seen-set as one with nothing seen', () => {
    const { seenHints: _seen, ...older } = DEFAULT_PREFERENCES
    const text = JSON.stringify({ preferencesVersion: 1, ...older, shake: false })
    expect(readPreferences(text)).toEqual({
      prefs: { ...DEFAULT_PREFERENCES, shake: false },
      problems: [],
    })
  })

  it('reads a file from before the zoom setting at the 12 m default', () => {
    const { viewShortAxisMetres: _zoom, ...older } = DEFAULT_PREFERENCES
    const text = JSON.stringify({ preferencesVersion: 1, ...older })
    expect(readPreferences(text).prefs.viewShortAxisMetres).toBe(12)
  })

  it('reads a file from before the music settings at full volume, not muted', () => {
    const { musicVolume: _volume, musicMuted: _muted, ...older } = DEFAULT_PREFERENCES
    const text = JSON.stringify({ preferencesVersion: 1, ...older })
    expect(readPreferences(text)).toMatchObject({
      prefs: { musicVolume: 1, musicMuted: false },
      problems: [],
    })
  })

  it('refuses a music volume outside 0 to 1', () => {
    expect(preferenceProblems('musicVolume', 0.5)).toEqual([])
    expect(preferenceProblems('musicVolume', 1.5)).toEqual([
      'musicVolume must be a number from 0 to 1, got 1.5',
    ])
    expect(preferenceProblems('musicMuted', 'yes')).toEqual([
      'musicMuted must be true or false, got "yes"',
    ])
  })

  it('steps the music volume down a quarter at a time and from silence back to full', () => {
    expect([1, 0.75, 0.5, 0.25, 0].map(nextMusicVolume)).toEqual([0.75, 0.5, 0.25, 0, 1])
  })

  it('refuses a zoom outside the 8 m to 20 m band', () => {
    const text = preferencesText({ ...DEFAULT_PREFERENCES, viewShortAxisMetres: 40 })
    expect(readPreferences(text)).toEqual({
      prefs: DEFAULT_PREFERENCES,
      problems: ['viewShortAxisMetres must be a number from 8 to 20, got 40'],
    })
  })

  it('refuses a seen-set naming a hint the table does not have', () => {
    const text = preferencesText({ ...DEFAULT_PREFERENCES, seenHints: ['hint_swim'] })
    expect(readPreferences(text).problems).toEqual([
      'seenHints: "hint_swim" is not a hint id, or is listed twice',
    ])
  })

  it('refuses a broken file whole, lists every problem and keeps the defaults', () => {
    const text = JSON.stringify({
      preferencesVersion: 1,
      cameraMode: 'sideways',
      shake: 'yes',
      flashes: true,
      hintsEnabled: true,
      bindings: { aim_left: { keyboard: ['Escape'] } },
      volume: 3,
    })
    const reading = readPreferences(text)
    expect(reading.prefs).toEqual(DEFAULT_PREFERENCES)
    expect(reading.problems).toEqual([
      'unknown preferences field "volume"',
      'camera mode must be one of rotating, fixed, got "sideways"',
      'shake must be true or false, got "yes"',
      'aim_left: Escape is reserved and cannot be rebound',
    ])
  })

  it('refuses text that is not JSON', () => {
    expect(readPreferences('{').problems).toEqual(['the preferences file must hold a JSON object'])
  })

  it('names the settings a player can toggle and refuses others', () => {
    expect(preferenceProblems('flashes', false)).toEqual([])
    expect(preferenceProblems('flashes', 0)).toEqual(['flashes must be true or false, got 0'])
    expect(preferenceProblems('bindings', {})).toHaveLength(1)
  })
})

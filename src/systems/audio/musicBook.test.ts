import { describe, expect, it } from 'vitest'
import {
  loadMusicBook,
  musicBookProblems,
  MUSIC_BOOK,
  SHIPPED_MUSIC_FILES,
  stingerSecondsOf,
} from './musicBook'
import { musicPatternProblems } from './musicPattern'

const DOCK = SHIPPED_MUSIC_FILES.stingers.dock as Record<string, unknown>

function withDock(change: Record<string, unknown>) {
  return {
    ...SHIPPED_MUSIC_FILES,
    stingers: { ...SHIPPED_MUSIC_FILES.stingers, dock: { ...DOCK, ...change } },
  }
}

describe('music patterns', () => {
  it('ships every layer and stinger pattern with no schema problem', () => {
    expect(musicBookProblems(SHIPPED_MUSIC_FILES)).toEqual([])
  })

  it('plays the dock stinger for 2 s, the core stinger for 4 s and the artefact one for 3 s', () => {
    expect(stingerSecondsOf(MUSIC_BOOK, 'dock')).toBe(2)
    expect(stingerSecondsOf(MUSIC_BOOK, 'core')).toBe(4)
    expect(stingerSecondsOf(MUSIC_BOOK, 'artefact')).toBe(3)
  })

  it('plays the archetype stinger for 5 s on arriving at a new kind of planet (#113)', () => {
    expect(stingerSecondsOf(MUSIC_BOOK, 'archetype')).toBe(5)
  })

  it('plays the module reveal stinger for 4 s (#105)', () => {
    expect(stingerSecondsOf(MUSIC_BOOK, 'reveal')).toBe(4)
  })

  it('loops the platform for 8 bars and the ambience for 16', () => {
    const barSeconds = (tempoBpm: number) => (4 * 60) / tempoBpm
    expect(MUSIC_BOOK.layers.platform.loopSeconds).toBeCloseTo(8 * barSeconds(96), 9)
    expect(MUSIC_BOOK.layers.ambience.loopSeconds).toBeCloseTo(16 * barSeconds(72), 9)
  })

  it('names the pattern, the instrument and the bar of a step count that is wrong', () => {
    const problems = musicBookProblems(
      withDock({
        instruments: [{ name: 'chime', voice: 'sine', octave: 0, gain: 0.2, bars: ['1...3...5'] }],
      }),
    )
    expect(problems).toEqual([
      'pattern "dock": instruments[0] (chime) bar 1 has 9 steps, expected 16',
    ])
  })

  it('lists every problem of a malformed pattern at once', () => {
    const problems = musicPatternProblems({
      id: 'broken',
      tempoBpm: 0,
      beatsPerBar: 4,
      stepsPerBeat: 4,
      barCount: 1,
      rootHz: 440,
      scale: [2, 1],
      instruments: [
        { name: 'drum', voice: 'noise', octave: 0, gain: 2, bars: ['x...1...........'] },
      ],
    })
    expect(problems).toEqual([
      'pattern "broken": tempoBpm must be a whole number from 40 to 240',
      'pattern "broken": scale must start at 0 and rise in whole semitones below 12',
      'pattern "broken": instruments[0] (drum) gain must be a number from 0 to 1',
      'pattern "broken": instruments[0] (drum) bar 1 "x...1..........." has a step its voice cannot play',
    ])
  })

  it('refuses a slot that holds another pattern', () => {
    expect(musicBookProblems(withDock({ id: 'core' }))).toEqual([
      'the dock slot holds pattern "core"',
    ])
  })

  it('refuses a malformed book at load with an error listing its problems', () => {
    expect(() => loadMusicBook(withDock({ tempoBpm: 'fast' }))).toThrow(
      'Refused music:\npattern "dock": tempoBpm must be a whole number from 40 to 240',
    )
  })
})

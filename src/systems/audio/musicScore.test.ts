import { describe, expect, it } from 'vitest'
import type { MusicPattern } from './musicPattern'
import { frequencyOfNote, scoreOfPattern, visitLoopNotesBetween } from './musicScore'

/** 120 bpm, 2 steps a beat: a step is a quarter second, a 1-bar loop 2 s. */
const RIFF: MusicPattern = {
  id: 'riff',
  tempoBpm: 120,
  beatsPerBar: 4,
  stepsPerBeat: 2,
  barCount: 1,
  rootHz: 220,
  scale: [0, 2, 4, 5, 7, 9, 11],
  instruments: [
    { name: 'lead', voice: 'triangle', octave: 0, gain: 0.2, bars: ['1-3.8..-'] },
    { name: 'drum', voice: 'noise', octave: 0, gain: 0.1, bars: ['x...x...'] },
  ],
}

function startsBetween(from: number, to: number, slice: number): number[] {
  const score = scoreOfPattern(RIFF)
  const starts: number[] = []
  for (let at = from; at < to; at += slice) {
    visitLoopNotesBetween(score, at, Math.min(at + slice, to), (_note, start) => starts.push(start))
  }
  return starts
}

describe('music score', () => {
  it('strikes each degree at its step and lets a held step ring on', () => {
    const lead = scoreOfPattern(RIFF).notes.filter((note) => note.voice === 'triangle')
    expect(
      lead.map(({ semitones, atSeconds, seconds }) => [semitones, atSeconds, seconds]),
    ).toEqual([
      [0, 0, 0.5],
      [4, 0.5, 0.25],
      [12, 1, 0.25],
    ])
  })

  it('loops endlessly, playing every note once however the time is sliced', () => {
    const atThirtyFps = startsBetween(0, 6, 1 / 30)
    const atOneFortyFourFps = startsBetween(0, 6, 1 / 144)
    expect(atThirtyFps).toHaveLength(15)
    expect(atOneFortyFourFps.length).toBe(atThirtyFps.length)
    atOneFortyFourFps.forEach((start, index) => expect(start).toBeCloseTo(atThirtyFps[index], 9))
  })

  it('shifts every note by the planet tuning', () => {
    const score = scoreOfPattern(RIFF)
    const root = score.notes[0]
    expect(frequencyOfNote(score, root, 0)).toBe(220)
    expect(frequencyOfNote(score, root, -12)).toBe(110)
  })
})

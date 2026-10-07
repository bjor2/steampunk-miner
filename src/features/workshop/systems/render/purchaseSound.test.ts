import { describe, expect, it } from 'vitest'
import { soundCueProblems } from '../../../../systems/registries/soundCues'
import {
  CADENCE_CUE_ID,
  cuePlaysOfStep,
  cuePlaysOfStop,
  FLOURISH_CUE_ID,
  PURCHASE_SOUND,
  RATCHET_CUE_ID,
  ratchetLayersOf,
  ratchetSemitonesOf,
  steamBedLevelOf,
  type HeardStep,
} from './purchaseSound'
import { HOLD_CURVE } from '../holdChain'

const ROWS = HOLD_CURVE.gapTicks.length
const CAP_ROW = ROWS - 1

function heldPip(pip: number, gapTicks: number | null, onRow = 0): HeardStep {
  return { moment: 'pip', pip, gapTicks, onRow, rowCount: ROWS }
}

describe('workshop purchase sound', () => {
  it("caps the ratchet at 4 voices and the flourish at 1, G&V's cap", () => {
    const voices = Object.fromEntries(PURCHASE_SOUND.cues.map((cue) => [cue.id, cue.voices]))

    expect(voices[RATCHET_CUE_ID]).toBe(4)
    expect(voices[FLOURISH_CUE_ID]).toBe(1)
    expect(voices[CADENCE_CUE_ID]).toBe(1)
  })

  it('registers only cues the sound stage can play', () => {
    for (const cue of PURCHASE_SOUND.cues) expect(soundCueProblems(cue)).toEqual([])
  })

  it('climbs the pentatonic scale one degree per pip', () => {
    const pips = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((pip) => ratchetSemitonesOf(pip))

    expect(pips).toEqual([0, 2, 4, 7, 9, 12, 14, 16, 19])
  })

  it('stacks more layers as the chain speeds up', () => {
    const layers = [null, ...HOLD_CURVE.gapTicks].map((gap) => ratchetLayersOf(gap))

    expect(layers).toEqual([1, 1, 1, 2, 2, 2, 3, 3])
  })

  it('raises the steam bed as the chain climbs the rows', () => {
    expect(steamBedLevelOf(0, ROWS)).toBeLessThan(steamBedLevelOf(3, ROWS))
    expect(steamBedLevelOf(CAP_ROW, ROWS)).toBe(1)
  })

  it("plays a pip as the ratchet's layers, an octave and a twelfth above the climb", () => {
    const plays = cuePlaysOfStep(heldPip(3, 4, CAP_ROW))

    expect(plays.map((play) => play.cueId)).toEqual([
      RATCHET_CUE_ID,
      RATCHET_CUE_ID,
      RATCHET_CUE_ID,
    ])
    expect(plays.map((play) => play.pitchSemitones)).toEqual([7, 19, 26])
    expect(plays[0].gain).toBe(1)
  })

  it('plays a click as one quiet tick on the bed floor', () => {
    expect(cuePlaysOfStep(heldPip(0, null))).toEqual([
      { cueId: RATCHET_CUE_ID, pitchSemitones: 0, gain: PURCHASE_SOUND.bedFloorGain },
    ])
  })

  it('plays a big level-up as the flourish, and a milestone as its higher chord', () => {
    const major = cuePlaysOfStep({ ...heldPip(9, 6), moment: 'compressed' })
    const milestone = cuePlaysOfStep({ ...heldPip(9, 6), moment: 'milestone' })

    expect(major).toEqual([{ cueId: FLOURISH_CUE_ID, pitchSemitones: 0, gain: 1 }])
    expect(milestone[0].pitchSemitones).toBeGreaterThan(major[0].pitchSemitones)
  })

  it('ends every stop on the cadence, and a milestone on its own flourish', () => {
    expect(cuePlaysOfStop('ka_chunk')).toEqual([
      { cueId: CADENCE_CUE_ID, pitchSemitones: 0, gain: 1 },
    ])
    expect(cuePlaysOfStop('empty_clunk')[0].pitchSemitones).toBeLessThan(0)
    expect(cuePlaysOfStop('milestone')).toEqual([])
  })
})

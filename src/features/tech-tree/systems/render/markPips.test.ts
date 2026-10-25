import { describe, expect, it } from 'vitest'
import { SHIPPED_RIG_LOOKS } from '../../../rig-look'
import { BAND_FINISH_IDS, bandFinishOf, markPipStepOf } from './markPips'

/** What a plate shows that changes with its Mark past the rivets: the band's finish and the pips. */
function bandLookAt(mark: number): string {
  const { band, pips } = markPipStepOf(mark)
  return `${bandFinishOf(band)?.name ?? 'brass'} ${pips}`
}

describe('mark pips (ticket 884)', () => {
  it('counts the Marks since the last stud with at most 2 pips between milestones', () => {
    const pips = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((mark) => markPipStepOf(mark).pips)
    expect(pips).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2, 0])
  })

  it('keeps the brass plate to Mark 11 and steps the finish band at Marks 12, 15 and 18', () => {
    expect([9, 10, 11].map((mark) => markPipStepOf(mark).band)).toEqual([0, 0, 0])
    expect(markPipStepOf(12)).toEqual({ band: 1, pips: 0 })
    expect(markPipStepOf(14)).toEqual({ band: 1, pips: 2 })
    expect(markPipStepOf(15)).toEqual({ band: 2, pips: 0 })
    expect(markPipStepOf(18)).toEqual({ band: 3, pips: 0 })
  })

  it('computes the band at a million Marks from the Mark alone, with no table cap', () => {
    expect(markPipStepOf(1_000_000)).toEqual({ band: 333_330, pips: 1 })
    expect(bandFinishOf(333_330)).not.toBeNull()
  })

  it('never shows two neighbouring Marks the same, to Mark 60 and around a million', () => {
    const marks = [
      ...Array.from({ length: 61 }, (_, at) => at),
      ...Array.from({ length: 30 }, (_, at) => 999_985 + at),
    ]
    const repeats = marks
      .filter((mark) => marks.includes(mark + 1))
      .filter((mark) => bandLookAt(mark) === bandLookAt(mark + 1))
    expect(repeats).toEqual([])
  })

  it('dresses each band in a rig look finish other than its neighbour', () => {
    for (const id of BAND_FINISH_IDS) expect(SHIPPED_RIG_LOOKS.finishes[id]).toBeDefined()
    expect(bandFinishOf(0)).toBeNull()
    for (let band = 1; band <= 2 * BAND_FINISH_IDS.length; band++) {
      expect(bandFinishOf(band)?.name).not.toBe(bandFinishOf(band + 1)?.name)
    }
  })
})

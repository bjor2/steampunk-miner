import { describe, expect, it } from 'vitest'
import type { EchoMark } from './echoPing'
import { marksAfterPing, type RevealMark, type RevealPing } from './revealPing'

// The reveal cap (TD lock on #203 Q1): a ping past the cap keeps its nearest cells, and older
// marks give way soonest-to-expire first, a flare's map (kept until the dock) last.

const CENTRE = { tx: 0, ty: 0 }

const cave = (tx: number, ty = 0): EchoMark => ({ tile: { tx, ty }, kind: 'cave', gate: null })

function ping(marks: EchoMark[], bornTick: number, untilTick: number | null): RevealPing {
  return { centre: CENTRE, marks, bornTick, untilTick }
}

function kept(marks: RevealMark[]): string[] {
  return marks.map((mark) => `${mark.tile.tx}:${mark.untilTick}`)
}

describe('sensing reveal cap', () => {
  it('keeps the cells nearest the ping’s centre when it marks more than the cap', () => {
    const marks = marksAfterPing([], ping([cave(5), cave(-1), cave(3), cave(2)], 0, 100), 2)
    expect(kept(marks)).toEqual(['-1:100', '2:100'])
  })

  it('evicts the marks closest to running out first, and a flare’s map last', () => {
    const flare = marksAfterPing([], ping([cave(10)], 0, null), 4)
    const early = marksAfterPing(flare, ping([cave(20)], 1, 50), 4)
    const late = marksAfterPing(early, ping([cave(30)], 2, 900), 4)
    const fresh = marksAfterPing(late, ping([cave(1), cave(2)], 3, 600), 4)
    expect(kept(fresh)).toEqual(['10:null', '30:900', '1:600', '2:600'])
  })

  it('lets a fresh mark replace the old one on its tile', () => {
    const first = marksAfterPing([], ping([cave(1)], 0, 100), 4)
    expect(kept(marksAfterPing(first, ping([cave(1)], 5, 700), 4))).toEqual(['1:700'])
  })
})

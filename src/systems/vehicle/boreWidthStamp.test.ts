import { describe, expect, it } from 'vitest'
import type { DiscStamp } from '../world/stampShape'
import { AIM } from './aim'
import { cellsBeyondBareBore, stampAtWidthLevel } from './boreWidthStamp'
import { boreRadiusMmAlongAt, drillStampRadiusMmAlong } from './drillBore'

// The stamp at the rig's width level (ticket 749): grown about the bare stamp's centre, and the
// cells outside the bare 1.2 m bore told apart from the bore's own by where their centres lie.

/** A bare stamp cutting down column 30 from y 100.5 m to 98.5 m. */
const BARE: DiscStamp = {
  xMm: 30_500,
  yMm: 98_500,
  radiusMm: drillStampRadiusMmAlong(AIM.down),
  floorRadiusMm: null,
  tail: { xMm: 30_500, yMm: 100_500 },
  edge: 'boreWall',
}

describe('bore width stamp', () => {
  it('leaves the bare stamp as built at the bare level', () => {
    expect(stampAtWidthLevel(BARE, AIM.down, 0)).toBe(BARE)
  })

  it('grows only the radius, to the level’s bore along the aim, about the same path', () => {
    const wide = stampAtWidthLevel(BARE, AIM.down, 1)
    expect(wide).toEqual({ ...BARE, radiusMm: boreRadiusMmAlongAt(AIM.down, 1) })
    expect(stampAtWidthLevel(BARE, 40, 1).radiusMm).toBe(boreRadiusMmAlongAt(40, 1))
  })

  it('lists the cells whose centres lie outside the bare bore, in order', () => {
    const wide = stampAtWidthLevel(BARE, AIM.down, 2)
    const row = [28, 29, 30, 31, 32].map((tx) => ({ tx, ty: 99 }))
    expect(cellsBeyondBareBore(wide, AIM.down, row)).toEqual([
      { tx: 28, ty: 99 },
      { tx: 29, ty: 99 },
      { tx: 31, ty: 99 },
      { tx: 32, ty: 99 },
    ])
  })

  it('lists none for a stamp no wider than the bare bore', () => {
    const row = [29, 30, 31].map((tx) => ({ tx, ty: 99 }))
    expect(cellsBeyondBareBore(BARE, AIM.down, row)).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { createScriptedSession, PARAMS, poseAbove } from '../authority/scriptedSession'
import { localGravityReadingOf, planetGravityTraitOf } from './localGravityReading'
import { tileTimeUnderRamp, type TileTime } from './tileTime'

// Bjor's ruling on #724, HS: local g on the vehicle panel as a multiple of planet 1's, gravity as
// a planet trait through the planet row, and the tile readout tinted while the ramp binds.

/** The vehicle reported at `y` mm straight above the centre. */
function reportedAt(y: number) {
  const session = createScriptedSession()
  const { payload } = poseAbove({ tx: 0, ty: 0 }, 2)
  session.submit(0, { type: 'reportPose', payload: { ...payload, x: 0, y } })
  return session.state()
}

describe('gravity readings (#724)', () => {
  it("shows a planet's gravity as its trait, a multiple of planet 1's", () => {
    expect(planetGravityTraitOf(1).text).toBe('1 g')
    expect(planetGravityTraitOf(2).text).toBe('1.25 g')
    expect(Number(planetGravityTraitOf(2).exact)).toBe(1.25)
  })

  it('shows the full pull outside the inner tenth, and less toward the core', () => {
    const surface = reportedAt(PARAMS.radiusTiles * 1000 - 2000)
    expect(localGravityReadingOf(surface, 'p1')?.text).toBe('1 g')
    const deep = reportedAt(PARAMS.radiusTiles * 50)
    expect(localGravityReadingOf(deep, 'p1')?.text).toBe('0.5 g')
  })
})

describe('tile readout under the gravity ramp (#724)', () => {
  const time: TileTime = { state: 'time', text: '0.16 s', ticks: 10 }

  it("tints the drill's time while the ramp holds the cut down, keeping its text", () => {
    expect(tileTimeUnderRamp(time, true)).toEqual({ ...time, state: 'gravity' })
    expect(tileTimeUnderRamp(time, false)).toBe(time)
  })

  it('leaves a drive-bound, blocked or empty readout as it is', () => {
    const others: TileTime[] = [
      { state: 'drive', text: '0.16 s · 6 m/s', ticks: 10 },
      { state: 'blocked', text: 'needs a better tip' },
      { state: 'none', text: '-' },
    ]
    for (const other of others) expect(tileTimeUnderRamp(other, true)).toBe(other)
  })
})

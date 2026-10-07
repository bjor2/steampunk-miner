import { describe, expect, it } from 'vitest'
import { SPARK_CAPACITY } from '../../../../constants/scene'
import { flareShellPointOf, fxFrameOf, fxFrameOfId, isStanding, magnetVerbOf } from './powerUpFx'
import { POWER_UP_FX, powerUpFxOf, powerUpFxOfItem } from './techGear'

const fx = (id: string) => {
  const found = powerUpFxOf(id)
  if (found === null) throw new Error(`no fx ${id}`)
  return found
}

describe('power-up fx: the effect looks', () => {
  it('sweeps the sounder ring out to its 12-tile radius and lets the reveal fade over 600 ticks', () => {
    const ring = fx('sounder-ring')
    expect(fxFrameOf(ring, 0).reachM).toBe(0)
    expect(fxFrameOf(ring, ring.sweepTicks).reachM).toBe(12)
    expect(fxFrameOf(ring, 300).alpha).toBeCloseTo(0.5)
    expect(fxFrameOf(ring, 599).isOver).toBe(false)
    expect(fxFrameOf(ring, 600)).toMatchObject({ alpha: 0, isOver: true })
  })

  it('holds the steam shield curtain for its 120-tick window and drops it over the last sweep', () => {
    const curtain = fx('shield-curtain')
    expect(fxFrameOf(curtain, 60).alpha).toBe(1)
    expect(fxFrameOf(curtain, 120 - curtain.sweepTicks / 2).alpha).toBeCloseTo(0.5)
    expect(fxFrameOf(curtain, 120).isOver).toBe(true)
  })

  it('channels the drain for its 60-tick channel with six brine lines in reach 3', () => {
    const drain = fx('drain-brine-lines')
    expect(drain.itemId).toBe('power.mineral_drain')
    expect(fxFrameOf(drain, 30)).toMatchObject({ alpha: 1, strands: 6, isOver: false })
    expect(fxFrameOf(drain, 60).reachM).toBe(3)
    expect(fxFrameOf(drain, 60).isOver).toBe(true)
  })

  it('keeps the three magnet verbs distinct: the coil frees, the shifter drags, the lodestone gathers', () => {
    const verbs = ['induction-free', 'shifter-drag', 'lodestone-gather'].map((id) =>
      magnetVerbOf(fx(id)),
    )
    expect(verbs).toEqual(['free', 'drag', 'gather'])
    expect(new Set(verbs).size).toBe(3)
    expect(magnetVerbOf(fx('sounder-ring'))).toBeNull()
  })

  it('tumbles the shifter nodules for about 45 ticks, at most the 8 cells it drags', () => {
    const drag = fx('shifter-drag')
    expect(drag.ticks).toBe(45)
    expect(fxFrameOf(drag, 44)).toMatchObject({ strands: 8, isOver: false })
    expect(fxFrameOf(drag, 45).isOver).toBe(true)
  })

  it('leaves a standing grapple line and salvage plate that never end', () => {
    for (const id of ['grapple-line', 'salvage-plate']) {
      expect(isStanding(fx(id))).toBe(true)
      expect(fxFrameOf(fx(id), 100000)).toMatchObject({ alpha: 1, isOver: false })
    }
  })

  it('lobs the flare up and back first, then lands it at its 30-tile range, above the hull 10+ ticks', () => {
    const flare = fx('flare-burn')
    const [earlyX, earlyUp] = flareShellPointOf(flare, 2)
    expect(earlyX).toBeLessThan(0)
    expect(earlyUp).toBeGreaterThan(0)
    const [landedX, landedUp] = flareShellPointOf(flare, flare.sweepTicks)
    expect(landedX).toBeCloseTo(30)
    expect(landedUp).toBeCloseTo(0)
    const ticksAboveHull = Array.from({ length: flare.sweepTicks }, (_, tick) => tick).filter(
      (tick) => flareShellPointOf(flare, tick)[1] > 1,
    )
    expect(ticksAboveHull.length).toBeGreaterThanOrEqual(10)
  })

  it('never asks for more strands than the kernel spark pool holds', () => {
    for (const effect of POWER_UP_FX) {
      expect(fxFrameOf(effect, 0).strands).toBeLessThanOrEqual(SPARK_CAPACITY)
    }
  })

  it('finds an effect by id or by item, and answers null for an unknown id', () => {
    expect(fxFrameOfId('boost-plume', 0)?.reachM).toBe(0)
    expect(fxFrameOfId('no-such-fx', 0)).toBeNull()
    expect(powerUpFxOfItem('power.echo_sounder').map((effect) => effect.id)).toEqual([
      'sounder-ring',
    ])
  })
})

import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../economy/economy'
import { pausedHeatSteps, type HeatPauseWindow } from './heatPauseSteps'
import { runHeatSegments } from './vehicleHeat'

// A heat sink's vent and pause over a lazily settled span (ticket 233, the GD lock on #204 Q2).

const KERNEL_FLOOR = ECONOMY.itemEffectCaps.heatFloorBp
const NO_FLOOR = 0
const MAX_UNITS = 1_000_000

const window = (values: Partial<HeatPauseWindow>): HeatPauseWindow => ({
  fromTick: 40,
  untilTick: 100,
  ventBp: 0,
  gainBp: 0,
  ...values,
})

const levelAfter = (level: number, steps: Parameters<typeof runHeatSegments>[1]) =>
  runHeatSegments(level, steps, MAX_UNITS, []).level

describe('heat pause steps', () => {
  it('leaves the segments as they were with no window', () => {
    const segments = [{ ticks: 100, unitsPerTick: 3 }]
    expect(pausedHeatSteps(segments, 0, [], KERNEL_FLOOR)).toBe(segments)
  })

  it('vents at the window start and pauses the gain to its end, with no floor', () => {
    const steps = pausedHeatSteps(
      [{ ticks: 100, unitsPerTick: 3 }],
      0,
      [window({ ventBp: 6000 })],
      NO_FLOOR,
    )
    expect(steps).toEqual([
      { ticks: 40, unitsPerTick: 3 },
      { keepBp: 4000 },
      { ticks: 60, unitsPerTick: 0 },
    ])
    expect(levelAfter(1000, steps)).toBe(448)
  })

  it('keeps half the gauge and half the gain at the kernel floor', () => {
    const steps = pausedHeatSteps(
      [{ ticks: 100, unitsPerTick: 3 }],
      0,
      [window({ ventBp: 6000 })],
      KERNEL_FLOOR,
    )
    expect(steps).toEqual([
      { ticks: 40, unitsPerTick: 3 },
      { keepBp: 5000 },
      { ticks: 60, unitsPerTick: 2 },
    ])
  })

  it('cuts the drilling and resting segments at the window edges inside the span', () => {
    const steps = pausedHeatSteps(
      [
        { ticks: 50, unitsPerTick: 5 },
        { ticks: 50, unitsPerTick: 2 },
      ],
      1000,
      [window({ fromTick: 1030, untilTick: 1070, gainBp: 5000 })],
      NO_FLOOR,
    )
    expect(steps).toEqual([
      { ticks: 30, unitsPerTick: 5 },
      { ticks: 20, unitsPerTick: 3 },
      { ticks: 20, unitsPerTick: 1 },
      { ticks: 30, unitsPerTick: 2 },
    ])
  })

  it('never slows cooling', () => {
    const steps = pausedHeatSteps([{ ticks: 100, unitsPerTick: -4 }], 0, [window({})], NO_FLOOR)
    expect(steps).toEqual([
      { ticks: 40, unitsPerTick: -4 },
      { ticks: 60, unitsPerTick: -4 },
    ])
  })

  it('vents once when the gauge settles in several spans around the window start', () => {
    const vent = [window({ fromTick: 50, untilTick: 50, ventBp: 5000 })]
    const spans = [0, 25, 50, 75].map((from) =>
      pausedHeatSteps([{ ticks: 25, unitsPerTick: 2 }], from, vent, NO_FLOOR),
    )
    const settledInSpans = spans.reduce((level, steps) => levelAfter(level, steps), 100)
    const settledAtOnce = levelAfter(
      100,
      pausedHeatSteps([{ ticks: 100, unitsPerTick: 2 }], 0, vent, NO_FLOOR),
    )
    expect(spans.flat().filter((step) => 'keepBp' in step)).toHaveLength(1)
    expect(settledInSpans).toBe(settledAtOnce)
    expect(settledAtOnce).toBe(200)
  })

  it('multiplies overlapping windows and still keeps the floor', () => {
    const steps = pausedHeatSteps(
      [{ ticks: 10, unitsPerTick: 8 }],
      40,
      [window({ ventBp: 4000, gainBp: 6000 }), window({ ventBp: 4000, gainBp: 6000 })],
      KERNEL_FLOOR,
    )
    expect(steps).toEqual([{ keepBp: 5000 }, { ticks: 10, unitsPerTick: 4 }])
  })
})

import { describe, expect, it } from 'vitest'
import { fromCanonical } from '../../../../systems/money'
import { BURST_TIMING } from '../burstTiming'
import { burstWithSale } from '../sellBurst'
import {
  chunkPointAt,
  isPeeledCoin,
  screenFlightPointAt,
  screenFlightShareAt,
  stackCoinPointAt,
  type FlightPoint,
} from './burstFlight'
import { cascadeHzOf } from './cascadePitch'

const CHUTE = { x: -1.6, y: 1.3 }
const CROWN = { x: 0, y: 5.65 }
const STACK = { x: -2.5, y: 10 }

function waveOf(liningPaid: string) {
  const sale = {
    items: [{ tier: 1, amount: 4 }],
    credits: fromCanonical('400'),
    coinsShown: 12,
    liningPaid: fromCanonical(liningPaid),
    nextStepPrice: fromCanonical('100'),
  }
  return burstWithSale(null, sale, 0, false).waves[0]
}

function point(): FlightPoint {
  return { x: 0, y: 0 }
}

describe('sell burst flight', () => {
  it('launches every chunk from the chute by tick 24 and drops it into the crown by tick 40', () => {
    const out = point()
    expect(chunkPointAt(0, 24, 0, CHUTE, CROWN, out)).toBe(true)
    expect(out).toEqual(CHUTE)
    expect(chunkPointAt(23, 24, 23, CHUTE, CROWN, out)).toBe(false)
    expect(chunkPointAt(23, 24, 24, CHUTE, CROWN, out)).toBe(true)
    expect(chunkPointAt(23, 24, 40, CHUTE, CROWN, out)).toBe(false)
  })

  it('arcs each chunk between 4 and 6 m over its straight path', () => {
    const out = point()
    const apexes = Array.from({ length: 24 }, (_, index) => {
      const launch = Math.floor((index * 24) / 23)
      chunkPointAt(index, 24, launch + BURST_TIMING.chunks.flightTicks / 2, CHUTE, CROWN, out)
      return out.y - (CHUTE.y + CROWN.y) / 2
    })
    expect(Math.min(...apexes)).toBeGreaterThanOrEqual(4 - 1e-9)
    expect(Math.max(...apexes)).toBeLessThanOrEqual(6 + 1e-9)
  })

  it('bursts the coins up out of the stack and holds each until its screen flight starts', () => {
    const wave = waveOf('0')
    const out = point()
    expect(stackCoinPointAt(wave, 0, BURST_TIMING.coins.burstTick - 1, STACK, out)).toBe(false)
    expect(stackCoinPointAt(wave, 0, BURST_TIMING.coins.hangTick - 1, STACK, out)).toBe(true)
    expect(out.y).toBeCloseTo(STACK.y + BURST_TIMING.coins.riseM)
    expect(screenFlightShareAt(wave, 0, BURST_TIMING.coins.hangTick)).toBe(0)
    expect(stackCoinPointAt(wave, 0, BURST_TIMING.coins.hangTick, STACK, out)).toBe(false)
  })

  it('peels the last coins off to the tag at the end of the hang', () => {
    const wave = waveOf('100')
    expect(isPeeledCoin(wave, wave.coins - 1)).toBe(true)
    expect(isPeeledCoin(wave, 0)).toBe(false)
    const peelShare = screenFlightShareAt(wave, wave.coins - 1, BURST_TIMING.lining.liningPeelTick)
    expect(peelShare).toBe(0)
  })

  it('lands every screen flight by tick 90', () => {
    const wave = waveOf('100')
    const inFlight = Array.from({ length: wave.coins }, (_, index) =>
      screenFlightShareAt(wave, index, BURST_TIMING.coins.landTick),
    )
    expect(inFlight.every((share) => share === null)).toBe(true)
  })

  it('leaves the screen flight from its start and arrives on its target', () => {
    const from = { x: 100, y: 500 }
    const to = { x: 900, y: 40 }
    expect(screenFlightPointAt(from, to, 0, point())).toEqual(from)
    const end = screenFlightPointAt(from, to, 1, point())
    expect(end.x).toBeCloseTo(to.x)
    expect(end.y).toBeCloseTo(to.y)
  })

  it('climbs the cascade a pentatonic step per note, capped two octaves up', () => {
    expect(cascadeHzOf(5)).toBeCloseTo(cascadeHzOf(0) * 2)
    expect(cascadeHzOf(10)).toBeCloseTo(cascadeHzOf(0) * 4)
    expect(cascadeHzOf(99)).toBe(cascadeHzOf(10))
    expect(cascadeHzOf(1)).toBeGreaterThan(cascadeHzOf(0))
  })
})

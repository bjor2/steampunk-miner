import { describe, expect, it } from 'vitest'
import { groundRadiusMmOf } from '../../../../systems/authority/charges/blastDisc'
import { WORLD_SEED } from '../../../../systems/authority/scriptedSession'
import { chargeRadiusMm, chargeTypeOf } from '../../../../systems/economy/chargeSizes'
import { freshPlanetParamsFor } from '../../../../systems/world/planetParams'
import { writeRingMark, type RingMark } from './blastMarks'
import { RING_DASH_M } from './blastLookConstants'

// The G&V row on #869: the placed charge's two rings before it blows, the solid danger ring at the
// base radius, which drives the self hit and the radius + 1 interlock and never grows, and the
// dashed ground ring at what the blast will clear, out to the planet's edge. The golden pins both at
// Blast Radius levels 0, 10 and 1e6 on the three screens the looks are pinned at.

/** Metres across the short axis (#39's 12 m) in pixels, as `chargeTypeLook.test.ts` pins them. */
const SCREENS = { phone360: 360 / 12, desktop1280x800: 800 / 12, desktop1920x1080: 1080 / 12 }
const GOLDEN_SIZES = [1, 6, 12]
const GOLDEN_LEVELS = [0, 10, 1_000_000]
const GOLDEN_PLANETS = [1, 40]

function ringAt(planetIndex: number, size: number, radiusLevel: number): RingMark {
  const params = freshPlanetParamsFor(WORLD_SEED, planetIndex)
  const radiusMm = chargeRadiusMm(size)
  const groundMm = groundRadiusMmOf({ radiusMm, radiusLevel }, params)
  const out: RingMark = {
    x: 0,
    y: 0,
    turn: 0,
    baseRadiusM: 0,
    groundRadiusM: 0,
    look: { colour: '#000000', strokeM: 0, casingTint: null },
  }
  const charge = { tx: 0, ty: params.radiusTiles - 10, size }
  return writeRingMark(charge, chargeTypeOf(size), radiusMm, groundMm, radiusLevel, null, out)
}

/** How many dashes the ground ring's rim holds, as the ring shader cuts it. */
function dashesOf(ring: RingMark): number {
  return Math.max(1, Math.floor((2 * Math.PI * ring.groundRadiusM) / RING_DASH_M))
}

function px(metres: number, pxPerMetre: number): string {
  return `${(metres * pxPerMetre).toFixed(1)}px`
}

function ringLineOf(planetIndex: number, size: number, level: number): string {
  const ring = ringAt(planetIndex, size, level)
  const screens = Object.entries(SCREENS).map(
    ([screen, pxPerMetre]) =>
      `${screen} danger ${px(ring.baseRadiusM, pxPerMetre)} ground ${px(ring.groundRadiusM, pxPerMetre)} stroke ${px(ring.look.strokeM, pxPerMetre)}`,
  )
  return `P${planetIndex} size ${size} L ${level}: ${dashesOf(ring)} dashes; ${screens.join('; ')}`
}

function ringsGolden(): string {
  const lines = GOLDEN_PLANETS.flatMap((planetIndex) =>
    GOLDEN_SIZES.flatMap((size) =>
      GOLDEN_LEVELS.map((level) => ringLineOf(planetIndex, size, level)),
    ),
  )
  return `${lines.join('\n')}\n`
}

describe('dynamite-visuals: the placed charge rings by Blast Radius level (#869)', () => {
  it('pins both rings at levels 0, 10 and 1e6 at 360 px and 1280+', async () => {
    await expect(ringsGolden()).toMatchFileSnapshot('./__goldens__/ringLevels.golden.txt')
  })

  it('keeps the danger ring at the rung while the ground ring grows with the level', () => {
    for (const size of GOLDEN_SIZES) {
      const [zero, ten, million] = GOLDEN_LEVELS.map((level) => ringAt(1, size, level))
      expect(ten.baseRadiusM).toBe(zero.baseRadiusM)
      expect(million.baseRadiusM).toBe(zero.baseRadiusM)
      expect(zero.groundRadiusM).toBe(zero.baseRadiusM)
      expect(ten.groundRadiusM).toBeGreaterThan(zero.groundRadiusM)
      expect(million.groundRadiusM).toBeGreaterThan(ten.groundRadiusM)
    }
  })

  it('stops the ground ring at the planet: no wider than its diameter at level 1e6', () => {
    const params = freshPlanetParamsFor(WORLD_SEED, 1)
    const ring = ringAt(1, 12, 1_000_000)
    expect(ring.groundRadiusM).toBe(2 * params.radiusTiles)
  })

  it('draws a dash and its gap at least 10 px long, and the stroke a pixel wide, on a 360 px phone', () => {
    const ring = ringAt(1, 1, 0)
    expect((RING_DASH_M / 2) * SCREENS.phone360).toBeGreaterThanOrEqual(10)
    expect(ring.look.strokeM * SCREENS.phone360).toBeGreaterThanOrEqual(1)
  })
})

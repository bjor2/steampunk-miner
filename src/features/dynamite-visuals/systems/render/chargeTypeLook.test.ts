import { describe, expect, it } from 'vitest'
import { MM_PER_METRE } from '../../../../constants/physics'
import { chargeRadiusMm, chargeSizeCount } from '../../../../systems/economy/chargeSizes'
import {
  casingGradeLookOf,
  casingTrimOf,
  STANDARD_TRIM_ID,
} from '../../../../systems/render/casingGradeLook'
import {
  chargeLookOfSize,
  chargeTypeLookOf,
  craterLookOf,
  DECAL_RIM_SHARE,
  DYNAMITE_LOOKS,
  fuseSparksOf,
  placedRingLookOf,
  radiusBandOf,
  radiusGrowthOf,
  RING_STROKE_M,
} from './chargeTypeLook'

// Types are verbs (the GD lock of 25 Oct on #647): sizes 1-4 break, 5-8 go deep, 9-12 are the
// biggest, and every size wears its type's look. The Blast Radius look row (#869) grows the look
// once per tenfold of the level; the Blast Casing look row (#862) tints a lined crater's rim in the
// laid grade's plate colour with its lining's trim.

/** The screens the goldens are pinned at: metres across the short axis (#39's 12 m) in pixels. */
const SCREENS = { phone360: 360 / 12, desktop1280x800: 800 / 12, desktop1920x1080: 1080 / 12 }
const GOLDEN_SIZES = [1, 6, 12]
const GOLDEN_LEVELS = [0, 1, 10, 99, 9_999, 1_000_000]

function px(metres: number, pxPerMetre: number): string {
  return `${(metres * pxPerMetre).toFixed(1)}px`
}

/** One golden line per size and screen: the type's colours, its ring stroke and crater width. */
function screenGoldenOf(size: number, screen: keyof typeof SCREENS): string {
  const pxPerMetre = SCREENS[screen]
  const look = chargeLookOfSize(size)
  const ring = placedRingLookOf(look.type, 0, null)
  const [crater] = craterLookOf(
    { chargeType: look.type, groundRadiusMm: chargeRadiusMm(size), casingLaid: false },
    null,
  )
  return `size ${size} @ ${screen}: type ${look.type} ${look.name} stick ${look.stick} spark ${look.spark} ring ${ring.colour} ${px(ring.strokeM, pxPerMetre)} crater ${crater.partId} ${crater.tint} ${px(crater.diameterM, pxPerMetre)}`
}

function bandsGolden(): string {
  return GOLDEN_LEVELS.map(
    (level) =>
      `level ${level}: band ${radiusBandOf(level)} growth ${radiusGrowthOf(level).toFixed(2)} stroke ${placedRingLookOf(1, level, null).strokeM.toFixed(3)} m`,
  ).join('\n')
}

function looksGolden(): string {
  const screens = Object.keys(SCREENS) as (keyof typeof SCREENS)[]
  const lines = GOLDEN_SIZES.flatMap((size) =>
    screens.map((screen) => screenGoldenOf(size, screen)),
  )
  return `${lines.join('\n')}\n\n${bandsGolden()}\n`
}

describe('charge type looks (D7, ticket 866)', () => {
  it('dresses every size in its type: 1-4 break, 5-8 go deep, 9-12 are the biggest', () => {
    const types = Array.from(
      { length: chargeSizeCount() },
      (_, at) => chargeLookOfSize(at + 1).type,
    )
    expect(types).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3])
    expect(chargeLookOfSize(12).name).toBe('Biggest charge')
    expect(() => chargeTypeLookOf(4)).toThrow(RangeError)
  })

  it("throws a fuse's sparks in the type's spark colour at the fuse row's rate", () => {
    expect(fuseSparksOf(2)).toEqual({ ...DYNAMITE_LOOKS.fuse, colour: chargeTypeLookOf(2).spark })
  })

  it('counts a Blast Radius band per tenfold of the level: 0 at level 0, 1 to 9 in band 1', () => {
    expect([0, 1, 9, 10, 99, 100, 9_999, 1_000_000].map(radiusBandOf)).toEqual([
      0, 1, 1, 2, 2, 3, 4, 7,
    ])
  })

  it('grows the sticks and the ring per band, never past the cap, and not at all at level 0', () => {
    const { growPerBand, growMax } = DYNAMITE_LOOKS.radiusBands
    expect(radiusGrowthOf(0)).toBe(1)
    expect(radiusGrowthOf(10)).toBeCloseTo(1 + 2 * growPerBand)
    expect(radiusGrowthOf(1_000_000)).toBe(Math.min(growMax, 1 + 7 * growPerBand))
    expect(radiusGrowthOf(Number.MAX_SAFE_INTEGER)).toBe(growMax)
    expect(placedRingLookOf(1, 0, null).strokeM).toBe(RING_STROKE_M)
  })

  it("leaves a bare crater as the type's decal in its soot, scaled to the ground radius", () => {
    const radiusMm = 8 * MM_PER_METRE
    const decals = craterLookOf(
      { chargeType: 2, groundRadiusMm: radiusMm, casingLaid: false },
      null,
    )
    expect(decals).toEqual([
      { partId: 'crater-2', tint: chargeTypeLookOf(2).soot, diameterM: 16 / DECAL_RIM_SHARE },
    ])
  })

  it("lines a cased crater in the laid grade's plate colour with its lining's trim (#830)", () => {
    const blast = { chargeType: 3, groundRadiusMm: 20_000, casingLaid: true }
    const plate = casingGradeLookOf(7).plate
    const refractory = casingTrimOf('refractory')
    expect(craterLookOf(blast, { grade: 7, liningType: 'refractory' })).toEqual([
      { partId: 'crater-cased-rim', tint: plate.colour, diameterM: 40 / DECAL_RIM_SHARE },
      { partId: 'crater-cased-trim', tint: refractory.colour, diameterM: 40 / DECAL_RIM_SHARE },
    ])
    // The standard lining has no trim colour of its own: the plate's groove draws its seam.
    expect(craterLookOf(blast, { grade: 1, liningType: STANDARD_TRIM_ID })[1].tint).toBe(
      casingGradeLookOf(1).plate.groove,
    )
  })

  it('draws a bare crater when no casing was laid, whatever the planter owns', () => {
    const blast = { chargeType: 3, groundRadiusMm: 20_000, casingLaid: false }
    expect(craterLookOf(blast, { grade: 7, liningType: 'refractory' })[0].partId).toBe('crater-3')
  })

  it("rings a live charge in its type's colour, and in the plate tint once casing will be laid", () => {
    expect(placedRingLookOf(1, 0, null)).toEqual({
      colour: chargeTypeLookOf(1).ring,
      strokeM: RING_STROKE_M,
      casingTint: null,
    })
    expect(placedRingLookOf(1, 0, { grade: 3, liningType: STANDARD_TRIM_ID }).casingTint).toBe(
      casingGradeLookOf(3).plate.colour,
    )
  })

  it('pins the looks at 360 px and 1280+ for sizes 1, 6 and 12, and the bands at the golden levels', async () => {
    await expect(looksGolden()).toMatchFileSnapshot('./__goldens__/dynamiteLooks.golden.txt')
  })

  it('keeps the ring and the smallest crater at least a pixel wide on a 360 px phone', () => {
    const ring = placedRingLookOf(1, 0, null)
    const [crater] = craterLookOf(
      { chargeType: 1, groundRadiusMm: chargeRadiusMm(1), casingLaid: false },
      null,
    )
    expect(ring.strokeM * SCREENS.phone360).toBeGreaterThanOrEqual(1)
    expect(crater.diameterM * SCREENS.phone360).toBeGreaterThanOrEqual(1)
  })
})

import { describe, expect, it } from 'vitest'
import { SPARK_CAPACITY } from '../../../../constants/scene'
import {
  chargeRadiusMm,
  chargeSizeCount,
  chargeSizesUpTo,
  chargeTypeOf,
} from '../../../../systems/economy/chargeSizes'
import {
  createScreenEffects,
  kickScreen,
  stepScreenEffects,
} from '../../../../systems/feedback/screenEffects'
import { SHAKE_MAX_METRES } from '../../../../constants/scene'
import { blastCueOf } from './blastCue'
import {
  BLAST_DEBRIS_CAPACITY,
  FLASH_FRAMES,
  FRONT_DUST_CAPACITY,
  REDUCED_FLASH_SHARE,
  SHOCKWAVE_MAX_SECONDS,
  SHOCKWAVE_MIN_SECONDS,
  SHOWCASE_BANNER_TICKS,
  SHOWCASE_EXTRA_FLASH_FRAMES,
} from './blastLookConstants'
import {
  blastEffectSwitchesOf,
  blastVfxPlanOf,
  fittedCountsOf,
  FULL_EFFECTS,
  rawCountsOf,
  stageTotalOf,
  type BlastVfxInput,
  type BlastVfxPlan,
} from './blastVfxPlan'
import { chargeTypeLookOf } from './chargeTypeLook'

const GROUND: BlastVfxInput['groundColour'] = [0.5, 0.4, 0.3]
/** The screens the goldens are pinned at: metres across the short axis (#39's 12 m) in pixels. */
const SCREENS = { phone360: 360 / 12, desktop1280x800: 800 / 12, desktop1920x1080: 1080 / 12 }
const GOLDEN_SIZES = [1, 6, 12]
const GOLDEN_LEVELS = [0, 10, 1_000_000]

function inputOf(size: number, overrides: Partial<BlastVfxInput> = {}): BlastVfxInput {
  return {
    size,
    chargeType: chargeTypeOf(size),
    radiusLevel: 0,
    groundRadiusMm: chargeRadiusMm(size),
    groundColour: GROUND,
    isShowcase: false,
    switches: FULL_EFFECTS,
    ...overrides,
  }
}

function planOf(size: number, overrides: Partial<BlastVfxInput> = {}): BlastVfxPlan {
  return blastVfxPlanOf(inputOf(size, overrides))
}

/** The ground radius at a Blast Radius level, as the disc rule widens it: r·√(1 + L/16). */
function groundRadiusAt(size: number, level: number): number {
  return Math.round(chargeRadiusMm(size) * Math.sqrt(1 + level / 16))
}

function px(metres: number, pxPerMetre: number): string {
  return `${(metres * pxPerMetre).toFixed(1)}px`
}

function goldenLineOf(size: number, level: number, screen: keyof typeof SCREENS): string {
  const pxPerMetre = SCREENS[screen]
  const plan = planOf(size, { radiusLevel: level, groundRadiusMm: groundRadiusAt(size, level) })
  const { flash, fireball, shockwave, counts, lives } = plan
  return [
    `size ${size} L ${level} @ ${screen}: band ${plan.band}`,
    `flash ${flash.frames}f ${flash.opacity.toFixed(2)} ${px(flash.radiusM, pxPerMetre)}`,
    `fireball ${fireball.seconds.toFixed(2)}s ${px(fireball.startRadiusM, pxPerMetre)}→${px(fireball.endRadiusM, pxPerMetre)} ${fireball.fromColour}→${fireball.toColour}`,
    `shockwave ${shockwave.seconds.toFixed(2)}s ${px(shockwave.reachM, pxPerMetre)} ${px(shockwave.widthM, pxPerMetre)} ${shockwave.colour}`,
    `counts fire ${counts.fireballSparks}+${counts.embers} dust ${counts.plume}+${counts.smoke}+${counts.chips} debris ${counts.debris}`,
    `lives plume ${lives.plumeSeconds.toFixed(2)}s smoke ${lives.smokeSeconds.toFixed(2)}s embers ${lives.emberSeconds.toFixed(2)}s`,
  ].join(' | ')
}

function vfxGolden(): string {
  const screens = Object.keys(SCREENS) as (keyof typeof SCREENS)[]
  const lines = GOLDEN_SIZES.flatMap((size) =>
    GOLDEN_LEVELS.flatMap((level) => screens.map((screen) => goldenLineOf(size, level, screen))),
  )
  return `${lines.join('\n')}\n`
}

// D8 (#868): stages per blast, escalating once per size and once per Blast Radius band, every
// count capped by its pool, the radius scaling only sprites and the ring; the showcase and the
// reduce-motion reading are look-only switches on the same plan.

describe('blast VFX plan (D8 #868)', () => {
  it('names every stage: flash, fireball, shockwave, debris and chips, plume, embers and smoke', () => {
    const plan = planOf(6)
    expect(plan.flash.frames).toBe(FLASH_FRAMES)
    expect(plan.fireball.seconds).toBeGreaterThan(0)
    expect(plan.shockwave.reachM).toBeGreaterThan(0)
    for (const count of Object.values(plan.counts)) expect(count).toBeGreaterThan(0)
    expect(plan.lives.smokeSeconds).toBeGreaterThan(plan.lives.plumeSeconds)
    expect(plan.banner).toBeNull()
  })

  it('escalates every count and the plume with the size index, and the flash to three frames from size 7', () => {
    const plans = chargeSizesUpTo(chargeSizeCount()).map((size) => planOf(size))
    for (let at = 1; at < plans.length; at++) {
      const [smaller, bigger] = [plans[at - 1], plans[at]]
      expect(stageTotalOf(rawCountsOf(bigger.size, 0))).toBeGreaterThan(
        stageTotalOf(rawCountsOf(smaller.size, 0)),
      )
      expect(bigger.counts.debris).toBeGreaterThanOrEqual(smaller.counts.debris)
      expect(bigger.lives.plumeSeconds).toBeGreaterThan(smaller.lives.plumeSeconds)
      expect(bigger.flash.frames).toBeGreaterThanOrEqual(smaller.flash.frames)
    }
    expect(plans[5].flash.frames).toBe(FLASH_FRAMES)
    expect(plans[6].flash.frames).toBe(FLASH_FRAMES + 1)
  })

  it('escalates once per tenfold of the Blast Radius level, never within a decade', () => {
    const at = (level: number) =>
      stageTotalOf(rawCountsOf(6, planOf(6, { radiusLevel: level }).band))
    expect(at(1)).toBeGreaterThan(at(0))
    expect(at(9)).toBe(at(1))
    expect(at(10)).toBeGreaterThan(at(9))
    expect(at(1_000_000)).toBeGreaterThan(at(99_999))
    expect(planOf(6, { radiusLevel: 1_000_000 }).lives.plumeSeconds).toBeGreaterThan(
      planOf(6).lives.plumeSeconds,
    )
  })

  it('caps every count by its pool, not by the radius: the biggest blast at a million levels fits', () => {
    const plan = planOf(12, { radiusLevel: 1_000_000, groundRadiusMm: 9_000_000 })
    const { counts } = plan
    expect(counts.fireballSparks + counts.embers).toBeLessThanOrEqual(SPARK_CAPACITY)
    expect(counts.plume + counts.smoke + counts.chips).toBeLessThanOrEqual(FRONT_DUST_CAPACITY)
    expect(counts.debris).toBeLessThanOrEqual(BLAST_DEBRIS_CAPACITY)
    expect(stageTotalOf(counts)).toBeLessThan(stageTotalOf(rawCountsOf(12, plan.band)))
    const same = planOf(12, { radiusLevel: 1_000_000, groundRadiusMm: 37_000 })
    expect(same.counts).toEqual(counts)
  })

  it('scales the sprites and the shockwave with the ground radius, within their clamps', () => {
    const small = planOf(1)
    const wide = planOf(12)
    expect(wide.fireball.endRadiusM).toBeGreaterThan(small.fireball.endRadiusM)
    expect(wide.shockwave.reachM).toBeGreaterThan(small.shockwave.reachM)
    expect(wide.shockwave.seconds).toBeGreaterThan(small.shockwave.seconds)
    const huge = planOf(12, { radiusLevel: 1_000_000, groundRadiusMm: 9_000_000 })
    expect(huge.shockwave.seconds).toBe(SHOCKWAVE_MAX_SECONDS)
    expect(small.shockwave.seconds).toBe(SHOCKWAVE_MIN_SECONDS)
    expect(huge.fireball.endRadiusM).toBeLessThanOrEqual(14)
  })

  it('fits a pool by scaling its stages down together and never raises a count', () => {
    const raw = { fireballSparks: 300, embers: 100, plume: 10, smoke: 10, chips: 10, debris: 200 }
    const fitted = fittedCountsOf(raw)
    expect(fitted.fireballSparks + fitted.embers).toBeLessThanOrEqual(SPARK_CAPACITY)
    expect(fitted.fireballSparks / fitted.embers).toBeCloseTo(3, 1)
    expect(fitted.plume).toBe(10)
    expect(fitted.debris).toBe(BLAST_DEBRIS_CAPACITY)
  })

  it('wears the type: fire in its spark colour, the ring in its ring colour, the chips in the broken ground and its soot', () => {
    for (const size of [1, 6, 12]) {
      const look = chargeTypeLookOf(chargeTypeOf(size))
      const plan = planOf(size)
      expect(plan.colours.fire).toBe(look.spark)
      expect(plan.shockwave.colour).toBe(look.ring)
      expect(plan.fireball.fromColour).toBe(look.spark)
      expect(plan.fireball.toColour).toBe(look.soot)
      expect(plan.colours.chips).toEqual(['#80664d', '#594736', look.soot])
      expect(plan.colours.smoke).not.toBe(look.soot)
    }
  })

  it('plays the showcase with a longer flash and the charge name on a banner, else no banner', () => {
    const plain = planOf(6)
    const showcase = planOf(6, { isShowcase: true })
    expect(showcase.flash.frames).toBe(plain.flash.frames + SHOWCASE_EXTRA_FLASH_FRAMES)
    expect(showcase.banner).toEqual({
      name: 'Deep charge',
      sizeLine: 'Size 6',
      ticks: SHOWCASE_BANNER_TICKS,
    })
    expect(showcase.counts).toEqual(plain.counts)
  })

  it('dims the flash with the shake switch off (reduce motion) and hides it with flashes off', () => {
    const full = planOf(9)
    const reduced = planOf(9, { switches: blastEffectSwitchesOf({ shake: false, flashes: true }) })
    const noFlash = planOf(9, { switches: blastEffectSwitchesOf({ shake: true, flashes: false }) })
    expect(full.flash.opacity).toBeGreaterThan(0)
    expect(reduced.flash.opacity).toBeCloseTo(full.flash.opacity * REDUCED_FLASH_SHARE, 6)
    expect(noFlash.flash.opacity).toBe(0)
    expect(reduced.counts).toEqual(full.counts)
    expect(reduced.shockwave).toEqual(full.shockwave)
  })

  it("holds the camera shake under the kernel's cap and under a phone pixel within 0.3 s, at every size", () => {
    for (const size of [1, 6, 12]) {
      const effects = createScreenEffects()
      const switches = { shake: true, flashes: true }
      const kick = blastCueOf(size, chargeRadiusMm(size), 0)
      kickScreen(effects, { kind: 'chargeBlast', kick }, switches)
      let reach = 0
      for (let step = 0; step < 18; step++) {
        stepScreenEffects(effects, 1 / 60, switches, 1 / 60)
        reach = Math.max(reach, Math.hypot(effects.offsetX, effects.offsetY))
      }
      expect(reach).toBeLessThanOrEqual(SHAKE_MAX_METRES * Math.SQRT2)
      // A 360 px phone shows 12 m across (#39): a pixel is 1/30 m.
      expect(Math.hypot(effects.offsetX, effects.offsetY)).toBeLessThan(1 / 30)
    }
  })

  it('pins the stages at sizes 1, 6 and 12, levels 0, 10 and 1e6, on 360 px, 1280x800 and 1920x1080', async () => {
    await expect(vfxGolden()).toMatchFileSnapshot('./__goldens__/blastVfx.golden.txt')
  })
})

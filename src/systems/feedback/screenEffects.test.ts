import { describe, expect, it } from 'vitest'
import { FLASH_MAX_OPACITY, SHAKE_MAX_METRES } from '../../constants/scene'
import { SHIPPED_CHARGE_BLAST_KICK } from '../registries/chargeBlastCue'
import {
  createScreenEffects,
  kickScreen,
  stepScreenEffects,
  type EffectSwitches,
} from './screenEffects'

const ALL_ON: EffectSwitches = { shake: true, flashes: true }

function run(seconds: number, fps: number, switches: EffectSwitches = ALL_ON) {
  const effects = createScreenEffects()
  kickScreen(effects, { kind: 'hit' }, switches)
  let largestOffset = 0
  let largestFlash = 0
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) {
    stepScreenEffects(effects, 1 / fps, switches)
    largestOffset = Math.max(largestOffset, Math.hypot(effects.offsetX, effects.offsetY))
    largestFlash = Math.max(largestFlash, effects.flash)
  }
  return { effects, largestOffset, largestFlash }
}

describe('screen shake and flash', () => {
  it('never moves the camera past the shake cap or covers past the flash cap, however hits stack', () => {
    const effects = createScreenEffects()
    for (let hit = 0; hit < 20; hit++) {
      kickScreen(effects, { kind: 'destroyed' }, ALL_ON)
      stepScreenEffects(effects, 1 / 144, ALL_ON)
      expect(Math.hypot(effects.offsetX, effects.offsetY)).toBeLessThanOrEqual(
        SHAKE_MAX_METRES * Math.SQRT2,
      )
      expect(Math.abs(effects.offsetX)).toBeLessThanOrEqual(SHAKE_MAX_METRES)
      expect(effects.flash).toBeLessThanOrEqual(FLASH_MAX_OPACITY)
    }
  })

  it('shakes and flashes on a hit, then settles within a second at 30 and at 144 frames/s', () => {
    for (const fps of [30, 144]) {
      const { effects, largestOffset, largestFlash } = run(1, fps)
      expect(largestOffset).toBeGreaterThan(0)
      expect(largestFlash).toBeGreaterThan(0)
      expect(Math.hypot(effects.offsetX, effects.offsetY)).toBeLessThan(0.001)
      expect(effects.flash).toBe(0)
    }
  })

  it('decays the shake the same at 30 and 144 frames/s', () => {
    expect(run(0.5, 30).effects.shake).toBeCloseTo(run(0.5, 144).effects.shake, 6)
  })

  it('never moves the camera with shake off', () => {
    expect(run(1, 60, { shake: false, flashes: true }).largestOffset).toBe(0)
  })

  it('never covers the screen with flashes off', () => {
    expect(run(1, 60, { shake: true, flashes: false }).largestFlash).toBe(0)
  })

  it("kicks the shipped charge's blast as it always has: 0.8 of the shake and no flash", () => {
    const effects = createScreenEffects()
    kickScreen(effects, { kind: 'chargeBlast', kick: SHIPPED_CHARGE_BLAST_KICK }, ALL_ON)
    expect([effects.shake, effects.flash]).toEqual([0.8, 0])
  })

  it("flashes for a blast whose kick asks, though the blast's accent is not the bloom flash (#213)", () => {
    const effects = createScreenEffects()
    const kick = { shake: 0.5, flash: 0.5, thumpDelayTicks: 0 }
    kickScreen(effects, { kind: 'chargeBlast', kick }, ALL_ON)
    expect([effects.shake, effects.flash]).toEqual([0.5, 0.5 * FLASH_MAX_OPACITY])
  })

  it("keeps a blast's kick behind the player's shake and flash switches", () => {
    const effects = createScreenEffects()
    const kick = { shake: 0.5, flash: 0.5, thumpDelayTicks: 0 }
    kickScreen(effects, { kind: 'chargeBlast', kick }, { shake: false, flashes: false })
    expect([effects.shake, effects.flash]).toEqual([0, 0])
  })

  it('clears a running shake and flash the moment the switches go off', () => {
    const effects = createScreenEffects()
    kickScreen(effects, { kind: 'hit' }, ALL_ON)
    stepScreenEffects(effects, 1 / 60, { shake: false, flashes: false })
    expect([effects.offsetX, effects.offsetY, effects.flash]).toEqual([0, 0, 0])
  })
})

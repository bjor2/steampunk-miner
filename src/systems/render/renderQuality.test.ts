import { describe, expect, it } from 'vitest'
import {
  chosenPresetOf,
  degradedQualityOf,
  devicePresetOf,
  isBloomDrawn,
  LOWEST_QUALITY_RUNG,
  presetQualityOf,
  renderQualityChoiceProblems,
} from './renderQuality'

const DESKTOP = { terrainProgram: 'full', isCoarsePointer: false } as const
const PHONE = { terrainProgram: 'full', isCoarsePointer: true } as const
const LITE_PHONE = { terrainProgram: 'lite', isCoarsePointer: true } as const

describe('render quality presets (TD #470 section 2.4, ticket 477)', () => {
  it('halves the particles and reduces the background on a coarse pointer (#173 section 3)', () => {
    const phone = presetQualityOf(devicePresetOf(PHONE))
    const desktop = presetQualityOf(devicePresetOf(DESKTOP))
    expect(phone.particleShare).toBe(desktop.particleShare / 2)
    expect(phone.parallaxLayers).toBeLessThan(desktop.parallaxLayers)
  })

  it('keeps the full look on a fine pointer with the full terrain program', () => {
    expect(devicePresetOf(DESKTOP)).toBe('high')
    expect(presetQualityOf('high')).toEqual({
      renderScaleCap: 1,
      renderFpsCap: null,
      particleShare: 1,
      parallaxLayers: 2,
      postBloom: true,
    })
  })

  it('starts a GPU short of the full terrain program on the low preset, whatever its pointer', () => {
    expect(devicePresetOf(LITE_PHONE)).toBe('low')
    expect(devicePresetOf({ terrainProgram: 'lite', isCoarsePointer: false })).toBe('low')
  })

  it('takes the device preset for auto and the named one otherwise', () => {
    expect(chosenPresetOf('auto', PHONE)).toBe('mid')
    expect(chosenPresetOf('high', PHONE)).toBe('high')
    expect(chosenPresetOf('low', DESKTOP)).toBe('low')
  })

  it('refuses a choice that is not auto or a preset', () => {
    expect(renderQualityChoiceProblems('mid')).toEqual([])
    expect(renderQualityChoiceProblems('ultra')).toEqual([
      'render quality must be one of auto, low, mid, high, got "ultra"',
    ])
  })
})

describe('render quality ladder rungs (TD #470 section 2.4, ticket 477)', () => {
  it('caps the render rate at 30 first, then cuts particles and background, then bloom', () => {
    const rungs = [0, 1, 2, 3].map((rung) => degradedQualityOf('high', rung))
    expect(rungs.map((quality) => quality.renderFpsCap)).toEqual([null, 30, 30, 30])
    expect(rungs.map((quality) => quality.particleShare)).toEqual([1, 1, 0.5, 0.5])
    expect(rungs.map((quality) => quality.parallaxLayers)).toEqual([2, 2, 1, 1])
    expect(rungs.map((quality) => quality.postBloom)).toEqual([true, true, true, false])
  })

  it('never touches the render scale cap, which the render scale rule already spent', () => {
    expect(degradedQualityOf('high', LOWEST_QUALITY_RUNG).renderScaleCap).toBe(1)
  })

  it('leaves the low preset as it is, since it already holds every cut', () => {
    expect(degradedQualityOf('low', LOWEST_QUALITY_RUNG)).toEqual(presetQualityOf('low'))
  })

  it('draws bloom only into a float scene target', () => {
    expect(isBloomDrawn(presetQualityOf('high'), 'half_float')).toBe(true)
    expect(isBloomDrawn(presetQualityOf('high'), 'rgba8')).toBe(false)
    expect(isBloomDrawn(presetQualityOf('low'), 'half_float')).toBe(false)
  })
})

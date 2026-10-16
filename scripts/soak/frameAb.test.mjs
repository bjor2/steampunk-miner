import { describe, expect, it } from 'vitest'
import {
  formatFrameAbReport,
  metricsOfFrameAb,
  NOT_GPU_NUMBERS,
  PHONE_READING_MISSING,
  summariseFrameAb,
} from './frameAb.mjs'
import { metricsOfMeasurementFile } from '../perf/perfMetrics.mjs'

const GPU = 'ANGLE (AMD, AMD Custom GPU 0405 (vangogh), OpenGL 4.6)'
const SWIFTSHADER =
  'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'
const AT_BAR_VIEW = { width: 1280, height: 800 }

function roundOf(frameP50sMs, programsLinked = 0, viewport = AT_BAR_VIEW) {
  return { frameP50sMs, programsLinked, viewport }
}

describe('frame A/B soak', () => {
  it('passes a real-GPU run whose p50 rose by no more than half a millisecond', () => {
    const summary = summariseFrameAb({
      off: [roundOf([8, 8.2, 8.1]), roundOf([8.1, 8.3, 8])],
      on: [roundOf([8.5, 8.6, 8.4]), roundOf([8.6, 8.4, 8.5])],
      renderer: GPU,
    })

    expect(summary.frameP50DeltaMs).toBe(0.4)
    expect(summary.verdict).toBe('PASS')
  })

  it('fails a real-GPU run whose p50 rose by more than half a millisecond', () => {
    const summary = summariseFrameAb({
      off: [roundOf([8])],
      on: [roundOf([8.6])],
      renderer: GPU,
    })

    expect(summary.verdict).toBe('FAIL')
    expect(summary.failures).toEqual(['p50 rose 0.6 ms with the look on (bar: at most +0.5 ms)'])
  })

  it('fails a look-on build that linked a shader program while the view was held', () => {
    const summary = summariseFrameAb({
      off: [roundOf([8])],
      on: [roundOf([8], 0), roundOf([8], 1)],
      renderer: GPU,
    })

    expect(summary.verdict).toBe('FAIL')
    expect(summary.failures).toEqual(['1 shader program(s) linked while the look-on view was held'])
  })

  it('fails a run that drew at anything but 1280x800', () => {
    const summary = summariseFrameAb({
      off: [roundOf([8], 0, { width: 1280, height: 720 })],
      on: [roundOf([8])],
      renderer: GPU,
    })

    expect(summary.failures).toEqual(['drew at 1280x720, 1280x800; the bar is judged at 1280x800'])
  })

  it('never judges a SwiftShader run against the bar, even one far over it', () => {
    const summary = summariseFrameAb({
      off: [roundOf([180])],
      on: [roundOf([200], 2)],
      renderer: SWIFTSHADER,
    })

    expect(summary.isGpuMeasurement).toBe(false)
    expect(summary.verdict).toBe('NOT A MEASUREMENT')
  })

  it('records a real-GPU run under its own ids, which perf:record reads as they are', () => {
    const summary = summariseFrameAb({ off: [roundOf([8])], on: [roundOf([8.25])], renderer: GPU })

    expect(metricsOfMeasurementFile({ metrics: metricsOfFrameAb(summary) }).metrics).toEqual({
      'frameAbElectron.frameP50OffMs': 8,
      'frameAbElectron.frameP50OnMs': 8.25,
      'frameAbElectron.frameP50DeltaMs': 0.25,
      'frameAbElectron.shaderRecompiles': 0,
    })
  })

  it('records a SwiftShader dry run apart from the real-GPU series', () => {
    const summary = summariseFrameAb({
      off: [roundOf([180])],
      on: [roundOf([181])],
      renderer: SWIFTSHADER,
    })

    expect(Object.keys(metricsOfFrameAb(summary))).toEqual([
      'frameAbElectronSwiftShader.frameP50OffMs',
      'frameAbElectronSwiftShader.frameP50OnMs',
      'frameAbElectronSwiftShader.frameP50DeltaMs',
      'frameAbElectronSwiftShader.shaderRecompiles',
    ])
  })

  it('labels a SwiftShader report as not GPU numbers and prints the phone line', () => {
    const summary = summariseFrameAb({
      off: [roundOf([180])],
      on: [roundOf([181])],
      renderer: SWIFTSHADER,
    })

    const lines = formatFrameAbReport(summary, undefined)

    expect(lines).toContain(NOT_GPU_NUMBERS)
    expect(lines).toContain('verdict: NOT A MEASUREMENT')
    expect(lines.at(-1)).toBe(PHONE_READING_MISSING)
  })

  it('prints the view and the bar it was judged against', () => {
    const summary = summariseFrameAb({ off: [roundOf([8])], on: [roundOf([8.25])], renderer: GPU })

    const lines = formatFrameAbReport(summary, 'phone reading (#482): Pixel 7, +0.4 ms')

    expect(lines[0]).toBe('frame A/B, P1 band 5, 20 m zoom, 1280x800')
    expect(lines).toContain('delta: +0.25 ms (bar: at most +0.5 ms, no shader recompile)')
    expect(lines).not.toContain(NOT_GPU_NUMBERS)
    expect(lines.at(-1)).toBe('phone reading (#482): Pixel 7, +0.4 ms')
  })
})

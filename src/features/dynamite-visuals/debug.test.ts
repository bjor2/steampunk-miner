import { describe, expect, it } from 'vitest'
import { dynamiteVisualsDebugActions } from './debug'

describe('dynamite-visuals debug reads', () => {
  it('reports no rack parts while no rack is bolted on', () => {
    expect(dynamiteVisualsDebugActions.getRack()).toEqual({ ok: true, partIds: [] })
  })

  it('reports the front budget it declares beside what it drew', () => {
    expect(dynamiteVisualsDebugActions.getFront()).toMatchObject({
      ok: true,
      budget: { drawCalls: 4, instances: 514 },
      peak: { drawCalls: 0, instances: 0 },
      blastsPlayed: 0,
      showcasesPlayed: 0,
      fallsPlayed: 0,
      banner: null,
    })
  })

  it('reports the marks budget it declares beside what it holds and drew', () => {
    expect(dynamiteVisualsDebugActions.getMarks()).toMatchObject({
      ok: true,
      craters: 0,
      rings: 0,
      budget: { drawCalls: 5, instances: 58 },
    })
  })

  it('refuses to preview a size the ladder does not list, applying nothing', () => {
    expect(dynamiteVisualsDebugActions.previewBlast(13)).toEqual({
      ok: false,
      problems: ['size must be 1 to 12, got 13'],
    })
    expect(dynamiteVisualsDebugActions.previewBlast(10)).toEqual({ ok: true })
  })

  it('previews the showcase variant on request and refuses any other word (D8 #868)', () => {
    expect(dynamiteVisualsDebugActions.previewBlast(6, 'showcase')).toEqual({ ok: true })
    expect(dynamiteVisualsDebugActions.previewBlast(6, 'loud')).toEqual({
      ok: false,
      problems: ['variant must be plain or showcase, got loud'],
    })
  })

  it('plays an explosion bench row through the real pools and answers its timings (D8 #868)', () => {
    const screen = { name: 'phone360', shortAxisPixels: 360, cpuSlowdown: 4 }
    const result = dynamiteVisualsDebugActions.benchBlast(6, 10, screen) as {
      ok: true
      line: { row: string; band: number; frames: number; piecesThrown: number; failures: string[] }
    }
    expect(result.ok).toBe(true)
    expect(result.line).toMatchObject({ row: 'vfx.s6.L10.phone360', band: 2 })
    expect(result.line.frames).toBeGreaterThan(60)
    expect(result.line.piecesThrown).toBeGreaterThan(0)
    expect(dynamiteVisualsDebugActions.benchBlast(0, -1, null)).toEqual({
      ok: false,
      problems: [
        'size must be 1 to 12, got 0',
        'level must be a whole number from 0, got -1',
        'screen must be {name, shortAxisPixels, cpuSlowdown}',
      ],
    })
  })
})

import { describe, expect, it } from 'vitest'
import { dynamiteVisualsDebugActions } from './debug'

describe('dynamite-visuals debug reads', () => {
  it('reports no rack parts while no rack is bolted on', () => {
    expect(dynamiteVisualsDebugActions.getRack()).toEqual({ ok: true, partIds: [] })
  })

  it('reports the front budget it declares beside what it drew', () => {
    expect(dynamiteVisualsDebugActions.getFront()).toMatchObject({
      ok: true,
      budget: { drawCalls: 3, instances: 513 },
      peak: { drawCalls: 0, instances: 0 },
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
})

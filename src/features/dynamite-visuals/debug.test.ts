import { describe, expect, it } from 'vitest'
import { dynamiteVisualsDebugActions } from './debug'

describe('dynamite-visuals debug reads', () => {
  it('reports no rack parts while no rack is bolted on', () => {
    expect(dynamiteVisualsDebugActions.getRack()).toEqual({ ok: true, partIds: [] })
  })

  it('reports the front budget it declares beside what it drew', () => {
    expect(dynamiteVisualsDebugActions.getFront()).toMatchObject({
      ok: true,
      budget: { drawCalls: 4, instances: 673 },
      peak: { drawCalls: 0, instances: 0 },
    })
  })

  it('refuses to preview a size the ladder does not list, applying nothing', () => {
    expect(dynamiteVisualsDebugActions.previewBlast(11)).toEqual({
      ok: false,
      problems: ['size must be 1 to 10, got 11'],
    })
    expect(dynamiteVisualsDebugActions.previewBlast(10)).toEqual({ ok: true })
  })
})

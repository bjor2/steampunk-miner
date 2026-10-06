import { afterEach, describe, expect, it } from 'vitest'
import { watchRendererInfo, type RendererInfo } from '../scene/rendererMemory'
import { createDebugApi } from './debugApi'

// The renderer's `info` as three keeps it: one object the renderer mutates as it draws.
function rendererInfo(geometries: number, textures: number): RendererInfo {
  return { memory: { geometries, textures }, programs: null }
}

let unwatch = () => {}
afterEach(() => unwatch())

describe('debug api: renderer memory (#119)', () => {
  it('refuses with a problem while no game renderer is drawing', () => {
    expect(createDebugApi().ui.getRendererMemory()).toEqual({
      ok: false,
      problems: ['no game renderer is drawing'],
    })
  })

  it('reads the drawing renderer counts as they are when asked', () => {
    const info = rendererInfo(31, 18)
    unwatch = watchRendererInfo(info)
    const debug = createDebugApi()
    expect(debug.ui.getRendererMemory()).toEqual({
      ok: true,
      geometries: 31,
      textures: 18,
      programs: 0,
    })
    info.memory.geometries = 34
    info.programs = ['sky', 'terrain', 'composite']
    expect(debug.ui.getRendererMemory()).toEqual({
      ok: true,
      geometries: 34,
      textures: 18,
      programs: 3,
    })
  })

  it('refuses again once the renderer unmounts', () => {
    watchRendererInfo(rendererInfo(31, 18))()
    expect(createDebugApi().ui.getRendererMemory().ok).toBe(false)
  })

  it('reads what the remounted renderer holds after a remount', () => {
    const first = watchRendererInfo(rendererInfo(31, 18))
    unwatch = watchRendererInfo(rendererInfo(5, 2))
    first()
    expect(createDebugApi().ui.getRendererMemory()).toEqual({
      ok: true,
      geometries: 5,
      textures: 2,
      programs: 0,
    })
  })
})

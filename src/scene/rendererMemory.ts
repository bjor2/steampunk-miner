/**
 * What the game's renderer holds on the GPU (#119, perf report section 5 item 5): three's
 * `renderer.info` counts of live geometries, textures and compiled programs, for the debug API's
 * `ui.getRendererMemory()` and the memory soak. `RenderPipeline` registers its renderer's `info` on
 * mount; the counts are read only when asked, so drawing a frame costs nothing extra.
 */
import type { WebGLInfo } from 'three'

export interface RendererMemory {
  geometries: number
  textures: number
  programs: number
}

/** The part of three's `WebGLInfo` the counts come from; a `WebGLInfo` is one. */
export interface RendererInfo {
  memory: Pick<WebGLInfo['memory'], 'geometries' | 'textures'>
  programs: readonly unknown[] | null
}

const drawing: { info: RendererInfo | null } = { info: null }

/** Registers the drawing renderer's `info`; the returned call unregisters it on unmount. */
export function watchRendererInfo(info: RendererInfo): () => void {
  drawing.info = info
  return () => {
    if (drawing.info === info) drawing.info = null
  }
}

/** Null while no game renderer is mounted. */
export function rendererMemoryNow(): RendererMemory | null {
  return drawing.info === null ? null : rendererMemoryOf(drawing.info)
}

/** `programs` is null until the renderer compiles its first program. */
function rendererMemoryOf(info: RendererInfo): RendererMemory {
  return {
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: info.programs?.length ?? 0,
  }
}

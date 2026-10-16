/**
 * The startup GPU capability probe (TD #470 section 2.2, ticket 477): the one place that asks the
 * WebGL2 context for its limits, once per renderer. `gpuTier.ts` decides from the readings which
 * terrain program and scene target to draw; the render pipeline logs them as `gpu_capabilities`
 * and the debug API's render stats show them. Nothing in the simulation reads them.
 */
import type { WebGLRenderer } from 'three'
import type { GpuCapabilities } from '../systems/render/gpuTier'

/**
 * The compressed formats `KTX2Loader.detectSupport` looks for, under the names the probe reports;
 * the WebKit prefixes are the ones three's loader also accepts.
 */
const TEXTURE_FORMAT_EXTENSIONS: readonly (readonly [string, readonly string[]])[] = [
  ['astc', ['WEBGL_compressed_texture_astc']],
  ['bptc', ['EXT_texture_compression_bptc']],
  ['etc2', ['WEBGL_compressed_texture_etc']],
  ['etc1', ['WEBGL_compressed_texture_etc1']],
  ['s3tc', ['WEBGL_compressed_texture_s3tc', 'WEBKIT_WEBGL_compressed_texture_s3tc']],
  ['pvrtc', ['WEBGL_compressed_texture_pvrtc', 'WEBKIT_WEBGL_compressed_texture_pvrtc']],
]

const PROBED = new WeakMap<WebGLRenderer, GpuCapabilities>()

/** The renderer's readings, probed on the first call and remembered for its life. */
export function readGpuCapabilities(renderer: WebGLRenderer): GpuCapabilities {
  const known = PROBED.get(renderer)
  if (known !== undefined) return known
  const probed = probeContext(renderer.getContext() as WebGL2RenderingContext)
  PROBED.set(renderer, probed)
  return probed
}

function probeContext(gl: WebGL2RenderingContext): GpuCapabilities {
  const extensions = new Set(gl.getSupportedExtensions() ?? [])
  return {
    textureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
    vertexTextureUnits: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
    combinedTextureUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    fragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
    varyingVectors: gl.getParameter(gl.MAX_VARYING_VECTORS),
    isFragmentHighp: isFragmentHighp(gl),
    hasFloatTargets: extensions.has('EXT_color_buffer_float'),
    hasHalfFloatTargets: extensions.has('EXT_color_buffer_half_float'),
    textureFormats: textureFormatsOf(extensions),
  }
}

/** A precision of 0 means the fragment stage has no `highp` float at all. */
function isFragmentHighp(gl: WebGL2RenderingContext): boolean {
  const format = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)
  return format !== null && format.precision > 0
}

function textureFormatsOf(extensions: ReadonlySet<string>): string[] {
  return TEXTURE_FORMAT_EXTENSIONS.filter(([, names]) =>
    names.some((name) => extensions.has(name)),
  ).map(([format]) => format)
}

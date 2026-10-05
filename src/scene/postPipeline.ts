/**
 * How a frame reaches the canvas (#38 "Post-processing"): the scene renders into a multisampled
 * half-float target at the internal resolution, its bright light is blurred at half that
 * resolution, and one composite pass adds the bloom, applies the tone curve and the vignette and
 * writes the canvas. Four full-screen draws after the scene, within the 6 #38 allows. The ONLY
 * writer of these render targets; `RenderPipeline` drives it once per frame.
 */
import {
  BufferAttribute,
  BufferGeometry,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three'
import { BLOOM_STRENGTH, BLOOM_THRESHOLD, TONE_KNEE, VIGNETTE_STRENGTH } from '../constants/scene'
import {
  BLUR_SHADER,
  BRIGHT_PASS_SHADER,
  COMPOSITE_SHADER,
  FULL_SCREEN_VERTEX_SHADER,
} from './postShaders'

export interface PostPipeline {
  render(renderer: WebGLRenderer, scene: Scene, camera: Camera): void
  dispose(): void
}

interface Passes {
  sceneTarget: WebGLRenderTarget
  bloomA: WebGLRenderTarget
  bloomB: WebGLRenderTarget
  bright: ShaderMaterial
  blur: ShaderMaterial
  composite: ShaderMaterial
  quad: Mesh
  quadCamera: OrthographicCamera
  /** The drawing buffer size, read each frame without allocating. */
  size: Vector2
}

/** Antialiasing the canvas would have done, now done by the scene target. */
const SCENE_SAMPLES = 4

export function createPostPipeline(): PostPipeline {
  const passes = createPasses()
  return {
    render: (renderer, scene, camera) => renderFrame(passes, renderer, scene, camera),
    dispose: () => disposePasses(passes),
  }
}

function renderFrame(passes: Passes, renderer: WebGLRenderer, scene: Scene, camera: Camera) {
  fitTargets(passes, renderer)
  renderScene(passes, renderer, scene, camera)
  extractBrightLight(passes, renderer)
  blurBloom(passes, renderer)
  composite(passes, renderer)
}

function createPasses(): Passes {
  const bloomA = halfFloatTarget(0)
  const bloomB = halfFloatTarget(0)
  const sceneTarget = halfFloatTarget(SCENE_SAMPLES)
  return {
    sceneTarget,
    bloomA,
    bloomB,
    bright: fullScreenMaterial(BRIGHT_PASS_SHADER, {
      uScene: { value: sceneTarget.texture },
      uThreshold: { value: BLOOM_THRESHOLD },
    }),
    blur: fullScreenMaterial(BLUR_SHADER, {
      uSource: { value: null },
      uStep: { value: new Vector2() },
    }),
    composite: fullScreenMaterial(COMPOSITE_SHADER, {
      uScene: { value: sceneTarget.texture },
      uBloom: { value: bloomA.texture },
      uBloomStrength: { value: BLOOM_STRENGTH },
      uKnee: { value: TONE_KNEE },
      uVignette: { value: VIGNETTE_STRENGTH },
    }),
    quad: new Mesh(fullScreenTriangle()),
    quadCamera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
    size: new Vector2(),
  }
}

function halfFloatTarget(samples: number): WebGLRenderTarget {
  return new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: samples > 0,
    samples,
  })
}

function fullScreenMaterial(
  fragmentShader: string,
  uniforms: ShaderMaterial['uniforms'],
): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: FULL_SCREEN_VERTEX_SHADER,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  })
}

/** One triangle covering the screen: cheaper than a quad's two. */
function fullScreenTriangle(): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  )
  return geometry
}

/** The scene target matches the canvas's drawing buffer; the bloom targets are half of it. */
function fitTargets(passes: Passes, renderer: WebGLRenderer): void {
  renderer.getDrawingBufferSize(passes.size)
  const { width, height } = passes.size
  if (passes.sceneTarget.width === width && passes.sceneTarget.height === height) return
  passes.sceneTarget.setSize(width, height)
  const halfWidth = Math.max(1, Math.floor(width / 2))
  const halfHeight = Math.max(1, Math.floor(height / 2))
  passes.bloomA.setSize(halfWidth, halfHeight)
  passes.bloomB.setSize(halfWidth, halfHeight)
}

function renderScene(passes: Passes, renderer: WebGLRenderer, scene: Scene, camera: Camera) {
  renderer.setRenderTarget(passes.sceneTarget)
  renderer.render(scene, camera)
}

function extractBrightLight(passes: Passes, renderer: WebGLRenderer): void {
  drawFullScreen(passes, renderer, passes.bright, passes.bloomA)
}

/** Across into B, then down back into A, where the composite reads it. */
function blurBloom(passes: Passes, renderer: WebGLRenderer): void {
  const { blur, bloomA, bloomB } = passes
  blur.uniforms.uSource.value = bloomA.texture
  blur.uniforms.uStep.value.set(1 / bloomA.width, 0)
  drawFullScreen(passes, renderer, blur, bloomB)
  blur.uniforms.uSource.value = bloomB.texture
  blur.uniforms.uStep.value.set(0, 1 / bloomB.height)
  drawFullScreen(passes, renderer, blur, bloomA)
}

function composite(passes: Passes, renderer: WebGLRenderer): void {
  drawFullScreen(passes, renderer, passes.composite, null)
}

function drawFullScreen(
  passes: Passes,
  renderer: WebGLRenderer,
  material: ShaderMaterial,
  target: WebGLRenderTarget | null,
): void {
  passes.quad.material = material
  renderer.setRenderTarget(target)
  renderer.render(passes.quad, passes.quadCamera)
}

function disposePasses(passes: Passes): void {
  for (const target of [passes.sceneTarget, passes.bloomA, passes.bloomB]) target.dispose()
  for (const material of [passes.bright, passes.blur, passes.composite]) material.dispose()
  passes.quad.geometry.dispose()
}

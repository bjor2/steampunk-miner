/**
 * #118: every geometry and material a scene component draws with is freed when the component
 * unmounts or re-creates it, so a Canvas remount, HMR or a vehicle look change grows nothing in
 * `renderer.info.memory`. Three frees an object's GPU copy on its `dispose` event, so the spec
 * listens for that event on the objects the mounted scene holds.
 *
 * The components mount in R3F's own reconciler with a stub renderer: no DOM, no canvas, no GL.
 * The atlas maps come from a stub loader, because KTX2 transcoding needs a browser; textures are
 * cached by the loader and shared, so no component owns (or frees) them.
 */
import { act, createRoot, extend, type ReconcilerRoot } from '@react-three/fiber'
import { createElement, type FunctionComponent } from 'react'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readPlanetWorld, resetGameStore } from '../store/gameStore'
import type { AssetQuad, AtlasMaps, AtlasUv } from '../systems/art/assetLook'
import { vehicleAtlasMaps, vehicleBodyQuadsOf } from '../systems/render/vehicleLook'
import { dockSiteOf } from '../systems/world/dockSite'
import { AtlasQuadMesh } from './AtlasQuadMesh'
import { BlastScorches } from './BlastScorches'
import { CementSpray } from './CementSpray'
import { CollapseTelegraph } from './CollapseTelegraph'
import { EnemyFigures } from './EnemyFigures'
import { EnemyPlaceholders } from './EnemyPlaceholders'
import { RefineryBay } from './RefineryBay'
import { SHIPPED_ART } from './shippedArt'
import { Sparks } from './Sparks'

vi.mock('./atlasTextures', () => {
  const textures = new Map<string, THREE.Texture>()
  const textureAt = (url: string) =>
    textures.get(url) ?? textures.set(url, new THREE.Texture()).get(url)!
  const sets = new Map<string, THREE.Texture[]>()
  const setOf = (urls: readonly string[]) =>
    sets.get(urls.join()) ?? sets.set(urls.join(), urls.map(textureAt)).get(urls.join())!
  return {
    useAtlasAlbedo: (maps: AtlasMaps) => textureAt(maps.albedo),
    useAtlasNormal: (maps: AtlasMaps) => textureAt(maps.normal),
    useAtlasEmissive: (maps: AtlasMaps & { emissive: string }) => textureAt(maps.emissive),
    useAtlasTextureSet: setOf,
  }
})

extend(THREE as unknown as Parameters<typeof extend>[0])
// R3F frees what it disposes at once under act, instead of on an idle callback.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

type GpuObject = THREE.BufferGeometry | THREE.Material

let root: ReconcilerRoot<HTMLCanvasElement>
let scene: THREE.Scene

beforeEach(async () => {
  resetGameStore()
  root = createRoot({ style: {}, addEventListener() {}, removeEventListener() {} } as never)
  await act(async () => {
    root.configure({
      gl: createStubRenderer() as never,
      size: { width: 800, height: 600, top: 0, left: 0 },
      frameloop: 'never',
      events: undefined,
    })
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
})

describe('scene disposal', () => {
  it.each([
    ['Sparks', Sparks],
    ['CementSpray', CementSpray],
    ['CollapseTelegraph', CollapseTelegraph],
    ['EnemyPlaceholders', EnemyPlaceholders],
    ['EnemyFigures', EnemyFigures],
    ['BlastScorches', BlastScorches],
  ] as [string, FunctionComponent][])(
    'frees every geometry and material %s draws with when it unmounts',
    async (_name, component) => {
      await mount(createElement(component))
      const drawn = gpuObjectsIn(scene)
      const freed = listenForDisposal(drawn)
      await mount(null)
      expect(drawn.length).toBeGreaterThan(0)
      expect(drawn.filter((object) => !freed.has(object))).toEqual([])
    },
  )

  it('frees the Refinery bay smoke and parts when the bay leaves the platform', async () => {
    const site = dockSiteOf(readPlanetWorld().params!)
    await mount(createElement(RefineryBay, { site, look: 'refining' }))
    const drawn = gpuObjectsIn(scene)
    const freed = listenForDisposal(drawn)
    await mount(null)
    expect(drawn.length).toBeGreaterThan(0)
    expect(drawn.filter((object) => !freed.has(object))).toEqual([])
  })

  it('frees an atlas part quad when a new look re-cuts it, and keeps the one it now draws', async () => {
    const maps = vehicleAtlasMaps(SHIPPED_ART)!
    const [tierOne, tierThree] = [chassisQuadAt(1), chassisQuadAt(3)]
    await mount(createElement(AtlasQuadMesh, { quad: tierOne, maps, baseZ: 0 }))
    const [before] = geometriesIn(scene)
    const freed = listenForDisposal([before])
    await mount(createElement(AtlasQuadMesh, { quad: tierThree, maps, baseZ: 0 }))
    const [after] = geometriesIn(scene)
    const freedAfter = listenForDisposal([after])
    expect(after).not.toBe(before)
    expect(freed.has(before)).toBe(true)
    expect(freedAfter.has(after)).toBe(false)
  })
})

async function mount(element: ReturnType<typeof createElement> | null): Promise<void> {
  await act(async () => {
    scene = root.render(element).getState().scene
  })
}

function gpuObjectsIn(object: THREE.Object3D): GpuObject[] {
  const found = new Set<GpuObject>()
  object.traverse((child) => {
    const drawable = child as Partial<THREE.Mesh>
    if (drawable.geometry) found.add(drawable.geometry)
    for (const material of [drawable.material ?? []].flat()) found.add(material)
  })
  return [...found]
}

function geometriesIn(object: THREE.Object3D): THREE.BufferGeometry[] {
  return gpuObjectsIn(object).filter(
    (found): found is THREE.BufferGeometry => 'attributes' in found,
  )
}

function listenForDisposal(objects: readonly GpuObject[]): Set<GpuObject> {
  const freed = new Set<GpuObject>()
  for (const object of objects) object.addEventListener('dispose', () => freed.add(object))
  return freed
}

function chassisQuadAt(visualTier: number): AssetQuad & { uv: AtlasUv } {
  const quad = vehicleBodyQuadsOf(SHIPPED_ART, visualTier).find((part) =>
    part.partId.endsWith('-chassis'),
  )
  if (quad === undefined || quad.uv === null)
    throw new Error(`no atlas chassis at tier ${visualTier}`)
  return quad as AssetQuad & { uv: AtlasUv }
}

/** Just enough of a WebGLRenderer for R3F to mount and unmount a tree that is never drawn. */
function createStubRenderer() {
  return {
    render() {},
    setSize() {},
    setPixelRatio() {},
    dispose() {},
    forceContextLoss() {},
    domElement: {},
    xr: {
      enabled: false,
      isPresenting: false,
      addEventListener() {},
      removeEventListener() {},
      setAnimationLoop() {},
    },
    shadowMap: {},
    info: { render: {}, memory: {} },
  }
}

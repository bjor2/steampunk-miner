import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CompressedTexture, RGBA_S3TC_DXT5_Format, Texture, type ShaderMaterial } from 'three'
import {
  readDrawnKindLooks,
  showEveryKindLook,
  showSeenKindLooksOnly,
} from '../debug/debugKindLooks'
import { resetGameStore } from '../store/gameStore'
import { kindLookProvider } from '../systems/registries/kindLook'
import type { DrawnHeroAtlas, HeroAtlasCells } from '../systems/render/heroAtlas'
import { freshPlanetParamsFor } from '../systems/world/planetParams'
import { heroAtlasPresence } from './heroAtlasPresence'
import { fitKindLooksToViewer } from './terrainKindLooks'
import { createTerrainMaterial } from './terrainMaterial'
import { bindHeroAtlas, releaseHeroAtlas } from './terrainHeroAtlas'

// The hero atlas's one writer (ticket 451): one atlas bound at a time, released before the next,
// an atlas the GPU would hold as RGBA8 refused, and the look table drawing a hero from its cell
// only while its atlas is bound, seen or not (ticket 698).

const SEED = 83921

/** Planet 1's atlas as the registered provider names it. */
function planetOneAtlas(): HeroAtlasCells {
  const atlas = kindLookProvider()?.heroAtlasOf(1)
  if (atlas === undefined || atlas === null) throw new Error('planet 1 has no hero atlas')
  return atlas
}

function compressedAtlas(): CompressedTexture {
  return new CompressedTexture([], 1024, 1024, RGBA_S3TC_DXT5_Format)
}

function isDisposed(texture: Texture): () => boolean {
  let disposed = false
  texture.addEventListener('dispose', () => (disposed = true))
  return () => disposed
}

function drawnHeroCells(): (number | null)[] {
  const read = readDrawnKindLooks()
  return read.ok ? read.looks.shown.map((look) => look.heroCell) : []
}

describe('terrain hero atlas (ticket 451)', () => {
  let material: ShaderMaterial
  let planetOne: HeroAtlasCells
  let drawn: DrawnHeroAtlas
  beforeEach(() => {
    resetGameStore()
    material = createTerrainMaterial('full', 'sampled')
    planetOne = planetOneAtlas()
    drawn = {
      id: planetOne.id,
      albedo: 'assets/ground/fixture.albedo.ktx2',
      cells: planetOne.cells,
    }
  })
  afterEach(() => {
    showSeenKindLooksOnly()
    const bound = material.uniforms.uHeroAtlas.value as Texture | null
    if (bound !== null) releaseHeroAtlas(material, bound)
  })

  it('binds a compressed atlas and names its act and cells as resident', () => {
    const before = heroAtlasPresence.binds
    const atlas = compressedAtlas()
    bindHeroAtlas(material, atlas, drawn)
    expect(material.uniforms.uHeroAtlas.value).toBe(atlas)
    expect(heroAtlasPresence.residentId).toBe(planetOne.id)
    expect(heroAtlasPresence.cells).toBe(planetOne.cells)
    expect(heroAtlasPresence.binds).toBe(before + 1)
  })

  it('unbinds and disposes the old atlas on release, so none is resident before the next', () => {
    const atlas = compressedAtlas()
    const wasDisposed = isDisposed(atlas)
    bindHeroAtlas(material, atlas, drawn)
    releaseHeroAtlas(material, atlas)
    expect(material.uniforms.uHeroAtlas.value).toBe(null)
    expect(heroAtlasPresence.residentId).toBe(null)
    expect(heroAtlasPresence.cells).toEqual([])
    expect(wasDisposed()).toBe(true)
  })

  it('refuses and disposes an atlas the loader decoded to RGBA8, so heroes keep the shader look', () => {
    const decoded = new Texture()
    const wasDisposed = isDisposed(decoded)
    bindHeroAtlas(material, decoded, drawn)
    expect(material.uniforms.uHeroAtlas.value).toBe(null)
    expect(heroAtlasPresence.refusedId).toBe(planetOne.id)
    expect(wasDisposed()).toBe(true)
  })

  it('draws a seen hero from its cell while the atlas is bound, and its grains once released', () => {
    const params = freshPlanetParamsFor(SEED, 1)
    showEveryKindLook()
    fitKindLooksToViewer(material, params)
    expect(drawnHeroCells().filter((cell) => cell !== null)).toEqual([])

    const atlas = compressedAtlas()
    bindHeroAtlas(material, atlas, drawn)
    fitKindLooksToViewer(material, params)
    const cells = drawnHeroCells().filter((cell): cell is number => cell !== null)
    expect(cells.length).toBeGreaterThan(0)
    expect(cells.every((cell) => cell < planetOne.cells.length)).toBe(true)

    releaseHeroAtlas(material, atlas)
    fitKindLooksToViewer(material, params)
    expect(drawnHeroCells().filter((cell) => cell !== null)).toEqual([])
  })

  it('draws a hero the player has not seen from its sprite, with no rarity on it (ticket 698)', () => {
    bindHeroAtlas(material, compressedAtlas(), drawn)
    fitKindLooksToViewer(material, freshPlanetParamsFor(SEED, 1))
    const read = readDrawnKindLooks()
    const heroes = read.ok ? read.looks.shown.filter((look) => look.heroCell !== null) : []
    expect(heroes.length).toBeGreaterThan(0)
    expect(new Set(heroes.map((look) => look.rarityLead))).toEqual(new Set([0]))
  })
})

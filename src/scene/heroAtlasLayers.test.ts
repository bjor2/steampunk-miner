import { describe, expect, it } from 'vitest'
import {
  CompressedTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBA_BPTC_Format,
  RGBA_S3TC_DXT5_Format,
  SRGBColorSpace,
  Texture,
  type CompressedPixelFormat,
  type CompressedTextureMipmap,
} from 'three'
import { heroAtlasLayersOf } from './heroAtlasLayers'

// Ticket 852's pages as one array texture: each page's transcoded levels stacked as layers, so a
// layer's bytes are its page's bytes unchanged and page 1 samples exactly as the single atlas did.

const SIDE = 8
const LEVEL_SIDES = [SIDE, SIDE / 2]

/** A transcoded page whose every byte is `fill`, at each level, as the KTX2 loader hands it out. */
function pageOf(
  fill: number,
  format: CompressedPixelFormat = RGBA_S3TC_DXT5_Format,
): CompressedTexture {
  const mipmaps: CompressedTextureMipmap[] = LEVEL_SIDES.map((side) => ({
    width: side,
    height: side,
    data: new Uint8Array(side * side).fill(fill),
  }))
  const page = new CompressedTexture(mipmaps, SIDE, SIDE, format)
  page.colorSpace = SRGBColorSpace
  page.minFilter = LinearMipmapLinearFilter
  page.magFilter = LinearFilter
  page.generateMipmaps = false
  return page
}

/** Layer `layer`'s bytes of level `level`. */
function layerBytesOf(data: ArrayBufferView, level: number, layer: number): number[] {
  const size = LEVEL_SIDES[level] * LEVEL_SIDES[level]
  return [...new Uint8Array(data.buffer, data.byteOffset + layer * size, size)]
}

describe('hero atlas layers (ticket 852)', () => {
  it('stacks one layer per page, page 1 first, with every level of each page unchanged', () => {
    const layers = heroAtlasLayersOf([pageOf(1), pageOf(2)])
    expect(layers?.image.depth).toBe(2)
    expect(layers?.mipmaps).toHaveLength(LEVEL_SIDES.length)
    layers?.mipmaps?.forEach((level, at) => {
      const size = LEVEL_SIDES[at] * LEVEL_SIDES[at]
      expect(layerBytesOf(level.data, at, 0)).toEqual(Array(size).fill(1))
      expect(layerBytesOf(level.data, at, 1)).toEqual(Array(size).fill(2))
    })
  })

  it("samples page 1 as its page alone: one layer of the page's bytes, format and filtering", () => {
    const page = pageOf(7)
    const layers = heroAtlasLayersOf([page])
    expect(layers?.image.depth).toBe(1)
    expect(layers?.mipmaps?.map((level) => [...(level.data as Uint8Array)])).toEqual(
      page.mipmaps?.map((level) => [...(level.data as Uint8Array)]),
    )
    expect(layers?.format).toBe(page.format)
    expect(layers?.colorSpace).toBe(page.colorSpace)
    expect(layers?.minFilter).toBe(page.minFilter)
    expect(layers?.magFilter).toBe(page.magFilter)
    expect(layers?.generateMipmaps).toBe(false)
  })

  it('gives no layers for a page decoded to RGBA8 or pages that differ in format', () => {
    expect(heroAtlasLayersOf([pageOf(1), new Texture()])).toBe(null)
    expect(heroAtlasLayersOf([pageOf(1), pageOf(2, RGBA_BPTC_Format)])).toBe(null)
    expect(heroAtlasLayersOf([])).toBe(null)
  })
})

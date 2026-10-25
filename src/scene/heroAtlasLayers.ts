/**
 * The act's hero atlas pages as one array texture (ticket 852): each page ships as its own KTX2,
 * so the maps of pages already shipped never change, and the transcoded pages are stacked level by
 * level into the layers of one `CompressedArrayTexture`, bound on the atlas's one unit. A block-
 * compressed level is its blocks in rows, so a layer's bytes are its page's level bytes unchanged
 * and page 1 samples exactly as the single atlas did. Pages that are not all compressed alike (an
 * RGBA8 decode, another format or size) give no layers, and every hero keeps the shader look.
 */
import {
  CompressedArrayTexture,
  type CompressedTexture,
  type CompressedTextureMipmap,
  type Texture,
} from 'three'

/** The pages stacked as layers, page 1 first; null where they cannot be. */
export function heroAtlasLayersOf(pages: readonly Texture[]): CompressedArrayTexture | null {
  const [first] = pages
  if (first === undefined || !pages.every((page) => isStackableWith(first, page))) return null
  return layersOf(pages as readonly CompressedTexture[])
}

function layersOf(pages: readonly CompressedTexture[]): CompressedArrayTexture {
  const [first] = pages
  const mipmaps = levelsOf(first).map((level, at) => ({
    width: level.width,
    height: level.height,
    data: joinedBytesOf(pages.map((page) => levelsOf(page)[at].data)),
  }))
  const { width, height } = first.image
  const layers = new CompressedArrayTexture(
    mipmaps,
    width,
    height,
    pages.length,
    first.format,
    first.type,
  )
  copySamplingOf(first, layers)
  layers.needsUpdate = true
  return layers
}

/** The loader's sampling choices, so a layer filters exactly as its page alone would. */
function copySamplingOf(page: CompressedTexture, layers: CompressedArrayTexture): void {
  layers.colorSpace = page.colorSpace
  layers.minFilter = page.minFilter
  layers.magFilter = page.magFilter
  layers.wrapS = page.wrapS
  layers.wrapT = page.wrapT
  layers.anisotropy = page.anisotropy
  layers.generateMipmaps = false
}

function isStackableWith(first: Texture, page: Texture): boolean {
  return isCompressed(first) && isCompressed(page) && isSameShape(first, page)
}

function isSameShape(first: CompressedTexture, page: CompressedTexture): boolean {
  return (
    page.format === first.format &&
    page.image.width === first.image.width &&
    page.image.height === first.image.height &&
    levelsOf(page).length === levelsOf(first).length
  )
}

function levelsOf(page: CompressedTexture): CompressedTextureMipmap[] {
  return page.mipmaps ?? []
}

function joinedBytesOf(levels: readonly ArrayBufferView[]): Uint8Array {
  const joined = new Uint8Array(levels.reduce((total, level) => total + level.byteLength, 0))
  let offset = 0
  for (const level of levels) {
    joined.set(new Uint8Array(level.buffer, level.byteOffset, level.byteLength), offset)
    offset += level.byteLength
  }
  return joined
}

/** three's `CompressedTexture`; the loader decodes to a plain RGBA texture when it has no target. */
export function isCompressed(texture: Texture): texture is CompressedTexture {
  return (texture as Texture & { isCompressedTexture?: boolean }).isCompressedTexture === true
}

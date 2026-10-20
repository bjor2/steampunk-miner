import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MINERAL_SKINS } from './systems/skinTable'

// The drawn layers of the mineral skins (#576, ticket 592 on): every base, vein and sheen layer
// the table lists has its Blender source and its 256 px cell under docs/art/mineral-skins, the
// cell in the form the compositing rule reads (README there): grey for a base or a sheen, grey
// with the mask in alpha for a vein. Palettes are data and draw nothing.

const ART = new URL('../../../docs/art/mineral-skins/', import.meta.url)
const CELL_PX = 256
/** PNG colour types: 0 grey, 4 grey with alpha. */
const COLOUR_TYPE = { base: 0, vein: 4, sheen: 0 } as const
const DRAWN_KINDS = ['base', 'vein', 'sheen'] as const

interface DrawnLayer {
  kind: (typeof DRAWN_KINDS)[number]
  id: string
  cell: string
  blend: string
}

const CELL_TABLE = JSON.parse(readFileSync(new URL('skin-layers.json', ART), 'utf8')) as {
  layers: DrawnLayer[]
}

/** Width, height and colour type from a PNG's IHDR chunk. */
function pngHeaderOf(path: string) {
  const bytes = readFileSync(new URL(path, ART))
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colourType: bytes[25] }
}

describe('mineral skin layer art', () => {
  it('draws exactly the base, vein and sheen layers the table lists', () => {
    const drawn = CELL_TABLE.layers.map((layer) => `${layer.kind}/${layer.id}`).sort()
    const listed = DRAWN_KINDS.flatMap((kind) =>
      MINERAL_SKINS.layers[kind].map((id) => `${kind}/${id}`),
    )
    expect(drawn).toEqual(listed.sort())
  })

  it.each(CELL_TABLE.layers)('keeps the source of the $kind $id', (layer) => {
    expect(existsSync(new URL(layer.blend, ART))).toBe(true)
  })

  it.each(CELL_TABLE.layers)('ships the $kind $id as a 256 px cell in its form', (layer) => {
    expect(pngHeaderOf(layer.cell)).toEqual({
      width: CELL_PX,
      height: CELL_PX,
      colourType: COLOUR_TYPE[layer.kind],
    })
  })
})

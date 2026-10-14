import { describe, expect, it } from 'vitest'
import { CASING_LINING_LOOK, CASING_LINING_PHONE_CELL_PX } from '../../constants/scene'
import { ART_DIRECTION } from './artDirection'
import { bandColourOf, paletteOf } from './bandPalette'
import {
  isLiningReadable,
  liningContrastAt,
  liningShaderDefines,
  liningTexelOf,
} from './casingLiningLook'
import { scaleRgb, type Rgb } from './colour'

const LOOK = CASING_LINING_LOOK
const BANDS = [1, 2, 3, 4, 5]

/** Every band of every planet palette, at its brightest and darkest tile shade. */
function everyRock(): { name: string; rock: Rgb }[] {
  const spread = ART_DIRECTION.tileShadeSpread
  return Object.keys(ART_DIRECTION.palettes).flatMap((paletteId) =>
    BANDS.flatMap((band) => {
      const colour = bandColourOf(paletteOf(paletteId), band)
      return [1 - spread, 1 + spread].map((shade) => ({
        name: `${paletteId} band ${band} shade ${shade}`,
        rock: scaleRgb(colour, shade),
      }))
    }),
  )
}

describe('casing lining look (ticket 315)', () => {
  it('draws brass on the open face and rock past the plate', () => {
    const midRib = 0.5 / LOOK.ribsPerTile
    expect(liningTexelOf({ alongTiles: midRib, depthTiles: 0.05 })).toBe('brass')
    expect(liningTexelOf({ alongTiles: midRib, depthTiles: LOOK.plateDepthTiles + 0.01 })).toBe(
      'rock',
    )
  })

  it('ribs the plate with a groove on every whole rib along the face', () => {
    const grooves = [0, 1, 2, 3].map((rib) =>
      liningTexelOf({ alongTiles: rib / LOOK.ribsPerTile, depthTiles: 0.05 }),
    )
    expect(grooves).toEqual(['groove', 'groove', 'groove', 'groove'])
  })

  it('sets a rivet in the middle of each rib on the rivet line', () => {
    const rivets = [0, 1, 2, 3].map((rib) =>
      liningTexelOf({
        alongTiles: (rib + 0.5) / LOOK.ribsPerTile,
        depthTiles: LOOK.rivetDepthTiles,
      }),
    )
    expect(rivets).toEqual(['rivet', 'rivet', 'rivet', 'rivet'])
  })

  it('closes the plate with a dark seam against the rock behind it', () => {
    const midRib = 0.5 / LOOK.ribsPerTile
    const seam = LOOK.plateDepthTiles - LOOK.seamTiles / 2
    expect(liningTexelOf({ alongTiles: midRib, depthTiles: seam })).toBe('groove')
  })

  it('reads at phone size over every band of every planet', () => {
    const unreadable = everyRock().filter(
      ({ rock }) => !isLiningReadable(liningContrastAt(CASING_LINING_PHONE_CELL_PX, rock)),
    )
    expect(unreadable.map(({ name }) => name)).toEqual([])
  })

  it('holds its contrast when the cell is drawn smaller than phone size', () => {
    const [{ rock }] = everyRock()
    expect(isLiningReadable(liningContrastAt(18, rock))).toBe(true)
  })

  it('gives the shader every length and colour as a GLSL literal', () => {
    const defines = liningShaderDefines()
    expect(defines.LINING_RIBS_PER_TILE).toBe('4.0')
    expect(defines.LINING_BRASS).toMatch(/^vec3\([\d.]+, [\d.]+, [\d.]+\)$/)
    expect(Object.values(defines).every((value) => /\d\.\d/.test(value))).toBe(true)
  })
})

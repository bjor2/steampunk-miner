import { describe, expect, it } from 'vitest'
import {
  CASING_GRADE_MARKS,
  CASING_LINING_LOOK,
  CASING_LINING_PHONE_CELL_PX,
} from '../../constants/scene'
import { ART_DIRECTION, type BandPalette } from './artDirection'
import { freshPlanetParamsFor } from '../world/planetParams'
import { bandColourOf, paletteOf, shownPaletteOf } from './bandPalette'
import { CASING_GRADE_LOOKS, firstGradeWithFullPips } from './casingGradeLook'
import {
  cropDifferenceOf,
  doCropsMatch,
  isLiningReadable,
  liningContrastAt,
  liningCropAt,
} from './casingLiningCrop'
import {
  liningLookOf,
  liningShaderDefines,
  liningTexelOf,
  standardLiningLook,
  type LiningLook,
} from './casingLiningLook'
import { scaleRgb, type Rgb } from './colour'

const LOOK = CASING_LINING_LOOK
const MARKS = CASING_GRADE_MARKS
const BANDS = [1, 2, 3, 4, 5]
const PHONE = CASING_LINING_PHONE_CELL_PX
const PLATES = CASING_GRADE_LOOKS.plates.length
const LAP = PLATES * CASING_GRADE_LOOKS.finishes.length

/** Planets 1 to 10, whose registry rows may give their own rock (ticket 653). */
const ROW_PLANETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/**
 * Every band of every planet palette, and of every planet's shown palette with its row look, at
 * its brightest and darkest tile shade.
 */
function everyRock(): { name: string; rock: Rgb }[] {
  const palettes = [
    ...Object.keys(ART_DIRECTION.palettes).map((id) => ({ name: id, palette: paletteOf(id) })),
    ...ROW_PLANETS.map((planet) => ({
      name: `planet ${planet}`,
      palette: shownPaletteOf(freshPlanetParamsFor(83921, planet)),
    })),
  ]
  return palettes.flatMap(({ name, palette }) => shadedBandsOf(name, palette))
}

function shadedBandsOf(name: string, palette: BandPalette): { name: string; rock: Rgb }[] {
  const spread = ART_DIRECTION.tileShadeSpread
  return BANDS.flatMap((band) => {
    const colour = bandColourOf(palette, band)
    return [1 - spread, 1 + spread].map((shade) => ({
      name: `${name} band ${band} shade ${shade}`,
      rock: scaleRgb(colour, shade),
    }))
  })
}

/** Band 1's light rock and band 5's dark rock of planet 1: the two ends the plates meet. */
function endRocks(): Rgb[] {
  const palette = paletteOf('palette.planet_1')
  return [bandColourOf(palette, 1), bandColourOf(palette, 5)]
}

const standard = (grade: number): LiningLook => liningLookOf(grade, 'standard')
const midRib = 0.5 / LOOK.ribsPerTile

describe('casing lining look (ticket 315)', () => {
  it('draws the plate on the open face and rock past it', () => {
    const look = standardLiningLook()
    expect(liningTexelOf({ alongTiles: midRib, depthTiles: 0.05 }, look)).toBe('plate')
    expect(
      liningTexelOf({ alongTiles: midRib, depthTiles: LOOK.plateDepthTiles + 0.01 }, look),
    ).toBe('rock')
  })

  it('ribs the brass with a groove on every whole rib along the face', () => {
    const grooves = [0, 1, 2, 3].map((rib) =>
      liningTexelOf({ alongTiles: rib / LOOK.ribsPerTile, depthTiles: 0.05 }, standardLiningLook()),
    )
    expect(grooves).toEqual(['groove', 'groove', 'groove', 'groove'])
  })

  it('sets a rivet in the middle of each rib on the rivet line', () => {
    const rivets = [0, 1, 2, 3].map((rib) =>
      liningTexelOf(
        { alongTiles: (rib + 0.5) / LOOK.ribsPerTile, depthTiles: LOOK.rivetDepthTiles },
        standardLiningLook(),
      ),
    )
    expect(rivets).toEqual(['rivet', 'rivet', 'rivet', 'rivet'])
  })

  it('closes the standard lining with its cement seam against the rock behind it', () => {
    const seam = LOOK.plateDepthTiles - CASING_GRADE_LOOKS.trims.standard.widthTiles / 2
    expect(liningTexelOf({ alongTiles: midRib, depthTiles: seam }, standardLiningLook())).toBe(
      'trim',
    )
  })

  it('reads at phone size over every band of every planet', () => {
    const unreadable = everyRock().filter(
      ({ rock }) => !isLiningReadable(liningContrastAt(PHONE, rock)),
    )
    expect(unreadable.map(({ name }) => name)).toEqual([])
  })

  it('holds its contrast when the cell is drawn smaller than phone size', () => {
    const [{ rock }] = everyRock()
    expect(isLiningReadable(liningContrastAt(18, rock))).toBe(true)
  })
})

describe('casing grade looks in the ground (ticket 830)', () => {
  it('works each plate in its own rivet pattern', () => {
    const at = (grade: number, alongTiles: number, depthTiles: number) =>
      liningTexelOf({ alongTiles, depthTiles }, standard(grade))
    // Copper: rivets on two rows at the rib centre.
    expect(at(2, midRib, MARKS.pairRowsTiles[0])).toBe('rivet')
    expect(at(2, midRib, MARKS.pairRowsTiles[1])).toBe('rivet')
    expect(at(2, midRib, LOOK.rivetDepthTiles)).toBe('plate')
    expect(at(2, 1 / LOOK.ribsPerTile, 0.05)).toBe('plate')
    expect(at(2, 2 / LOOK.ribsPerTile, 0.05)).toBe('groove')
    // Iron: a dark strap with a square bolt at the rib centre and no grooves on the ribs.
    expect(at(3, 0.02, 0.05)).toBe('plate')
    expect(at(3, 0, 0.05)).toBe('plate')
    expect(at(3, midRib, (MARKS.strapTiles[0] + MARKS.strapTiles[1]) / 2)).toBe('rivet')
    expect(at(3, 0, (MARKS.strapTiles[0] + MARKS.strapTiles[1]) / 2)).toBe('groove')
    // Steel: a lattice, grooves on both diagonals and no rivets.
    expect(at(4, 0.125, 0.125)).toBe('groove')
    expect(at(4, 0.0625, 0.125)).toBe('plate')
    expect(at(4, midRib, LOOK.rivetDepthTiles)).toBe('plate')
    // Verdigris: the rivets zigzag between the two rows, one row per rib.
    expect(at(5, midRib, MARKS.pairRowsTiles[0])).toBe('rivet')
    expect(at(5, midRib + 1 / LOOK.ribsPerTile, MARKS.pairRowsTiles[1])).toBe('rivet')
    expect(at(5, midRib + 1 / LOOK.ribsPerTile, MARKS.pairRowsTiles[0])).toBe('plate')
  })

  it('lights a lip on a burnished finish and cuts a chased band on a chased one', () => {
    const burnished = standard(1 + PLATES)
    const chased = standard(1 + 2 * PLATES)
    expect(burnished.grade.finish.id).toBe('burnished')
    expect(liningTexelOf({ alongTiles: midRib, depthTiles: 0.01 }, burnished)).toBe('lip')
    expect(liningTexelOf({ alongTiles: midRib, depthTiles: 0.01 }, chased)).toBe('plate')
    const band = (MARKS.chasedTiles[0] + MARKS.chasedTiles[1]) / 2
    expect(liningTexelOf({ alongTiles: midRib, depthTiles: band }, chased)).toBe('chased')
    expect(liningTexelOf({ alongTiles: midRib, depthTiles: band }, burnished)).toBe('plate')
  })

  it('dots the seam with one pip per lap of the finish cycle, up to the most', () => {
    const { most, depthTiles } = CASING_GRADE_LOOKS.pips
    const pipAt = (grade: number, pip: number) =>
      liningTexelOf({ alongTiles: (pip + 1) / (most + 1), depthTiles }, standard(grade))
    expect(pipAt(1, 0)).toBe('trim')
    expect(pipAt(1 + LAP, 0)).toBe('pip')
    expect(pipAt(1 + LAP, 1)).toBe('trim')
    expect(pipAt(firstGradeWithFullPips(), most - 1)).toBe('pip')
  })

  it('layers the lining type trim over the seam, so a ring shows both axes', () => {
    const refractory = liningLookOf(3, 'refractory')
    const seam = LOOK.plateDepthTiles - refractory.trim.widthTiles / 2
    expect(refractory.grade.plate.id).toBe('iron')
    expect(liningTexelOf({ alongTiles: midRib, depthTiles: seam }, refractory)).toBe('trim')
    expect(liningTexelOf({ alongTiles: 0.5, depthTiles: seam }, refractory)).toBe('joint')
    expect(liningTexelOf({ alongTiles: midRib, depthTiles: 0.05 }, refractory)).toBe(
      liningTexelOf({ alongTiles: midRib, depthTiles: 0.05 }, standard(3)),
    )
  })

  it('reads every plate at phone size over every band of every planet', () => {
    const unreadable = everyRock().flatMap(({ name, rock }) =>
      CASING_GRADE_LOOKS.plates.flatMap((plate, slot) =>
        isLiningReadable(liningContrastAt(PHONE, rock, standard(slot + 1)))
          ? []
          : [`${plate.id} over ${name}`],
      ),
    )
    expect(unreadable).toEqual([])
  })

  it('reads every finish of every plate over the lightest and darkest rock', () => {
    const unreadable = endRocks().flatMap((rock) =>
      Array.from({ length: LAP }, (_, at) => at + 1).filter(
        (grade) => !isLiningReadable(liningContrastAt(PHONE, rock, standard(grade))),
      ),
    )
    expect(unreadable).toEqual([])
  })

  it('fails the 24 px crop diff for no pair of neighbouring grades, in grey, over light or dark rock', () => {
    const last = firstGradeWithFullPips() + LAP
    const matching = endRocks().flatMap((rock) => {
      let crop = liningCropAt(PHONE, rock, standard(1))
      const pairs: string[] = []
      for (let grade = 1; grade < last; grade++) {
        const next = liningCropAt(PHONE, rock, standard(grade + 1))
        if (doCropsMatch(cropDifferenceOf(crop, next))) pairs.push(`${grade}-${grade + 1}`)
        crop = next
      }
      return pairs
    })
    expect(matching).toEqual([])
  })

  it('tells a refractory ring from a standard one of the same grade at 24 px', () => {
    const [rock] = endRocks()
    const difference = cropDifferenceOf(
      liningCropAt(PHONE, rock, standard(2)),
      liningCropAt(PHONE, rock, liningLookOf(2, 'refractory')),
    )
    expect(doCropsMatch(difference)).toBe(false)
  })

  it('calls a crop its own match and refuses crops of two sizes', () => {
    const [rock] = endRocks()
    const crop = liningCropAt(PHONE, rock, standard(1))
    expect(doCropsMatch(cropDifferenceOf(crop, crop))).toBe(true)
    expect(() => cropDifferenceOf(crop, liningCropAt(12, rock, standard(1)))).toThrow(RangeError)
  })

  it('gives the shader every slot, length and colour as a GLSL literal', () => {
    const defines = liningShaderDefines()
    expect(defines.LINING_RIBS_PER_TILE).toBe('4.0')
    expect(defines.CASING_PLATE_0_COLOUR).toMatch(/^vec3\([\d.]+, [\d.]+, [\d.]+\)$/)
    expect(defines.CASING_PLATE_4_PATTERN).toBe('4')
    expect(defines.CASING_FINISH_1_LIP).toBe('1')
    expect(defines.CASING_FINISH_3_LIP).toBe(defines.CASING_FINISH_0_LIP)
    expect(defines.CASING_TRIM_1_STYLE).toBe('1')
    expect(defines.CASING_TRIM_3_STYLE).toBe('0')
    const floats = Object.entries(defines).filter(
      ([name]) => !/PATTERN|STYLE|_LIP|_CHASED|_OWN_/.test(name),
    )
    expect(floats.every(([, value]) => /\d\.\d/.test(value))).toBe(true)
  })
})

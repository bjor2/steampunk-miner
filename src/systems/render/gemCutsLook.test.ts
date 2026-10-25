import { describe, expect, it } from 'vitest'
import { HERO_ATLAS_CELLS } from '../../constants/scene'
import {
  gemCutsLookOf,
  gemCutsLookOfVector,
  gemCutsVectorOf,
  NO_GEM_CUTS_LOOK,
  NO_HUE_TINTED_CELL,
} from './gemCutsLook'
import { gemOverlayOf } from './gemOverlays'
import { HERO_LOOK_CELL_SPAN } from './kindLookTable'
import { patternCodeOf } from './kindLooks'

// Ticket 889: the one vector the shader reads for the gem cuts, written with the look table.

describe('gem cuts look (ticket 889)', () => {
  it('packs where the hue-tinted pages begin with the overlay pattern code and strength, and reads it back', () => {
    const silk = gemOverlayOf('silk')
    const look = gemCutsLookOf(2 * HERO_ATLAS_CELLS, silk)
    expect(gemCutsVectorOf(look)).toEqual([
      2 * HERO_ATLAS_CELLS,
      patternCodeOf('silky'),
      silk?.strength,
      0,
    ])
    expect(gemCutsLookOfVector(gemCutsVectorOf(look))).toEqual(look)
  })

  it('puts the first tinted cell past every cell the table numbers when no tinted page is resident', () => {
    expect(gemCutsVectorOf(NO_GEM_CUTS_LOOK)).toEqual([NO_HUE_TINTED_CELL, 0, 0, 0])
    expect(NO_HUE_TINTED_CELL).toBeGreaterThanOrEqual(HERO_LOOK_CELL_SPAN - 1)
    expect(gemCutsLookOfVector(gemCutsVectorOf(gemCutsLookOf(null, null)))).toEqual(
      NO_GEM_CUTS_LOOK,
    )
  })
})

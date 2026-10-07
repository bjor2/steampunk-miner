import { describe, expect, it } from 'vitest'
import { BLASTING_CHARGES_ROW_ID, kernelBlenderAssetIds, vectorIconIds } from './artIds'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'

// The blasting_charges art (#109 "Visibility", #110): the kernel keeps the row's icon; the rack and
// the planted charges are the dynamite-visuals slice's Blender assets since #215.
describe('blasting charges art', () => {
  it('names the blasting charges icon from its locked schedule row (#110)', () => {
    expect(LOCKED_SCHEDULE.rows.map((row) => row.id)).toContain(BLASTING_CHARGES_ROW_ID)
    expect(vectorIconIds()).toContain('icon-blasting-charges')
  })

  it('no longer names the shipped rack and planted charge the slice replaced (#215)', () => {
    expect(kernelBlenderAssetIds()).not.toContain('vehicle-blasting-charges')
    expect(kernelBlenderAssetIds()).not.toContain('prop-blasting-charge')
  })
})

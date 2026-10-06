import { describe, expect, it } from 'vitest'
import { BLASTING_CHARGES_ROW_ID, blenderAssetIds, vectorIconIds } from './artIds'
import { sidecarProblems } from './partsSidecar'
import { vehicleSidecar, WHEEL_PART as wheel } from './sidecarFixtures'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'

// The blasting_charges art (#109 "Visibility", #110): the charge rack, the planted charge, its icon.
describe('blasting charges art', () => {
  it('names the blasting charges art from its locked schedule row (#110)', () => {
    expect(LOCKED_SCHEDULE.rows.map((row) => row.id)).toContain(BLASTING_CHARGES_ROW_ID)
    expect(blenderAssetIds()).toEqual(
      expect.arrayContaining(['vehicle-blasting-charges', 'prop-blasting-charge']),
    )
    expect(vectorIconIds()).toContain('icon-blasting-charges')
  })

  it('takes the charge rack frame and one charge per rack slot, and the planted charge lamp', () => {
    const rack = {
      ...vehicleSidecar([
        { ...wheel, id: 'charge-rack' },
        { ...wheel, id: 'charge-1' },
        { ...wheel, id: 'charge-8' },
      ]),
      assetId: 'vehicle-blasting-charges',
      maps: {
        albedo: 'vehicle-blasting-charges.albedo.ktx2',
        normal: 'vehicle-blasting-charges.normal.ktx2',
        emissive: false as const,
      },
    }
    expect(sidecarProblems('vehicle-blasting-charges', rack)).toEqual([])
    expect(
      sidecarProblems('vehicle-blasting-charges', {
        ...rack,
        parts: [{ ...wheel, id: 'charge-9' }],
      }),
    ).toEqual(['vehicle-blasting-charges.parts.json: part "charge-9" is not a valid part id'])
    const charge = {
      ...rack,
      assetId: 'prop-blasting-charge',
      parts: [
        { ...wheel, id: 'prop-blasting-charge' },
        { ...wheel, id: 'fuse-lamp' },
      ],
      maps: {
        albedo: 'prop-blasting-charge.albedo.ktx2',
        normal: 'prop-blasting-charge.normal.ktx2',
        emissive: 'prop-blasting-charge.emissive.ktx2',
      },
    }
    expect(sidecarProblems('prop-blasting-charge', charge)).toEqual([])
  })
})

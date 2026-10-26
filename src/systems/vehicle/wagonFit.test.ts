import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { attachPointOf, type PartsSidecar } from '../art/partsSidecar'
import { bodyWidthMmAt } from './drillBore'
import { everyAim, isWagonInBore, wagonSideMmAt } from './wagonFit'

// The wagon fit check (ticket 750, the Horizontal Scaler's condition on #662 Part B): a wagon reads
// the rig's one width and trails it down the bore it cut, hung at the shipped vehicle's wagon
// hitch, and fits that bore, its side clearance kept, along every aim at every width level.

const VEHICLE_PARTS = new URL(
  '../../../public/assets/vehicle/vehicle/vehicle.parts.json',
  import.meta.url,
)
const WIDTH_LEVELS = [0, 1, 2, 3, 10, 1_000_000]

function shippedHitch(): readonly [number, number] {
  const sidecar = JSON.parse(readFileSync(VEHICLE_PARTS, 'utf8')) as PartsSidecar
  const hitch = attachPointOf(sidecar, 'hull.hitch')
  if (hitch === null) throw new Error('the vehicle sidecar has no wagon hitch')
  return [hitch.atM[0], hitch.atM[1]]
}

describe('wagon fit', () => {
  it('sizes a wagon from the rig’s one width', () => {
    for (const level of WIDTH_LEVELS) expect(wagonSideMmAt(level)).toBe(bodyWidthMmAt(level))
  })

  it('fits the shipped hitch and its wagon in the rig’s bore along every aim at every width level', () => {
    const hitch = shippedHitch()
    for (const level of WIDTH_LEVELS) {
      for (const aim of everyAim()) expect(isWagonInBore(hitch, aim, level)).toBe(true)
    }
  })

  it('refuses a hitch hung outside the bore', () => {
    expect(isWagonInBore([0, -0.9], 0, 0)).toBe(false)
    expect(isWagonInBore([-0.7, -0.3], 48, 0)).toBe(false)
  })
})

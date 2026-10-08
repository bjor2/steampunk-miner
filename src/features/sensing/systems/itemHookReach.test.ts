import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../../../systems/economy/economy'
import { tilesWithin as kernelTilesWithin } from '../../../systems/world/tileDisc'
import { echoRadiusTiles } from './revealReach'
import { tilesWithin } from './tileDisc'

// The kernel's item hook reach and its sensing reads (ticket 323, TD ruling on #206 VS pin 3) are
// the echo sounder's: a hook's reach is capped at its radius, and the cluster read walks its disc.

describe('echo sounder reach and the item hooks', () => {
  it('caps every item hook reach at the echo sounder radius', () => {
    expect(ECONOMY.itemHookCaps.reachCellsMax).toBe(echoRadiusTiles())
  })

  it('lists the same disc of tiles, in the same order, as the kernel sensing queries', () => {
    const centre = { tx: 7, ty: -40 }
    const radius = echoRadiusTiles()
    expect(kernelTilesWithin(centre, radius)).toEqual(tilesWithin(centre, radius))
  })
})

import { describe, expect, it } from 'vitest'
import { NO_DRIVE } from '../../../systems/vehicle/driveSigns'
import { facedSideOf, sideSeedOf, type SideLatch } from '../../../systems/vehicle/facedSide'
import { FACING, type Facing, type VehiclePose } from '../../../systems/vehicle/vehiclePose'
import type { PowerUpUse } from '../../power-up-core'
import { toolVerbOf } from './toolVerb'

// A terrain tool's one-sided verb reads the kernel's one faced side (the TD lock on #276): the side
// cutters' latch when the drill left one, else the facing the use started on.

const HOLD: PowerUpUse = {
  playerId: 'p1',
  itemId: 'power.ore_shifter',
  slot: 'powerup.1',
  tick: 10,
  origin: { tx: 30, ty: 280 },
  mark: 6,
  magnitude: 4,
  milestone: 'hold',
}

function poseFacing(facing: Facing): VehiclePose {
  return { x: 30500, y: 280500, vx: 0, vy: 0, upx: 0, upy: 1024, facing }
}

const FACINGS: readonly Facing[] = [FACING.left, FACING.right, FACING.down, FACING.up]
const LATCHES: readonly (SideLatch | undefined)[] = [
  undefined,
  { side: 'left', tile: { tx: 30, ty: 278 } },
  { side: 'right', tile: { tx: 30, ty: 278 } },
]

describe('terrain tool verb', () => {
  it('picks the side the side cutters cut for the same pose and no drive', () => {
    for (const facing of FACINGS) {
      for (const sideLatch of LATCHES) {
        const pose = poseFacing(facing)
        const miner = sideLatch === undefined ? { pose } : { pose, sideLatch }
        const cutters = facedSideOf(miner, pose, NO_DRIVE, sideSeedOf(pose))
        expect(toolVerbOf(HOLD, miner).facedSide).toBe(cutters)
      }
    }
  })

  it("follows the cutters' latch over the facing it started on", () => {
    const pose = poseFacing(FACING.down)
    const sideLatch: SideLatch = { side: 'left', tile: { tx: 30, ty: 278 } }
    expect(toolVerbOf(HOLD, { pose }).facedSide).toBe('right')
    expect(toolVerbOf(HOLD, { pose, sideLatch }).facedSide).toBe('left')
  })
})

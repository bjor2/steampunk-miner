import { describe, expect, it } from 'vitest'
import {
  ofType,
  plantSized,
  poseOnTile,
  sizedBlasterOn,
} from '../../../systems/authority/charges/chargeFixtures'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { DETONATE_INTENT } from './dynamiteCommands'

/** `tiles` west of the wall, on its row. */
function westOf(wall: TilePoint, tiles: number): TilePoint {
  return { tx: wall.tx - tiles, ty: wall.ty }
}

/** A charge of `size` planted at tick 1 on `planet`, the planter then standing `tiles` west of it. */
function plantedThenBackedOff(planet: number, size: number, tiles: number) {
  const blaster = sizedBlasterOn(planet, size)
  plantSized(blaster.session, blaster, size, 1)
  blaster.session.submit(2, poseOnTile(westOf(blaster.wall, tiles)))
  return blaster
}

describe('dynamite plunger: gating (#153 amendment 2, #189 lock)', () => {
  it('is refused before remote_detonator opens at P22, and the fuse still blows the charge', () => {
    const { session, wall } = plantedThenBackedOff(19, 5, 12)
    expect(session.submit(3, DETONATE_INTENT)).toMatchObject([
      { type: 'CommandRejected', reason: 'dynamite.detonator_locked' },
    ])
    expect(ofType(session.advanceTo(181), 'ChargeDetonated')).toEqual([
      expect.objectContaining({ ...wall, size: 5, by: 'fuse' }),
    ])
  })

  it('is refused with no live charge', () => {
    const { session } = sizedBlasterOn(22, 6)
    expect(session.submit(1, DETONATE_INTENT)).toMatchObject([
      { type: 'CommandRejected', reason: 'dynamite.no_live_charge' },
    ])
  })
})

describe('dynamite plunger: firing (#153, #149)', () => {
  it('fires a fused size-6 charge early from P22, logged by plunger, and its fuse never fires again', () => {
    const { session, wall } = plantedThenBackedOff(22, 6, 12)
    expect(ofType(session.submit(3, DETONATE_INTENT), 'ChargeDetonated')).toEqual([
      expect.objectContaining({ ...wall, size: 6, radiusMm: 10000, by: 'plunger' }),
    ])
    expect(session.vehicle().charges.planted).toBeNull()
    session.advanceTo(400)
    expect(ofType(session.events(), 'ChargeDetonated')).toHaveLength(1)
    expect(ofType(session.events(), 'BlastResolved')).toEqual([
      expect.objectContaining({ ...wall, size: 6 }),
    ])
  })

  it('fires a remote size-10 charge, which clears from the next tick in at most 29 slices', () => {
    const { session, wall } = plantedThenBackedOff(34, 10, 26)
    expect(ofType(session.submit(5, DETONATE_INTENT), 'ChargeDetonated')).toEqual([
      expect.objectContaining({ ...wall, size: 10, radiusMm: 24000, by: 'plunger' }),
    ])
    session.advanceTo(80)
    const fronts = ofType(session.events(), 'BlastFront')
    expect(fronts[0].tick).toBe(6)
    expect(fronts.length).toBeLessThanOrEqual(29)
    expect(fronts.at(-1)).toMatchObject({ rOuterMm: 24000 })
    expect(ofType(session.events(), 'BlastResolved')).toEqual([
      expect.objectContaining({ ...wall, size: 10, radiusMm: 24000 }),
    ])
  })
})

describe('dynamite plunger: the interlock at radius + 1 tile', () => {
  it('clunks a size-7 charge from 14 tiles (13 + 1), keeps it live, and fires it from 15', () => {
    const { session, wall } = plantedThenBackedOff(25, 7, 14)
    expect(session.submit(3, DETONATE_INTENT)).toMatchObject([
      { type: 'dynamite.DetonateRefused', reason: 'in_radius', size: 7 },
    ])
    expect(session.vehicle().charges.planted).toMatchObject({ ...wall, size: 7 })
    session.submit(4, poseOnTile(westOf(wall, 15)))
    expect(ofType(session.submit(5, DETONATE_INTENT), 'ChargeDetonated')).toEqual([
      expect.objectContaining({ ...wall, size: 7, by: 'plunger' }),
    ])
  })

  it('clunks a fused charge from inside its radius and leaves the fuse to blow it', () => {
    const { session, wall } = plantedThenBackedOff(22, 6, 3)
    expect(session.submit(3, DETONATE_INTENT)).toMatchObject([
      { type: 'dynamite.DetonateRefused', reason: 'in_radius', size: 6 },
    ])
    expect(ofType(session.advanceTo(211), 'ChargeDetonated')).toEqual([
      expect.objectContaining({ ...wall, by: 'fuse' }),
    ])
  })
})

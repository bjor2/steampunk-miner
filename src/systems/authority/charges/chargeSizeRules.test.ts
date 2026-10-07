import { describe, expect, it } from 'vitest'
import { blastSelfHit } from '../../economy/blastingCharges'
import { toCanonical } from '../../money'
import { bandOfTile } from '../../world/planetGeometry'
import type { TilePoint } from '../../world/tileGrid'
import { setUpgradeCommand, teleportToDockCommand } from '../../vehicle/vehicleCommands'
import { stepOfMajor } from '../../economy/upgradeSteps'
import { hullMax, onCurveLevel } from '../../economy/vehicleStats'
import { ofType, plantSized, poseOnTile, setChargesIntent, sizedBlasterOn } from './chargeFixtures'

/** `tiles` west of the wall, on its row. */
function westOf(wall: TilePoint, tiles: number): TilePoint {
  return { tx: wall.tx - tiles, ty: wall.ty }
}

describe('charge sizes: planting (K8 #218)', () => {
  it('plants a size-4 charge with its 150-tick fuse and takes it from the rack', () => {
    const { session, stand, wall } = sizedBlasterOn(16, 4, 2)
    const events = plantSized(session, { stand, wall }, 4, 1)
    expect(ofType(events, 'ChargePlanted')).toEqual([
      expect.objectContaining({ ...wall, size: 4, detonateTick: 151, carried: 1 }),
    ])
    expect(session.vehicle().charges).toMatchObject({
      carriedBySize: { '4': 1 },
      planted: { ...wall, size: 4, plantedTick: 1, detonateTick: 151 },
    })
  })

  it('refuses a size the rack does not hold, even with others in it', () => {
    const { session, stand, wall } = sizedBlasterOn(16, 1)
    expect(plantSized(session, { stand, wall }, 4, 1)).toMatchObject([
      { reason: 'no_charge_of_size' },
    ])
  })

  it('refuses a size before the planet it opens on', () => {
    const { session, stand, wall } = sizedBlasterOn(9, 2)
    expect(plantSized(session, { stand, wall }, 2, 1)).toMatchObject([{ reason: 'size_locked' }])
  })

  it('refuses a size off the ladder', () => {
    const { session, stand, wall } = sizedBlasterOn(16, 1)
    expect(plantSized(session, { stand, wall }, 11, 1)).toMatchObject([{ reason: 'out_of_range' }])
  })
})

describe('charge sizes: the blast (K8 #218)', () => {
  it('blows a size-4 charge at its fuse with its 6-tile radius, told to the slices as size 4', () => {
    const { session, stand, wall } = sizedBlasterOn(16, 4)
    plantSized(session, { stand, wall }, 4, 1)
    session.submit(2, poseOnTile(westOf(wall, 8)))
    expect(ofType(session.advanceTo(150), 'ChargeDetonated')).toEqual([])
    expect(ofType(session.advanceTo(151), 'ChargeDetonated')).toEqual([
      expect.objectContaining({ ...wall, by: 'fuse' }),
    ])
    session.advanceTo(400)
    expect(ofType(session.events(), 'BlastResolved')).toEqual([
      expect.objectContaining({ ...wall, size: 4, radiusMm: 6000 }),
    ])
  })

  it('wrecks its planter in the inner half of a size-4 blast', () => {
    const { session, stand, wall } = sizedBlasterOn(16, 4)
    plantSized(session, { stand, wall }, 4, 1)
    session.submit(2, poseOnTile(westOf(wall, 3)))
    expect(ofType(session.advanceTo(151), 'VehicleDestroyed')).toEqual([
      expect.objectContaining({ cause: 'blast' }),
    ])
  })

  it('hits an on-curve planter in the outer half of a size-4 blast with the size-4 hit, and spares it', () => {
    const { session, stand, wall, params } = sizedBlasterOn(16, 4)
    const hullLevel = onCurveLevel('hull', 16)
    session.submit(0, setUpgradeCommand('hull', stepOfMajor(hullLevel)))
    session.submit(0, { type: 'debug.setHull', payload: { hull: toCanonical(hullMax(hullLevel)) } })
    plantSized(session, { stand, wall }, 4, 1)
    session.submit(2, poseOnTile(westOf(wall, 5)))
    const amount = blastSelfHit(16, bandOfTile(params, wall.tx, wall.ty), 4)
    expect(ofType(session.advanceTo(151), 'VehicleDamaged')).toEqual([
      expect.objectContaining({ source: 'blast', amount: toCanonical(amount) }),
    ])
    expect(session.vehicle().mode).toBe('active')
  })
})

describe('charge sizes: remote charges and disarming (K8 #218, #153)', () => {
  it('plants a size-7 charge with no fuse, which never blows by itself', () => {
    const { session, stand, wall } = sizedBlasterOn(25, 7)
    const events = plantSized(session, { stand, wall }, 7, 1)
    expect(ofType(events, 'ChargePlanted')).toEqual([
      expect.objectContaining({ size: 7, detonateTick: null, carried: 0 }),
    ])
    session.advanceTo(3600)
    expect(ofType(session.events(), 'ChargeDetonated')).toEqual([])
    expect(session.vehicle().charges.planted).toMatchObject({ size: 7, detonateTick: null })
  })

  it('disarms a remote charge 3600 ticks after planting, refunding nothing', () => {
    const { session, stand, wall } = sizedBlasterOn(25, 7)
    plantSized(session, { stand, wall }, 7, 1)
    expect(ofType(session.advanceTo(3600), 'ChargeDisarmed')).toEqual([])
    expect(ofType(session.advanceTo(3601), 'ChargeDisarmed')).toEqual([
      expect.objectContaining({ ...wall, size: 7, reason: 'expired', tick: 3601 }),
    ])
    expect(session.vehicle().charges).toMatchObject({ carriedBySize: {}, planted: null })
  })

  it('disarms at the same tick whether the clock moves a tick at a time or in one jump', () => {
    const stepped = sizedBlasterOn(25, 7)
    plantSized(stepped.session, stepped, 7, 1)
    for (let tick = 2; tick <= 3700; tick += 1) stepped.session.advanceTo(tick)
    const jumped = sizedBlasterOn(25, 7)
    plantSized(jumped.session, jumped, 7, 1)
    jumped.session.advanceTo(3700)
    expect(ofType(stepped.session.events(), 'ChargeDisarmed')).toEqual(
      ofType(jumped.session.events(), 'ChargeDisarmed'),
    )
    expect(stepped.session.state()).toEqual(jumped.session.state())
  })

  it('disarms a remote charge when its planter docks', () => {
    const { session, stand, wall } = sizedBlasterOn(25, 7)
    plantSized(session, { stand, wall }, 7, 1)
    expect(ofType(session.submit(5, teleportToDockCommand('upgrade')), 'ChargeDisarmed')).toEqual([
      expect.objectContaining({ size: 7, reason: 'dock' }),
    ])
    expect(session.vehicle().charges.planted).toBeNull()
  })

  it('disarms a remote charge when its planter is wrecked', () => {
    const { session, stand, wall } = sizedBlasterOn(25, 7)
    plantSized(session, { stand, wall }, 7, 1)
    const wreck = session.submit(5, { type: 'debug.setHull', payload: { hull: '0' } })
    expect(ofType(wreck, 'ChargeDisarmed')).toEqual([
      expect.objectContaining({ size: 7, reason: 'wreck' }),
    ])
  })

  it('leaves a fused charge to its fuse when its planter docks', () => {
    const { session, stand, wall } = sizedBlasterOn(16, 4)
    plantSized(session, { stand, wall }, 4, 1)
    expect(ofType(session.submit(5, teleportToDockCommand('upgrade')), 'ChargeDisarmed')).toEqual(
      [],
    )
    expect(ofType(session.advanceTo(151), 'ChargeDetonated')).toHaveLength(1)
  })

  it('takes a debug rack of one size and refuses one that does not fit its slots', () => {
    const { session } = sizedBlasterOn(34, 1)
    expect(session.submit(1, setChargesIntent(1, 5, 10))).toMatchObject([
      { type: 'DebugCommandApplied' },
    ])
    expect(session.vehicle().charges.carriedBySize).toEqual({ '10': 1 })
    expect(session.submit(1, setChargesIntent(2, 5, 10))).toMatchObject([
      { reason: 'out_of_range' },
    ])
  })
})

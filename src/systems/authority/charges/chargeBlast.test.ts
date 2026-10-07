import { describe, expect, it } from 'vitest'
import { blastSelfHit } from '../../economy/blastingCharges'
import { chargeRadiusMm } from '../../economy/chargeSizes'
import { oreSalePrice } from '../../economy/oreEconomy'
import { fromCanonical, fromSafeInteger, mul, toCanonical } from '../../money'
import { FACING } from '../../vehicle/vehiclePose'
import { cellDensitySum } from '../../world/cellYield'
import { decodeCasing } from '../../world/chunkDelta'
import { bandOfTile } from '../../world/planetGeometry'
import { SAMPLES_PER_CELL, SOLID_DENSITY } from '../../world/sampleGrid'
import { chunkOfTile, type TilePoint } from '../../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { cellAt, currentDensityOfChunk, deltaOfChunk, EMPTY_WORLD } from '../../world/worldState'
import { BAND_2_Y, buildWeakTunnel, lineTunnel, TUNNEL_TO_X } from '../collapse/collapseFixtures'
import { minedOreOf } from '../minedOre'
import { coreTiles, createScriptedSession, FREEZE_ENEMIES, PARAMS } from '../scriptedSession'
import { blastTilesAround } from './blastOre'
import {
  BACKED_OFF_TILE,
  fiveOreBlastSite,
  ofType,
  PLANT,
  plantOnWall,
  poseOnTile,
  prepareBlaster,
  setChargesIntent,
  STAND_TILE,
  WALL_TILE,
} from './chargeFixtures'

const FUSE_TICKS = 120
const FULL_CELL = SAMPLES_PER_CELL * SOLID_DENSITY
/** A 2.5-tile blast clears on its detonation tick; its rim checks are done a few ticks later. */
const RESOLVED_TICK = 1 + FUSE_TICKS + 5

/** Plants at tick 1, backs off unless told to stay, and runs the clock past the fuse. */
function blastFromStand(options: { isBackingOff: boolean } = { isBackingOff: true }) {
  const session = createScriptedSession()
  prepareBlaster(session, 0)
  plantOnWall(session, 1)
  if (options.isBackingOff) session.submit(2, poseOnTile(BACKED_OFF_TILE, FACING.right))
  const before = session.events().length
  session.advanceTo(RESOLVED_TICK)
  return { session, blast: session.events().slice(before) }
}

function densityOfTile(session: ReturnType<typeof createScriptedSession>, tile: TilePoint) {
  return cellDensitySum(session.state().world, PARAMS, tile)
}

describe('blasting charges: plant and fuse (#109)', () => {
  it('plants on the wall the vehicle faces and takes one charge from the rack', () => {
    const session = createScriptedSession()
    prepareBlaster(session, 0)
    const events = plantOnWall(session, 1)
    expect(ofType(events, 'ChargePlanted')).toEqual([
      expect.objectContaining({ ...WALL_TILE, size: 1, detonateTick: 1 + FUSE_TICKS, carried: 2 }),
    ])
    expect(session.vehicle().charges).toMatchObject({
      carriedBySize: { '1': 2 },
      planted: { ...WALL_TILE, size: 1, plantedTick: 1 },
    })
  })

  it('blows when the fuse runs out and not a tick before', () => {
    const session = createScriptedSession()
    prepareBlaster(session, 0)
    plantOnWall(session, 1)
    session.submit(2, poseOnTile(BACKED_OFF_TILE))
    expect(ofType(session.advanceTo(FUSE_TICKS), 'ChargeDetonated')).toEqual([])
    expect(ofType(session.advanceTo(1 + FUSE_TICKS), 'ChargeDetonated')).toHaveLength(1)
    expect(session.vehicle().charges.planted).toBeNull()
  })

  it('blows at the same tick whether the clock moves a tick at a time or in one jump', () => {
    const stepped = createScriptedSession()
    prepareBlaster(stepped, 0)
    plantOnWall(stepped, 1)
    for (let tick = 2; tick <= 200; tick++) stepped.advanceTo(tick)
    const jumped = createScriptedSession()
    prepareBlaster(jumped, 0)
    plantOnWall(jumped, 1)
    jumped.advanceTo(200)
    expect(ofType(stepped.events(), 'ChargeDetonated')).toEqual(
      ofType(jumped.events(), 'ChargeDetonated'),
    )
    expect(stepped.state()).toEqual(jumped.state())
  })

  it('refuses a plant with an empty rack, with a charge live, facing air, or docked', () => {
    const empty = createScriptedSession()
    empty.submit(0, poseOnTile(STAND_TILE))
    expect(empty.submit(1, PLANT)).toMatchObject([{ reason: 'no_charge_of_size' }])
    const live = createScriptedSession()
    prepareBlaster(live, 0)
    plantOnWall(live, 1)
    expect(live.submit(2, PLANT)).toMatchObject([{ reason: 'charge_live' }])
    const facingSky = createScriptedSession()
    facingSky.submit(0, setChargesIntent(3))
    facingSky.submit(0, poseOnTile({ tx: 20, ty: PARAMS.radiusTiles + 2 }, FACING.up))
    expect(facingSky.submit(1, PLANT)).toMatchObject([{ reason: 'no_wall' }])
    const docked = createScriptedSession()
    docked.submit(0, setChargesIntent(3))
    docked.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'sell' } })
    expect(docked.submit(1, PLANT)).toMatchObject([{ reason: 'vehicle_not_active' }])
  })

  it('leaves a planted charge behind on the old planet when the session moves on', () => {
    const session = createScriptedSession()
    prepareBlaster(session, 0)
    plantOnWall(session, 1)
    session.submit(2, { type: 'debug.setPlanet', payload: { planetIndex: 2 } })
    session.advanceTo(400)
    expect(session.vehicle().charges).toMatchObject({ carriedBySize: { '1': 2 }, planted: null })
    expect(ofType(session.events(), 'ChargeDetonated')).toEqual([])
  })
})

describe('blasting charges: the blast (#109 numbers acceptance 1 and 2)', () => {
  it('clears every tile within 2.5 tiles of the charge and none further', () => {
    const { session, blast } = blastFromStand()
    const inRadius = blastTilesAround(WALL_TILE, 1)
    expect(inRadius).toHaveLength(21)
    expect(inRadius.map((tile) => densityOfTile(session, tile))).toEqual(inRadius.map(() => 0))
    expect(densityOfTile(session, { tx: WALL_TILE.tx + 3, ty: WALL_TILE.ty })).toBe(FULL_CELL)
    expect(densityOfTile(session, { tx: WALL_TILE.tx + 2, ty: WALL_TILE.ty + 2 })).toBe(FULL_CELL)
    expect(ofType(blast, 'ChargeDetonated')).toEqual([expect.objectContaining(WALL_TILE)])
    expect(ofType(blast, 'BlastResolved')).toEqual([
      expect.objectContaining({ ...WALL_TILE, tilesCleared: 21 }),
    ])
  })

  it("tells the detonation its blast's ladder size and radius: size 1 for the shipped charge (#213)", () => {
    const { blast } = blastFromStand()
    expect(ofType(blast, 'ChargeDetonated')).toEqual([
      expect.objectContaining({ ...WALL_TILE, size: 1, radiusMm: chargeRadiusMm(1) }),
    ])
  })

  it('leaves core tiles whole and clears the rock round them', () => {
    const [topCore] = coreTiles(1)
    const above = { tx: topCore.tx, ty: topCore.ty + 1 }
    const session = createScriptedSession()
    session.submit(0, FREEZE_ENEMIES)
    session.submit(0, setChargesIntent(3))
    session.submit(0, poseOnTile({ tx: above.tx, ty: above.ty + 1 }, FACING.down))
    expect(ofType(session.submit(1, PLANT), 'ChargePlanted')).toMatchObject([above])
    session.advanceTo(1 + FUSE_TICKS)
    const core = blastTilesAround(above, 1).filter(
      (tile) => kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile)) === CELL_KIND.core,
    )
    expect(core.length).toBeGreaterThan(0)
    expect(core.map((tile) => densityOfTile(session, tile))).toEqual(core.map(() => FULL_CELL))
    expect(densityOfTile(session, above)).toBe(0)
  })

  it('leaves lined samples of the tunnel wall with their density and lining', () => {
    const session = createScriptedSession()
    buildWeakTunnel(session, 0)
    lineTunnel(session, 0, 2)
    const charge = { tx: Math.floor(TUNNEL_TO_X / 1000) + 1, ty: Math.floor(BAND_2_Y / 1000) }
    const lining = liningAround(session, charge)
    expect(lining.length).toBeGreaterThan(0)
    session.submit(1, setChargesIntent(3))
    session.submit(1, poseOnTile({ tx: charge.tx - 1, ty: charge.ty }))
    expect(ofType(session.submit(1, PLANT), 'ChargePlanted')).toMatchObject([charge])
    session.submit(2, poseOnTile({ tx: charge.tx - 6, ty: charge.ty }, FACING.right))
    session.advanceTo(1 + FUSE_TICKS)
    expect(liningAround(session, charge)).toEqual(lining)
    const heldTiles = blastTilesAround(charge, 1).filter((tile) => densityOfTile(session, tile) > 0)
    expect(heldTiles.length).toBeGreaterThan(0)
  })

  it('hits the planter inside the radius with exactly the self hit at the blast tile', () => {
    const { blast } = blastFromStand({ isBackingOff: false })
    const band = bandOfTile(PARAMS, WALL_TILE.tx, WALL_TILE.ty)
    expect(ofType(blast, 'VehicleDamaged')).toEqual([
      expect.objectContaining({
        source: 'blast',
        amount: toCanonical(blastSelfHit(1, band, 1)),
        arc: null,
        enemyId: null,
      }),
    ])
  })

  it('does not hit a vehicle that backed out of the radius', () => {
    const { blast } = blastFromStand()
    expect(ofType(blast, 'VehicleDamaged')).toEqual([])
  })

  it('does no damage to another vehicle inside the radius', () => {
    const session = createScriptedSession(['p1', 'p2'])
    prepareBlaster(session, 0)
    session.submit(0, poseOnTile(STAND_TILE), 'p2')
    plantOnWall(session, 1)
    session.submit(2, poseOnTile(BACKED_OFF_TILE))
    session.advanceTo(1 + FUSE_TICKS)
    expect(ofType(session.events(), 'VehicleDamaged')).toEqual([])
    expect(session.vehicle('p2').hull).toEqual(session.vehicle('p1').hull)
  })

  it('kills an enemy inside the radius and spares one outside it', () => {
    const session = createScriptedSession()
    prepareBlaster(session, 0)
    session.submit(0, {
      type: 'debug.spawnEnemy',
      payload: { kind: 'crawler', tier: 2, dx: 2, dy: 0 },
    })
    session.submit(0, {
      type: 'debug.spawnEnemy',
      payload: { kind: 'crawler', tier: 2, dx: 7, dy: 0 },
    })
    plantOnWall(session, 1)
    session.submit(2, poseOnTile(BACKED_OFF_TILE))
    session.advanceTo(1 + FUSE_TICKS)
    expect(ofType(session.events(), 'EnemyKilled')).toEqual([
      expect.objectContaining({ enemyId: 'e1', by: 'blast' }),
    ])
    expect(session.state().combat.enemies.map((enemy) => enemy.id)).toEqual(['e2'])
  })
})

describe('blasting charges: ore yield (#109 numbers acceptance 1)', () => {
  it('keeps two of five ore units and logs the other 60% of their value as lost', () => {
    const { wall, tier } = fiveOreBlastSite()
    const session = createScriptedSession()
    session.submit(0, FREEZE_ENEMIES)
    session.submit(0, setChargesIntent(3))
    session.submit(0, poseOnTile({ tx: wall.tx - 1, ty: wall.ty }))
    session.submit(1, PLANT)
    session.submit(2, poseOnTile({ tx: wall.tx - 5, ty: wall.ty }))
    session.advanceTo(RESOLVED_TICK)
    const [resolved] = ofType(session.events(), 'BlastResolved')
    const inRadiusValue = mul(fromSafeInteger(5), oreSalePrice(tier))
    expect(resolved.oreValueLost).toBe(toCanonical(mul(fromCanonical('0.6'), inRadiusValue)))
    expect(resolved.oreUnits).toBe(2)
    expect(session.vehicle().cargo.ore).toEqual({ [String(tier)]: 2 })
    expect(ofType(session.events(), 'CargoAdded')).toHaveLength(2)
  })

  it('names each kept unit after the first ore cells the blast broke, in its order (#122)', () => {
    const { wall } = fiveOreBlastSite()
    const session = createScriptedSession()
    session.submit(0, FREEZE_ENEMIES)
    session.submit(0, setChargesIntent(3))
    session.submit(0, poseOnTile({ tx: wall.tx - 1, ty: wall.ty }))
    session.submit(1, PLANT)
    session.submit(2, poseOnTile({ tx: wall.tx - 5, ty: wall.ty }))
    session.advanceTo(1 + FUSE_TICKS)
    const brokenOre = blastTilesAround(wall, 1)
      .filter((tile) => kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile)) === CELL_KIND.ore)
      .map((tile) => minedOreOf(PARAMS, tile, cellAt(EMPTY_WORLD, PARAMS, tile)))
    const added = ofType(session.events(), 'CargoAdded')
    expect(added.map(({ oreId, depthTiles, chunk }) => ({ oreId, depthTiles, chunk }))).toEqual(
      brokenOre.slice(0, 2).map(({ oreId, depthTiles, chunk }) => ({ oreId, depthTiles, chunk })),
    )
  })
})

describe('blasting charges: collapse (#109 "Collapse risk")', () => {
  it('starts the warning of weak lining next to the blast, with no vehicle near', () => {
    const session = createScriptedSession()
    buildWeakTunnel(session, 0)
    const charge = { tx: Math.floor(TUNNEL_TO_X / 1000) + 1, ty: Math.floor(BAND_2_Y / 1000) }
    session.submit(1, setChargesIntent(3))
    session.submit(1, poseOnTile({ tx: charge.tx - 1, ty: charge.ty }))
    session.submit(1, PLANT)
    session.submit(2, poseOnTile({ tx: charge.tx + 40, ty: charge.ty }))
    const before = session.events().length
    session.advanceTo(RESOLVED_TICK)
    const blast = session.events().slice(before)
    const [resolved] = ofType(blast, 'BlastResolved')
    expect(resolved.collapseChecks).toBeGreaterThan(0)
    expect(resolved.collapsesTriggered).toBe(ofType(blast, 'CollapseWarned').length)
    expect(resolved.collapsesTriggered).toBeGreaterThan(0)
  })

  it('starts no warning where the lining holds the band', () => {
    const { blast } = blastFromStand()
    const [resolved] = ofType(blast, 'BlastResolved')
    expect(resolved.collapseChecks).toBeGreaterThan(0)
    expect(resolved.collapsesTriggered).toBe(0)
    expect(ofType(blast, 'CollapseWarned')).toEqual([])
  })
})

/** Every lined sample's casing and density in the chunk round the charge, in index order. */
function liningAround(session: ReturnType<typeof createScriptedSession>, charge: TilePoint) {
  const cx = chunkOfTile(charge.tx)
  const cy = chunkOfTile(charge.ty)
  const world = session.state().world
  const casing = decodeCasing(deltaOfChunk(world, cx, cy))
  const density = currentDensityOfChunk(world, PARAMS, cx, cy)
  return [...casing.keys()]
    .filter((index) => casing[index] !== 0)
    .map((index) => ({ index, casing: casing[index], density: density[index] }))
}

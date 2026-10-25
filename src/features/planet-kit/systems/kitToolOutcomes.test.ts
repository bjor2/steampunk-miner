import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { hazardKindAtTile } from '../../../systems/authority/hazards/hazardCells'
import { placeHazardCommand } from '../../../systems/authority/hazards/hazardDebugRules'
import { isOpenTile } from '../../../systems/authority/hazards/hazardShove'
import {
  continueScriptedSession,
  createScriptedSession,
  drill,
  GROUND,
  mineTile,
  PARAMS,
  poseAbove,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import {
  readSnapshot,
  takeSnapshot,
  type SessionSnapshot,
} from '../../../systems/authority/sessionSnapshot'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { drillGearCellsAt } from '../../../systems/vehicle/drillGearCells'
import { drillStampOf } from '../../../systems/vehicle/drillStamp'
import { FACING, type VehiclePose } from '../../../systems/vehicle/vehiclePose'
import { cellDensitySum } from '../../../systems/world/cellYield'
import { SOLID_DENSITY, SAMPLES_PER_TILE } from '../../../systems/world/sampleGrid'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { materialCellAt } from '../../../systems/world/worldState'
import { UNCORK_FLASK_INTENT } from './flaskRules'
import { kitHoldingsOf } from './kitHoldingsSection'

// One visible outcome per hazard tool while it acts (ticket 882, PK4c T2; the GD's final lock on
// #850 and Systems' rows): the plough moves the scree the bit cuts next one tile aside through the
// terrain edit queue, the tongs loot the cluster they bite, the vane turns the vent's shove outward
// at the vaned size, and an open flask clears firedamp within 2 tiles of where it was uncorked.
// Each is logged, and none plays for a player without the tool.

const START = 100
const BELOW = { tx: GROUND.tx, ty: GROUND.ty - 1 }
const FULL_CELL = SOLID_DENSITY * SAMPLES_PER_TILE * SAMPLES_PER_TILE

const grantKitItem = (itemId: string): CommandIntent =>
  ({ type: 'debug.planet-kit.grantKitItem', payload: { itemId } }) as CommandIntent

function eventsOfType<T extends DomainEvent['type']>(
  events: readonly DomainEvent[],
  type: T,
): Extract<DomainEvent, { type: T }>[] {
  return events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type)
}

/** The rig's pose over GROUND facing down, as `mineTile(GROUND)` reports it. */
function poseOverGround(): VehiclePose {
  return poseAbove(GROUND, FACING.down).payload as unknown as VehiclePose
}

/** The cell past the drill's stamp from over GROUND: the one the plough looks at. */
const AHEAD: TilePoint = drillGearCellsAt(poseOverGround(), drillStampOf(poseOverGround(), false), {
  aheadCells: 1,
  sideCells: 0,
}).ahead[0]
/** Facing down with the planet's top up, the facing's left is +x and its right −x. */
const LEFT_OF_AHEAD = { tx: AHEAD.tx + 1, ty: AHEAD.ty }
const RIGHT_OF_AHEAD = { tx: AHEAD.tx - 1, ty: AHEAD.ty }

function savedAndLoaded(session: ScriptedSession): ScriptedSession {
  const text = JSON.stringify(takeSnapshot(session.state()))
  const restored = readSnapshot(JSON.parse(text) as SessionSnapshot)
  if (!('state' in restored)) throw new Error(restored.problems.join('\n'))
  return continueScriptedSession(restored.state)
}

/**
 * Rockfall at GROUND and on the cell ahead, the given side cells mined open first, then the
 * plough granted (or not) and GROUND cut from above.
 */
function ploughRun(openSides: readonly TilePoint[], withPlough = true) {
  const session = createScriptedSession(['p1', 'p2'])
  openSides.forEach((tile, at) => mineTile(session, START + at * 50, tile))
  const cut = START + 200
  session.submit(cut, placeHazardCommand('rockfall', GROUND.tx, GROUND.ty))
  session.submit(cut, placeHazardCommand('rockfall', AHEAD.tx, AHEAD.ty))
  if (withPlough) session.submit(cut, grantKitItem('scree_plough'))
  const events = mineTile(session, cut, GROUND)
  const applied = session.submit(cut + 41, poseAbove(GROUND, FACING.down))
  return { session, events, applied }
}

describe('scree plough outcome', () => {
  it('moves the scree the bit cuts next one tile to the facing’s left, into the open cell', () => {
    const { session, events, applied } = ploughRun([LEFT_OF_AHEAD])
    expect(eventsOfType(events, 'planet-kit.ScreeShoved')).toMatchObject([
      { playerId: 'p1', fromTx: AHEAD.tx, fromTy: AHEAD.ty, toTx: LEFT_OF_AHEAD.tx },
    ])
    expect(eventsOfType(applied, 'GroundChanged').length).toBeGreaterThan(0)
    const { world } = session.state()
    expect(isOpenTile(world, PARAMS, AHEAD)).toBe(true)
    expect(cellDensitySum(world, PARAMS, LEFT_OF_AHEAD)).toBe(FULL_CELL)
    expect(kindOfCell(materialCellAt(world, PARAMS, LEFT_OF_AHEAD))).toBe(CELL_KIND.ground)
  })

  it('moves it to the right when only the right is open', () => {
    const { events } = ploughRun([RIGHT_OF_AHEAD])
    expect(eventsOfType(events, 'planet-kit.ScreeShoved')).toMatchObject([
      { toTx: RIGHT_OF_AHEAD.tx, toTy: RIGHT_OF_AHEAD.ty },
    ])
  })

  it('moves nothing with neither side open, nor for a player without the plough', () => {
    const shut = ploughRun([])
    expect(eventsOfType(shut.events, 'planet-kit.ScreeShoved')).toEqual([])
    expect(isOpenTile(shut.session.state().world, PARAMS, AHEAD)).toBe(false)
    const bare = ploughRun([LEFT_OF_AHEAD], false)
    expect(eventsOfType(bare.events, 'planet-kit.ScreeShoved')).toEqual([])
    expect(bare.session.state().terrainEdits).toEqual([])
  })

  it('never packs the scree onto a rig standing in the open cell', () => {
    const session = createScriptedSession(['p1', 'p2'])
    mineTile(session, START, LEFT_OF_AHEAD)
    session.submit(START + 100, poseAbove({ tx: LEFT_OF_AHEAD.tx, ty: AHEAD.ty - 1 }, 0), 'p2')
    session.submit(START + 200, placeHazardCommand('rockfall', GROUND.tx, GROUND.ty))
    session.submit(START + 200, placeHazardCommand('rockfall', AHEAD.tx, AHEAD.ty))
    session.submit(START + 200, grantKitItem('scree_plough'))
    const events = mineTile(session, START + 200, GROUND)
    expect(eventsOfType(events, 'planet-kit.ScreeShoved')).toEqual([])
  })

  it('replays byte-identically, and a saved and loaded session holds the moved cells', () => {
    const first = ploughRun([LEFT_OF_AHEAD])
    const second = ploughRun([LEFT_OF_AHEAD])
    expect(stateDigest(second.session.state())).toBe(stateDigest(first.session.state()))
    const loaded = savedAndLoaded(first.session)
    expect(isOpenTile(loaded.state().world, PARAMS, AHEAD)).toBe(true)
    expect(cellDensitySum(loaded.state().world, PARAMS, LEFT_OF_AHEAD)).toBe(FULL_CELL)
  })
})

describe('shard tongs outcome', () => {
  it('loots each cluster the drill bites while the tongs act, once a cell', () => {
    const session = createScriptedSession()
    session.submit(START, grantKitItem('shard_tongs'))
    session.submit(START, placeHazardCommand('spinecrystal', GROUND.tx, GROUND.ty))
    const events = mineTile(session, START + 1, GROUND)
    expect(eventsOfType(events, 'planet-kit.ShardLooted')).toEqual([
      expect.objectContaining({ playerId: 'p1', ...GROUND }),
    ])
    expect(eventsOfType(mineTile(session, START + 100, GROUND), 'planet-kit.ShardLooted')).toEqual(
      [],
    )
  })

  it('adds nothing to the hold the cut did not: the same cargo as a bare cut', () => {
    const cargoOf = (withTongs: boolean) => {
      const session = createScriptedSession()
      if (withTongs) session.submit(START, grantKitItem('shard_tongs'))
      session.submit(START, placeHazardCommand('spinecrystal', GROUND.tx, GROUND.ty))
      return eventsOfType(mineTile(session, START + 1, GROUND), 'CargoAdded')
    }
    expect(cargoOf(true)).toEqual(cargoOf(false))
  })

  it('loots nothing without the tongs', () => {
    const session = createScriptedSession()
    session.submit(START, placeHazardCommand('spinecrystal', GROUND.tx, GROUND.ty))
    expect(eventsOfType(mineTile(session, START + 1, GROUND), 'planet-kit.ShardLooted')).toEqual([])
  })
})

describe('vent vane outcome', () => {
  /**
   * A vent beside the rig in the mined BELOW, cut from its right: its normal points left, where
   * one cell is open, and outward is up the open shaft.
   */
  function sideVentShove(withVane: boolean) {
    const session = createScriptedSession()
    mineTile(session, START, GROUND)
    mineTile(session, START + 50, BELOW)
    mineTile(session, START + 100, { tx: BELOW.tx - 1, ty: BELOW.ty })
    const vent = { tx: BELOW.tx + 1, ty: BELOW.ty }
    if (withVane) session.submit(START + 149, grantKitItem('vent_vane'))
    session.submit(START + 149, placeHazardCommand('steamvent', vent.tx, vent.ty))
    session.submit(START + 150, poseAbove({ tx: BELOW.tx, ty: BELOW.ty - 1 }, FACING.right))
    return session.submit(START + 190, drill(vent, 40))
  }

  it('turns the shove outward from the core at the vaned size and logs the ride', () => {
    const events = sideVentShove(true)
    expect(eventsOfType(events, 'HazardShoved')).toMatchObject([
      { tiles: 1, toTx: BELOW.tx, toTy: BELOW.ty + 1 },
    ])
    expect(eventsOfType(events, 'planet-kit.VaneRidden')).toMatchObject([
      { playerId: 'p1', tiles: 1, toTx: BELOW.tx, toTy: BELOW.ty + 1 },
    ])
  })

  it('never shoves farther than the bare vent does up an open shaft', () => {
    const shoveUpShaft = (withVane: boolean) => {
      const session = createScriptedSession()
      if (withVane) session.submit(START, grantKitItem('vent_vane'))
      mineTile(session, START, GROUND)
      mineTile(session, START + 50, BELOW)
      const deeper = { tx: BELOW.tx, ty: BELOW.ty - 1 }
      session.submit(START + 99, placeHazardCommand('steamvent', deeper.tx, deeper.ty))
      const [shove] = eventsOfType(mineTile(session, START + 100, deeper), 'HazardShoved')
      return shove.tiles
    }
    expect(shoveUpShaft(false)).toBe(3)
    expect(shoveUpShaft(true)).toBe(1)
  })

  it('leaves a bare rig’s shove along the vent normal, with no ride logged', () => {
    const events = sideVentShove(false)
    expect(eventsOfType(events, 'HazardShoved')).toMatchObject([
      { tiles: 1, toTx: BELOW.tx - 1, toTy: BELOW.ty },
    ])
    expect(eventsOfType(events, 'planet-kit.VaneRidden')).toEqual([])
  })
})

describe('damp flask outcome', () => {
  const NEAR = { tx: BELOW.tx + 2, ty: BELOW.ty }
  const FAR = { tx: BELOW.tx + 2, ty: BELOW.ty + 1 }

  /** Firedamp round BELOW, the rig standing in BELOW with a flask; uncorked when asked. */
  function flaskSession(isUncorked: boolean) {
    const session = createScriptedSession(['p1', 'p2'])
    session.submit(START, grantKitItem('damp_flask'))
    for (const tile of [BELOW, NEAR, FAR]) {
      session.submit(START, placeHazardCommand('firedamp', tile.tx, tile.ty))
    }
    session.submit(START + 1, poseAbove({ tx: BELOW.tx, ty: BELOW.ty - 1 }, FACING.down))
    const events = isUncorked ? session.submit(START + 2, UNCORK_FLASK_INTENT) : []
    return { session, events }
  }

  it('clears firedamp within 2 tiles of the uncork cell for its window, deleting no cell', () => {
    const { session, events } = flaskSession(true)
    expect(eventsOfType(events, 'planet-kit.FlaskUncorked')).toMatchObject([{ at: BELOW }])
    expect(kitHoldingsOf(session.state(), 'p1').flaskAt).toEqual(BELOW)
    const kindAt = (tile: TilePoint) => hazardKindAtTile(session.state(), PARAMS, tile)
    expect([kindAt(BELOW), kindAt(NEAR), kindAt(FAR)]).toEqual([null, null, 'firedamp'])
    expect(session.state().world).toEqual(flaskSession(false).session.state().world)
  })

  it('clears the cells for every player’s rig, so another rig in them drains nothing', () => {
    const drainedOfOther = (isUncorked: boolean) => {
      const { session } = flaskSession(isUncorked)
      const inNear = poseAbove({ tx: NEAR.tx, ty: NEAR.ty - 1 }, FACING.down)
      session.submit(START + 10, inNear, 'p2')
      return eventsOfType(session.submit(START + 400, inNear, 'p2'), 'HazardDrained')
    }
    expect(drainedOfOther(false)).toHaveLength(1)
    expect(drainedOfOther(true)).toEqual([])
  })

  it('brings the firedamp back when the flask closes', () => {
    const { session } = flaskSession(true)
    session.submit(START + 2 + 3600, poseAbove({ tx: BELOW.tx, ty: BELOW.ty - 1 }, FACING.down))
    expect(hazardKindAtTile(session.state(), PARAMS, NEAR)).toBe('firedamp')
  })

  it('keeps the cleared cell through a save and a load', () => {
    const loaded = savedAndLoaded(flaskSession(true).session)
    expect(hazardKindAtTile(loaded.state(), PARAMS, NEAR)).toBeNull()
  })
})

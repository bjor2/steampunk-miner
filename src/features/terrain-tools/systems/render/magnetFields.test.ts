import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../../../constants/physics'
import { createAuthorityState } from '../../../../systems/authority/authorityState'
import { buildWeakTunnel } from '../../../../systems/authority/collapse/collapseFixtures'
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  dockInBay,
  type ScriptedSession,
} from '../../../../systems/authority/scriptedSession'
import { NEW_FIXED_STEP_CLOCK, stepsForFrame } from '../../../../systems/fixedStepClock'
import { FACING } from '../../../../systems/vehicle/vehiclePose'
import { lastMarkOf } from '../../../tech-tree'
import { buriedTile, ofType, press, sessionWith, standAt } from '../../terrainTestSession'
import { clampLatticeOf } from '../clampLattice'
import { LODE_CLAMP_ID } from '../lodeClamp'
import { LODESTONE_BEACON_ID } from '../lodestoneBeacon'
import { magnetItemOf, magnetMarkLadderOf } from '../magnetItems'
import { REPULSOR_COIL_ID } from '../repulsorCoil'
import { terrainToolsOf, withClampField } from '../terrainSection'
import {
  coilRadiusAt,
  createHeardMagnetFields,
  forgetEndedFields,
  hearMagnetEvents,
} from './heardMagnetFields'
import { fieldGrowthAt, fieldLightAt, levelsOfField } from './magnetFieldLight'
import { MAGNET_FIELD_LOOK } from './magnetFieldLook'
import {
  gatherRadiusAt,
  magnetFieldsOf,
  piecesOfField,
  standingMagnetFieldsOf,
  type MagnetField,
} from './magnetFields'

// What the magnet fields' layer draws (GD lock on #246 build 5, the GD and TD rulings on #286):
// only an owned item that is planted or acting; the beacon faint while it waits, ramping to bright
// over 6 ticks in its gather, gone once spent; the coil's ring opening in the 6-tick response; the
// clamp's lattice over its pinned cells and struts on the blocks it braces.

const LOOK = MAGNET_FIELD_LOOK
const RAMP_TICKS = 6
const VIEW = { x: 0, y: 0 }
const MAGNETIC_PLANET = 43
const PLANT_TICK = 10
const DOCK_TICK = 40
/** The coil's top Mark, where its radius stops at 2x the bought one (#283 caps). */
const LAST_COIL_MARK = lastMarkOf(magnetMarkLadderOf(magnetItemOf(REPULSOR_COIL_ID)!))

function plantedBeacon(): ScriptedSession {
  const session = sessionWith({ 'powerup.1': LODESTONE_BEACON_ID })
  standAt(session, 5, buriedTile(12), FACING.right)
  session.submit(PLANT_TICK, press())
  session.advanceTo(PLANT_TICK + 2)
  return session
}

function heldClamp(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, setVehicleLoadoutCommand({ 'powerup.1': LODE_CLAMP_ID }))
  buildWeakTunnel(session, 10)
  session.submit(20, press())
  session.advanceTo(40)
  return session
}

function lightNow(field: MagnetField, tick: number): number {
  return fieldLightAt(field.timing, levelsOfField(field.kind), tick)
}

/** The coil's act as the authority reports it: the magnet line and the power-up line. */
function coilActEvents(tick: number, mark: number): DomainEvent[] {
  return [
    {
      type: 'terrain-tools.MagnetUsed',
      tick,
      playerId: 'p1',
      itemId: REPULSOR_COIL_ID,
      verb: 'repel',
      cellsMoved: 3,
      energy: 12,
    },
    {
      type: 'power-up-core.PowerUpUsed',
      tick,
      playerId: 'p1',
      itemId: REPULSOR_COIL_ID,
      slot: 'powerup.1',
      mark,
      originTx: 0,
      originTy: 0,
      chargesLeft: 1,
    },
  ] as DomainEvent[]
}

describe('magnet fields: what draws', () => {
  it('draws nothing for a player who owns no magnet, on a magnetic planet too', () => {
    const state = createAuthorityState({
      planetIndex: MAGNETIC_PLANET,
      planetSeed: 83921,
      playerIds: ['p1'],
    })
    expect(standingMagnetFieldsOf(state)).toEqual([])
    expect(magnetFieldsOf(state, [], 'p1', VIEW)).toEqual([])
  })

  it('draws no lattice for a clamp field its player does not own', () => {
    const state = createScriptedSession().state()
    const field = { cells: [{ tx: 3, ty: 4 }], startTick: 0, finishTick: 180, energy: 0 }
    expect(standingMagnetFieldsOf(withClampField(state, 'p1', field))).toEqual([])
  })

  it('draws a planted beacon’s converging arcs faint while it waits for the dock', () => {
    const session = plantedBeacon()
    const [field] = standingMagnetFieldsOf(session.state())
    const beacon = terrainToolsOf(session.state(), 'p1').beacon
    expect(field).toMatchObject({
      kind: 'attract',
      playerId: 'p1',
      centre: { x: (beacon?.tx ?? 0) + 0.5, y: (beacon?.ty ?? 0) + 0.5 },
      radiusM: gatherRadiusAt(beacon?.mark ?? 0),
    })
    expect(lightNow(field, session.state().tick)).toBe(LOOK.faintOpacity)
    expect(lightNow(field, session.state().tick + 10 * TICKS_PER_SECOND)).toBe(LOOK.faintOpacity)
  })

  it('keeps the waiting beacon at most a third of the bright light, under any warning', () => {
    expect(LOOK.faintOpacity * 3).toBeLessThanOrEqual(LOOK.brightOpacity)
  })

  it('ramps the gather from faint to bright over 6 ticks, then lets it go once spent', () => {
    const session = plantedBeacon()
    const heard = createHeardMagnetFields()
    hearMagnetEvents(heard, dockInBay(session, DOCK_TICK, 'sell'), session.state())
    session.advanceTo(DOCK_TICK + 1)
    const fields = magnetFieldsOf(session.state(), heard.fields, 'p1', VIEW)
    expect(fields.map((field) => field.kind)).toEqual(['attract'])
    const [gather] = fields
    const start = gather.timing.brightFromTick
    expect(lightNow(gather, start)).toBe(LOOK.faintOpacity)
    expect(lightNow(gather, start + 3)).toBeGreaterThan(LOOK.faintOpacity)
    expect(lightNow(gather, start + 3)).toBeLessThan(LOOK.brightOpacity)
    expect(lightNow(gather, start + RAMP_TICKS)).toBe(LOOK.brightOpacity)
    expect(lightNow(gather, gather.timing.endTick)).toBe(0)
    forgetEndedFields(heard, gather.timing.endTick)
    expect(magnetFieldsOf(session.state(), heard.fields, 'p1', VIEW)).toEqual([])
  })

  it.each([30, 144])(
    'brightens the gather fully 6 ticks in at %i frames a second',
    (framesPerSecond) => {
      const timing = { startTick: 0, growTicks: 0, brightFromTick: 0, endTick: 600 }
      const levels = levelsOfField('attract')
      let clock = NEW_FIXED_STEP_CLOCK
      let tick = 0
      const lightByFrame: number[] = []
      while (tick < RAMP_TICKS) {
        const frame = stepsForFrame(clock, 1 / framesPerSecond, 1 / TICKS_PER_SECOND, 8)
        clock = frame.clock
        tick += frame.steps
        lightByFrame.push(fieldLightAt(timing, levels, tick))
      }
      expect(lightByFrame.at(-1)).toBe(LOOK.brightOpacity)
      expect(lightByFrame.slice(0, -1).every((light) => light < LOOK.brightOpacity)).toBe(true)
    },
  )

  it('opens a coil wave’s ring from the vehicle to its radius at the Mark within 6 ticks', () => {
    const session = sessionWith({ 'powerup.1': REPULSOR_COIL_ID })
    standAt(session, 5, buriedTile(8), FACING.right)
    session.advanceTo(20)
    const heard = createHeardMagnetFields()
    hearMagnetEvents(heard, coilActEvents(20, LAST_COIL_MARK), session.state())
    const [wave] = heard.fields
    expect(wave).toMatchObject({
      kind: 'repel',
      centre: { x: buriedTile(8).tx + 0.5, y: buriedTile(8).ty + 0.5 },
      radiusM: coilRadiusAt(LAST_COIL_MARK),
    })
    expect(coilRadiusAt(LAST_COIL_MARK)).toBe(2 * coilRadiusAt(1))
    expect(fieldGrowthAt(wave.timing, 20)).toBe(0)
    expect(fieldGrowthAt(wave.timing, 20 + RAMP_TICKS)).toBe(1)
    expect(lightNow(wave, 20)).toBe(LOOK.brightOpacity)
  })

  it('hears nothing from a batch with no gather or wave in it', () => {
    const heard = createHeardMagnetFields()
    hearMagnetEvents(
      heard,
      [{ type: 'DockEntered', tick: 4, playerId: 'p1' }] as DomainEvent[],
      createScriptedSession().state(),
    )
    expect(heard).toEqual(createHeardMagnetFields())
  })

  it('lays a lattice over each pinned cell and a strut on each block the clamp braces', () => {
    const session = heldClamp()
    const state = session.state()
    expect(ofType(session.events(), 'CollapseBraced').length).toBeGreaterThan(0)
    const [field] = standingMagnetFieldsOf(state)
    if (field?.kind !== 'anchor') throw new Error('no clamp field drawn')
    expect(field.cells).toEqual(terrainToolsOf(state, 'p1').clamp?.cells)
    expect(field.blocks.length).toBe(clampLatticeOf(state, 'p1').length)
    expect(field.blocks.length).toBeGreaterThan(0)
    expect(piecesOfField(field)).toBe(field.cells.length + field.blocks.length)
    expect(lightNow(field, state.tick)).toBe(LOOK.brightOpacity)
  })

  it('puts the local player’s fields first, then the others nearest the view first', () => {
    const ring = (playerId: string, x: number): MagnetField => ({
      kind: 'repel',
      playerId,
      centre: { x, y: 0 },
      radiusM: 2,
      timing: { startTick: 0, growTicks: 6, brightFromTick: 0, endTick: 30 },
    })
    const state = createScriptedSession().state()
    const heard = [ring('p3', 90), ring('p2', 20), ring('p1', 400), ring('p4', 20)]
    expect(magnetFieldsOf(state, heard, 'p1', VIEW).map((field) => field.playerId)).toEqual([
      'p1',
      'p2',
      'p4',
      'p3',
    ])
  })
})

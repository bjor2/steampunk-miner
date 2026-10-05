import { describe, expect, it } from 'vitest'
import { FACING } from '../vehicle/vehiclePose'
import { artefactCacheTile } from '../world/artefactCache'
import { chunkDigest } from '../world/chunkDigest'
import { planetParamsFor } from '../world/planetParams'
import { chunkOfTile, type TilePoint } from '../world/tileGrid'
import { currentDensityOfChunk, currentCellsOfChunk } from '../world/worldState'
import type { CommandIntent } from './authorityCommand'
import { canOpenArtefactCache } from './artefactRules'
import type { DomainEvent } from './domainEvent'
import { cacheStateOf } from './heldArtefact'
import { readSaveSlot, saveSlotOf } from '../save/saveSlot'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { stateDigest } from './stateDigest'
import {
  createScriptedSession,
  drill,
  FREEZE_ENEMIES,
  PARAMS,
  typesOf,
  WORLD_SEED,
  type ScriptedSession,
} from './scriptedSession'

const CACHE = artefactCacheTile(PARAMS)
const open = { type: 'openArtefactCache', payload: {} } as const
const choose = (optionId: string) => ({ type: 'chooseArtefact', payload: { optionId } }) as const
const setArtefact = (optionId: string) =>
  ({ type: 'debug.setArtefact', payload: { optionId } }) as const
const setPlanet = (planetIndex: number) =>
  ({ type: 'debug.setPlanet', payload: { planetIndex } }) as const
const dock = { type: 'dock', payload: { bay: 'sell' } } as const

/** The vehicle's centre on a tile's centre, at rest, facing down. */
function poseOn(tile: TilePoint, offset = { dx: 0, dy: 0 }): CommandIntent<'reportPose'> {
  return {
    type: 'reportPose',
    payload: {
      x: tile.tx * 1000 + 500 + offset.dx,
      y: tile.ty * 1000 + 500 + offset.dy,
      vx: 0,
      vy: 0,
      upx: 0,
      upy: 1024,
      facing: FACING.down,
      driving: false,
      thrusting: false,
      drilling: false,
      thrustTicks: 0,
      driveTicks: 0,
      drillTicks: 0,
    },
  }
}

const rejectionOf = (events: readonly DomainEvent[]) =>
  events[0].type === 'CommandRejected' ? events[0].reason : null

const heldOf = (session: ScriptedSession) => session.state().players.p1.artefact

/** A session whose vehicle sits on the planet-1 cache, undocked. */
function sessionAtCache(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(1, FREEZE_ENEMIES)
  session.submit(2, poseOn(CACHE))
  return session
}

function cacheChunkDigest(session: ScriptedSession, tile: TilePoint): string {
  const params = planetParamsFor(WORLD_SEED, session.state().planet.index)
  const [cx, cy] = [chunkOfTile(tile.tx), chunkOfTile(tile.ty)]
  return chunkDigest({
    cells: currentCellsOfChunk(session.state().world, params, cx, cy),
    density: currentDensityOfChunk(session.state().world, params, cx, cy),
  })
}

describe('opening the artefact cache (#46)', () => {
  it('opens the live cache for an undocked vehicle over it, and changes nothing else', () => {
    const session = sessionAtCache()
    const before = session.state()
    expect(session.submit(3, open)).toMatchObject([
      { type: 'ArtefactCacheOpened', tx: CACHE.tx, ty: CACHE.ty },
    ])
    expect(heldOf(session)).toBeNull()
    expect(session.state().world).toBe(before.world)
  })

  it('opens it again after the cards were closed without a pick', () => {
    const session = sessionAtCache()
    session.submit(3, open)
    expect(typesOf(session.submit(4, open))).toEqual(['ArtefactCacheOpened'])
  })

  it('refuses to open the cache from a tile away', () => {
    const session = sessionAtCache()
    session.submit(3, poseOn(CACHE, { dx: 1000, dy: 0 }))
    expect(rejectionOf(session.submit(4, open))).toBe('out_of_reach')
  })

  it('opens it with the body still overlapping the cell edge', () => {
    const session = sessionAtCache()
    session.submit(3, poseOn(CACHE, { dx: 900, dy: -900 }))
    expect(typesOf(session.submit(4, open))).toEqual(['ArtefactCacheOpened'])
  })

  it('refuses to open the cache while docked', () => {
    const session = createScriptedSession()
    session.submit(1, dock)
    expect(rejectionOf(session.submit(2, open))).toBe('vehicle_not_active')
  })
})

describe('choosing an artefact (#46)', () => {
  it('holds the pick, logs artefact_chosen once and makes the cache inert to that player', () => {
    const session = sessionAtCache()
    session.submit(3, open)
    expect(session.submit(4, choose('artefact.assay_beacon'))).toMatchObject([
      { type: 'ArtefactChosen', optionId: 'artefact.assay_beacon' },
    ])
    expect(heldOf(session)).toEqual({
      id: 'artefact.assay_beacon',
      fromPlanet: 1,
      breathingRoomCharges: 0,
    })
    expect(rejectionOf(session.submit(5, open))).toBe('artefact_unavailable')
    expect(rejectionOf(session.submit(6, choose('artefact.ore_whisper')))).toBe(
      'artefact_unavailable',
    )
    const chosen = session.events().filter((event) => event.type === 'ArtefactChosen')
    expect(chosen).toHaveLength(1)
    expect(heldOf(session)?.id).toBe('artefact.assay_beacon')
  })

  it('starts breathing_room with its brace ready', () => {
    const session = sessionAtCache()
    session.submit(3, choose('artefact.breathing_room'))
    expect(heldOf(session)?.breathingRoomCharges).toBe(1)
  })

  it('refuses an id that is not one of the three options', () => {
    const session = sessionAtCache()
    expect(rejectionOf(session.submit(3, choose('powerup.drill_haste')))).toBe('unknown_artefact')
    expect(heldOf(session)).toBeNull()
  })

  it('reads chosen on the planet it came from and inert elsewhere, available while none is held', () => {
    expect(cacheStateOf(null, 2)).toBe('available')
    const held = { id: 'artefact.ore_whisper' as const, fromPlanet: 1, breathingRoomCharges: 0 }
    expect(cacheStateOf(held, 1)).toBe('chosen')
    expect(cacheStateOf(held, 2)).toBe('inert')
  })

  it('puts the held artefact in the digest and brings it back from a snapshot', () => {
    const session = sessionAtCache()
    const before = stateDigest(session.state())
    session.submit(3, choose('artefact.ore_whisper'))
    expect(stateDigest(session.state())).not.toBe(before)
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    expect('state' in restored && restored.state.players.p1.artefact).toEqual(heldOf(session))
  })

  it('writes the held artefact into the checkpoint profile and reads it back', () => {
    const session = sessionAtCache()
    session.submit(3, choose('artefact.breathing_room'))
    const file = JSON.parse(JSON.stringify(saveSlotOf(takeSnapshot(session.state()), 1)))
    expect(file.profile.players.p1.artefact).toEqual(heldOf(session))
    const read = readSaveSlot(file)
    expect('state' in read && read.state.players.p1.artefact).toEqual(heldOf(session))
  })

  it('keeps the artefact through docking and moving to planet 2', () => {
    const session = sessionAtCache()
    session.submit(3, choose('artefact.breathing_room'))
    session.submit(4, setPlanet(2))
    session.submit(5, dock)
    expect(heldOf(session)).toEqual({
      id: 'artefact.breathing_room',
      fromPlanet: 1,
      breathingRoomCharges: 1,
    })
  })
})

describe('the planet 2 cache (#46 amendments)', () => {
  const planet2 = planetParamsFor(WORLD_SEED, 2)
  const cache2 = artefactCacheTile(planet2)

  it('is inert to a player who already holds an artefact: interact submits nothing that applies', () => {
    const session = sessionAtCache()
    session.submit(3, choose('artefact.ore_whisper'))
    session.submit(4, setPlanet(2))
    session.submit(5, poseOn(cache2))
    expect(canOpenArtefactCache(session.state(), 'p1')).toBe(false)
    expect(rejectionOf(session.submit(6, open))).toBe('artefact_unavailable')
  })

  it('is live on planet 2 when planet 1 was skipped', () => {
    const session = createScriptedSession()
    session.submit(1, setPlanet(2))
    session.submit(2, FREEZE_ENEMIES)
    session.submit(3, poseOn(cache2))
    expect(canOpenArtefactCache(session.state(), 'p1')).toBe(true)
  })

  it('has the same chunk digest whether or not the player holds an artefact', () => {
    const holding = createScriptedSession()
    holding.submit(1, setArtefact('artefact.assay_beacon'))
    holding.submit(2, setPlanet(2))
    const empty = createScriptedSession()
    empty.submit(1, setPlanet(2))
    expect(cacheChunkDigest(holding, cache2)).toBe(cacheChunkDigest(empty, cache2))
  })
})

describe('drilling the cache cell (#46)', () => {
  it('breaks like rock and yields nothing', () => {
    const session = createScriptedSession()
    session.submit(1, FREEZE_ENEMIES)
    session.submit(1, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_tip', level: 40 } })
    session.submit(1, {
      type: 'debug.setUpgrade',
      payload: { upgradeId: 'drill_power', level: 80 },
    })
    session.submit(2, poseOn({ tx: CACHE.tx, ty: CACHE.ty + 1 }))
    const events = session.submit(200, drill(CACHE, 120))
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'TileDestroyed', tx: CACHE.tx, ty: CACHE.ty }),
    )
    expect(typesOf(events)).not.toContain('CargoAdded')
  })
})

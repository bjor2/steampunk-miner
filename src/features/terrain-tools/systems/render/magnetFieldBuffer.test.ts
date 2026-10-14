import { describe, expect, it } from 'vitest'
import { buildWeakTunnel } from '../../../../systems/authority/collapse/collapseFixtures'
import { setVehicleLoadoutCommand } from '../../../../systems/authority/loadoutCommands'
import { createScriptedSession } from '../../../../systems/authority/scriptedSession'
import { blockOfId, type CollapseBlock } from '../../../../systems/world/collapseBlock'
import { FACING } from '../../../../systems/vehicle/vehiclePose'
import { buriedTile, press, sessionWith, standAt } from '../../terrainTestSession'
import { LODE_CLAMP_ID } from '../lodeClamp'
import { LODESTONE_BEACON_ID } from '../lodestoneBeacon'
import { createHeardMagnetFields } from './heardMagnetFields'
import { MAGNET_FIELD_CAP } from './magnetFieldBudget'
import { createMagnetFieldBuffer, writeMagnetFields } from './magnetFieldBuffer'
import { MAGNET_FIELD_LOOK, magnetFieldLookProblems } from './magnetFieldLook'
import { piecesOfMagnetField } from './magnetFieldPieces'
import { createMagnetFieldWatch, refreshMagnetFields } from './magnetFieldRefresh'
import { piecesOfField, type MagnetField } from './magnetFields'

// The magnet fields' one buffer (TD ruling on #286 Q1): allocated once at 40 pieces, sized for one
// player's capped full set of 34, written again only when a field changes, the local player's
// fields first and whatever does not fit dropped.

const LOOK = MAGNET_FIELD_LOOK
const TIMING = { startTick: 0, growTicks: 0, brightFromTick: 0, endTick: 600 }
const RULED_CAP = 40
const ONE_PLAYERS_FULL_SET = 34

function beaconField(playerId: string, x: number): MagnetField {
  return { kind: 'attract', playerId, centre: { x, y: 0 }, radiusM: 16, timing: TIMING }
}

function waveField(playerId: string, x: number): MagnetField {
  return { kind: 'repel', playerId, centre: { x, y: 0 }, radiusM: 4, timing: TIMING }
}

/** The clamp at its most: 8 pinned cells, and the 9 blocks of a 3x3 ring braced. */
function fullClampField(playerId: string): MagnetField {
  const cells = Array.from({ length: 8 }, (_, at) => ({ tx: at % 3, ty: Math.floor(at / 3) }))
  const blocks = Array.from({ length: 9 }, (_, at) => blockOfId(`0,0#${at}`) as CollapseBlock)
  return { kind: 'anchor', playerId, cells, blocks, timing: TIMING }
}

function fullSetOf(playerId: string, x: number): MagnetField[] {
  return [beaconField(playerId, x), waveField(playerId, x), fullClampField(playerId)]
}

describe('magnet field buffer', () => {
  it('fits one player’s full capped set of 34 pieces under the ruled 40', () => {
    const pieces = fullSetOf('p1', 0).reduce((sum, field) => sum + piecesOfField(field), 0)
    expect(pieces).toBe(ONE_PLAYERS_FULL_SET)
    expect(MAGNET_FIELD_CAP).toBe(RULED_CAP)
    const buffer = createMagnetFieldBuffer()
    writeMagnetFields(buffer, fullSetOf('p1', 0), 0)
    expect(buffer.pieceCount).toBe(ONE_PLAYERS_FULL_SET)
  })

  it('draws each field in the pieces it counts, none longer than a piece holds', () => {
    for (const field of fullSetOf('p1', 0)) {
      const pieces = piecesOfMagnetField(field)
      expect(pieces).toHaveLength(piecesOfField(field))
      expect(pieces.every((piece) => piece.length <= LOOK.segmentsPerPiece)).toBe(true)
    }
  })

  it('curls the beacon’s arcs in from its rim onto the beacon', () => {
    const arcs = piecesOfMagnetField(beaconField('p1', 10))
    for (const arc of arcs) {
      const rim = arc[0].from
      const end = arc.at(-1)?.to ?? rim
      expect(Math.hypot(rim.x - 10, rim.y)).toBeCloseTo(16)
      expect(Math.hypot(end.x - 10, end.y)).toBeCloseTo(0)
    }
  })

  it('rings the wave at its radius and flares past it', () => {
    const [ring, ...flares] = piecesOfMagnetField(waveField('p1', 0))
    expect(ring.every((segment) => Math.hypot(segment.from.x, segment.from.y) - 4 < 1e-9)).toBe(
      true,
    )
    expect(flares).toHaveLength(LOOK.repel.flares)
    for (const flare of flares) {
      const end = flare.at(-1)?.to ?? flare[0].from
      expect(Math.hypot(end.x, end.y)).toBeGreaterThan(4)
    }
  })

  it('keeps each lattice inside its pinned cell', () => {
    const field = fullClampField('p1')
    if (field.kind !== 'anchor') throw new Error('not a clamp')
    const lattices = piecesOfMagnetField(field).slice(0, field.cells.length)
    lattices.forEach((lattice, at) => {
      const cell = field.cells[at]
      const ends = lattice.flatMap((segment) => [segment.from, segment.to])
      expect(ends.every((end) => end.x > cell.tx && end.x < cell.tx + 1)).toBe(true)
      expect(ends.every((end) => end.y > cell.ty && end.y < cell.ty + 1)).toBe(true)
    })
  })

  it('takes the fields in order and drops a field that does not fit, never part of one', () => {
    const buffer = createMagnetFieldBuffer()
    const fields = [...fullSetOf('p1', 0), waveField('p2', 5), beaconField('p3', 9)]
    writeMagnetFields(buffer, fields, 0)
    expect(buffer.drawn.map((field) => [field.playerId, field.kind])).toEqual([
      ['p1', 'attract'],
      ['p1', 'repel'],
      ['p1', 'anchor'],
    ])
    expect(buffer.pieceCount).toBe(ONE_PLAYERS_FULL_SET)
    writeMagnetFields(buffer, [beaconField('p1', 0), ...fields.slice(3)], 0)
    expect(buffer.drawn.map((field) => field.playerId)).toEqual(['p1', 'p2', 'p3'])
  })

  it('writes ticks after the rebuild’s epoch, so a float holds them in a long session', () => {
    const buffer = createMagnetFieldBuffer()
    const late = {
      startTick: 50_000_000,
      growTicks: 6,
      brightFromTick: 50_000_000,
      endTick: 50_000_030,
    }
    writeMagnetFields(buffer, [{ ...waveField('p1', 0), timing: late }], 50_000_000)
    expect(Array.from(buffer.timing.slice(0, 3))).toEqual([0, 0, 30])
  })

  it('refuses a look file with a broken number', () => {
    expect(magnetFieldLookProblems(LOOK)).toEqual([])
    expect(magnetFieldLookProblems({ ...LOOK, rampTicks: 0 })).toEqual([
      'rampTicks must be a whole number above 0',
    ])
  })
})

describe('magnet field refresh', () => {
  it('rebuilds only when a field changes, never reallocating its buffer', () => {
    const session = sessionWith({ 'powerup.1': LODESTONE_BEACON_ID })
    standAt(session, 5, buriedTile(12), FACING.right)
    session.advanceTo(8)
    const buffer = createMagnetFieldBuffer()
    const { positions, timing, levels, grow } = buffer
    const heard = createHeardMagnetFields()
    const watch = createMagnetFieldWatch()
    const refreshAt = (view = { x: 0, y: 0 }) =>
      refreshMagnetFields(buffer, heard, watch, {
        state: session.state(),
        localPlayerId: 'p1',
        view,
      })
    expect(refreshAt()).toBe(true)
    expect(buffer.pieceCount).toBe(0)
    session.advanceTo(9)
    expect(refreshAt()).toBe(false)
    session.submit(10, press())
    session.advanceTo(12)
    expect(refreshAt()).toBe(true)
    expect(buffer.drawn.map((field) => field.kind)).toEqual(['attract'])
    session.advanceTo(30)
    expect(refreshAt()).toBe(false)
    expect(refreshAt({ x: 100, y: 0 })).toBe(true)
    expect([buffer.positions, buffer.timing, buffer.levels, buffer.grow]).toEqual([
      positions,
      timing,
      levels,
      grow,
    ])
    expect(buffer.positions).toBe(positions)
  })

  it('holds a clamp field without rebuilding while its tank draws each tick', () => {
    const session = createScriptedSession()
    session.submit(0, setVehicleLoadoutCommand({ 'powerup.1': LODE_CLAMP_ID }))
    buildWeakTunnel(session, 10)
    session.submit(20, press())
    session.advanceTo(40)
    const buffer = createMagnetFieldBuffer()
    const heard = createHeardMagnetFields()
    const watch = createMagnetFieldWatch()
    const frame = () => ({ state: session.state(), localPlayerId: 'p1', view: { x: 0, y: 0 } })
    expect(refreshMagnetFields(buffer, heard, watch, frame())).toBe(true)
    expect(buffer.drawn.map((field) => field.kind)).toEqual(['anchor'])
    const rebuilds = buffer.rebuilds
    for (let tick = 41; tick <= 60; tick += 1) {
      session.advanceTo(tick)
      refreshMagnetFields(buffer, heard, watch, frame())
    }
    expect(buffer.rebuilds).toBe(rebuilds)
  })
})

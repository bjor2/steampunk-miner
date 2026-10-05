import { describe, expect, it } from 'vitest'
import { FACING, dockedPoseAt } from '../../vehicle/vehiclePose'
import { chunkRangeOfDisc, type TilePoint } from '../../world/tileGrid'
import type { CommandIntent } from '../authorityCommand'
import type { DomainEvent } from '../domainEvent'
import { takeSnapshot } from '../sessionSnapshot'
import { createScriptedSession, PARAMS, SITE, type ScriptedSession } from '../scriptedSession'
import { poseAt, prepareCorridor, setUpgrade, spawnEnemy } from './combatFixtures'
import { spawnPointsOfChunk, type SpawnPoint } from './spawnPoints'

const dock: CommandIntent = { type: 'dock', payload: {} }
const undock: CommandIntent = { type: 'undock', payload: {} }
const atDock: CommandIntent = {
  ...poseAt({ tx: 0, ty: 0 }, { facing: FACING.right }),
  payload: {
    ...poseAt({ tx: 0, ty: 0 }, { facing: FACING.right }).payload,
    ...dockedPoseAt(SITE),
  },
} as CommandIntent

/** A crawler spawn point of planet 1, far enough from the pad that the dock never wakes it. */
function crawlerPoint(): SpawnPoint {
  const { min, max } = chunkRangeOfDisc(PARAMS.radiusTiles)
  for (let cy = min; cy <= 0; cy++) {
    for (let cx = min; cx <= max; cx++) {
      const point = spawnPointsOfChunk(PARAMS, cx, cy).find((found) => found.kind === 'crawler')
      if (point !== undefined) return point
    }
  }
  throw new Error('no crawler spawn point')
}

/** `tiles` from the point toward the planet's centre, so the spot is inside the disc. */
function towardCentre(point: SpawnPoint, tiles: number): TilePoint {
  return { tx: point.tile.tx, ty: point.tile.ty + (point.tile.ty < 0 ? tiles : -tiles) }
}

const spawnedFrom = (events: readonly DomainEvent[], pointId: string) =>
  events.filter((event) => event.type === 'EnemySpawned' && event.spawnPointId === pointId)

function visit(session: ScriptedSession, tick: number, tile: TilePoint): DomainEvent[] {
  session.submit(tick, poseAt(tile, { facing: FACING.right }))
  return session.advanceTo(tick + 13)
}

describe('combat: spawning and the cap (#9, #25 acceptance 7)', () => {
  const point = crawlerPoint()

  it('wakes a spawn point when a vehicle comes within 24 tiles, not at 25', () => {
    const near = createScriptedSession()
    visit(near, 10, towardCentre(point, 23))
    expect(spawnedFrom(near.events(), point.id)).toHaveLength(1)
    const far = createScriptedSession()
    visit(far, 10, towardCentre(point, 25))
    expect(spawnedFrom(far.events(), point.id)).toEqual([])
  })

  it('despawns an enemy whose vehicle is more than 48 tiles away', () => {
    const session = createScriptedSession()
    visit(session, 10, towardCentre(point, 23))
    const [spawned] = spawnedFrom(session.events(), point.id)
    const events = visit(session, 100, towardCentre(point, 72))
    const enemyId = spawned.type === 'EnemySpawned' ? spawned.enemyId : ''
    expect(events).toContainEqual(expect.objectContaining({ type: 'EnemyDespawned', enemyId }))
  })

  it('never has more than 6 enemies per vehicle and refuses a seventh spawnEnemy', () => {
    const session = createScriptedSession()
    visit(session, 10, towardCentre(point, 40))
    for (let index = 0; index < 6; index++) {
      session.submit(30, spawnEnemy('crawler', 1, 0, index - 3))
    }
    expect(session.state().combat.enemies).toHaveLength(6)
    const [refused] = session.submit(40, spawnEnemy('crawler', 1, 2))
    expect(refused).toMatchObject({ type: 'CommandRejected', reason: 'enemy_cap' })
    visit(session, 50, towardCentre(point, 5))
    expect(session.state().combat.enemies.length).toBeLessThanOrEqual(6)
    expect(spawnedFrom(session.events(), point.id)).toEqual([])
  })

  it('keeps a killed enemy dead for the trip, and a dock frees its spawn point', () => {
    const session = createScriptedSession()
    session.submit(1, setUpgrade('drill_power', 60))
    const besidePoint = { tx: point.tile.tx - 1, ty: point.tile.ty }
    visit(session, 10, besidePoint)
    session.advanceTo(200)
    expect(session.state().combat.usedSpawnPointIds).toContain(point.id)
    visit(session, 300, towardCentre(point, 72))
    visit(session, 400, besidePoint)
    expect(spawnedFrom(session.events(), point.id)).toHaveLength(1)

    session.submit(500, atDock)
    session.submit(500, dock)
    expect(session.state().combat).toMatchObject({ enemies: [], usedSpawnPointIds: [] })
    expect(takeSnapshot(session.state()).state.combat.enemies).toEqual([])
    session.submit(510, undock)
    visit(session, 520, besidePoint)
    expect(spawnedFrom(session.events(), point.id)).toHaveLength(2)
  })

  it('forgets the last hit at a dock, so no hit grace carries into the next trip', () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.left)
    session.submit(start, spawnEnemy('crawler', 1, 3))
    session.advanceTo(start + 80)
    expect(session.state().combat.vehicles.p1.lastHitTick).not.toBeNull()

    session.submit(start + 81, atDock)
    session.submit(start + 81, dock)
    expect(session.state().combat.vehicles.p1.lastHitTick).toBeNull()
  })
})

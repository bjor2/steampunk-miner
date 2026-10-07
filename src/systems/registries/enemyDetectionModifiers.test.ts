import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { prepareCorridor, spawnEnemy } from '../authority/combat/combatFixtures'
import { createScriptedSession } from '../authority/scriptedSession'
import { stateDigest } from '../authority/stateDigest'
import { enemyBoundedStats } from '../economy/enemyStats'
import { FACING } from '../vehicle/vehiclePose'

// A slice's smoke shrinks how far an enemy notices the vehicle, never below half (ticket 233, the
// GD lock on #204); fake slices register through withRegistrations, so no real slice is imported.

/** A slice whose modifier answers `scaleBp` for every enemy, every tick. */
function smokeSlice(id: string, scaleBp: number): SliceDefinition {
  return {
    id,
    register: (r) =>
      r.enemyDetectionModifier({ id: `${id}.smoke`, detectionScaleBpOf: () => scaleBp }),
  }
}

const CRAWLER_TIER = 1

/** Tiles from the vehicle to the crawler: inside its full reach, outside half of it. */
const SPAWN_TILES = Math.floor((enemyBoundedStats('crawler', CRAWLER_TIER).detectionTiles * 3) / 4)

/** The crawler's phase a second after it spawns in the corridor, `SPAWN_TILES` ahead. */
function crawlerAfterASecondWith(slices: readonly SliceDefinition[]) {
  return withRegistrations(slices, () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.left)
    session.submit(start, spawnEnemy('crawler', CRAWLER_TIER, SPAWN_TILES))
    session.advanceTo(start + 60)
    return { phase: session.state().combat.enemies[0].phase, digest: stateDigest(session.state()) }
  })
}

describe('enemy detection modifiers', () => {
  it('lets a crawler inside its reach hunt with nothing registered', () => {
    expect(crawlerAfterASecondWith([]).phase).not.toBe('idle')
  })

  it('plays exactly as before under a modifier that keeps the whole reach', () => {
    expect(crawlerAfterASecondWith([smokeSlice('clear-air', 10000)])).toEqual(
      crawlerAfterASecondWith([]),
    )
  })

  it('keeps the crawler idle when smoke halves its reach and the vehicle is beyond that', () => {
    expect(crawlerAfterASecondWith([smokeSlice('smoke', 5000)]).phase).toBe('idle')
  })

  it('never shrinks the reach below half, however thick the smoke', () => {
    const thick = crawlerAfterASecondWith([smokeSlice('smoke-a', 0), smokeSlice('smoke-b', 0)])
    expect(thick).toEqual(crawlerAfterASecondWith([smokeSlice('smoke', 5000)]))
  })
})

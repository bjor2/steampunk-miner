import { describe, expect, it } from 'vitest'
import { enemyIconIdOf } from '../../../systems/art/icons/iconSet'
import {
  freezeEnemies,
  prepareCorridor,
  spawnEnemy,
} from '../../../systems/authority/combat/combatFixtures'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { periscopeWarningsOf } from './threatPeriscope'

// The threat periscope (#162 Sensing row, 4.4): every enemy within its radius, telegraphing or not,
// with its family icon, compass octant and a distance band, and a burrower as a dust trail.

const RADIUS = 10

/** A miner in the planet 1 corridor with frozen enemies `dx` tiles to its right, in that order. */
function minerWithEnemiesAt(spawns: readonly (readonly [string, number])[]) {
  const session = createScriptedSession()
  const start = prepareCorridor(session, FACING.right)
  session.submit(start, freezeEnemies(true))
  spawns.forEach(([kind, dx]) => session.submit(start, spawnEnemy(kind, 1, dx)))
  return session.state()
}

describe('threat periscope', () => {
  it('bands enemies near, mid and far by thirds of its radius, nearest first', () => {
    const state = minerWithEnemiesAt([
      ['crawler', 9],
      ['crawler', 2],
      ['crawler', 5],
    ])
    expect(periscopeWarningsOf(state, 'p1', RADIUS).map((warning) => warning.band)).toEqual([
      'near',
      'mid',
      'far',
    ])
  })

  it('warns of no enemy beyond its radius', () => {
    const state = minerWithEnemiesAt([['crawler', 13]])
    expect(periscopeWarningsOf(state, 'p1', RADIUS)).toEqual([])
    expect(periscopeWarningsOf(state, 'p1', 20)).toHaveLength(1)
  })

  it('warns of an idle enemy that is not telegraphing yet', () => {
    const state = minerWithEnemiesAt([['crawler', 6]])
    expect(state.combat.enemies[0].phase).not.toBe('windup')
    expect(periscopeWarningsOf(state, 'p1', RADIUS)).toHaveLength(1)
  })

  it("carries the family's icon and the octant to its right on the compass", () => {
    const [warning] = periscopeWarningsOf(minerWithEnemiesAt([['crawler', 4]]), 'p1', RADIUS)
    expect(warning).toMatchObject({ kind: 'crawler', iconId: enemyIconIdOf('crawler'), octant: 2 })
  })

  it('shows a burrower as a dust trail and nothing else as one', () => {
    const state = minerWithEnemiesAt([
      ['burrower', 3],
      ['crawler', 6],
    ])
    expect(periscopeWarningsOf(state, 'p1', RADIUS).map((w) => [w.kind, w.isDustTrail])).toEqual([
      ['burrower', true],
      ['crawler', false],
    ])
  })

  it('warns of nothing before the miner reports a pose', () => {
    expect(periscopeWarningsOf(createScriptedSession().state(), 'p1', RADIUS)).toEqual([])
  })
})

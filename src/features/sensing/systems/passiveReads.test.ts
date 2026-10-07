import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import {
  freezeEnemies,
  prepareCorridor,
  spawnEnemy,
} from '../../../systems/authority/combat/combatFixtures'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { NO_PASSIVE_READS, passiveReadsOf } from './passiveReads'

// The passives on while owned (#162 2.1), each at the reach of the Mark researched (#249, the GD
// rounding rule on #203): the periscope's 10 tiles as bought are 12 at Mark 2.

const PASSIVES = ['passive.threat_periscope', 'passive.assay_lens', 'passive.hazard_barometer']

/** A miner in the planet 1 corridor owning `owned`, a frozen crawler 11 tiles to its right. */
function minerOwning(owned: readonly string[], researchedThrough: number | null = null) {
  const session = createScriptedSession()
  const start = prepareCorridor(session, FACING.right)
  session.submit(start, freezeEnemies(true))
  session.submit(start, spawnEnemy('crawler', 1, 11))
  session.submit(start, setVehicleLoadoutCommand({}, owned))
  if (researchedThrough !== null) {
    session.submit(start, {
      type: 'debug.tech-tree.unlockThrough',
      payload: { planetIndex: researchedThrough },
    } as CommandIntent)
  }
  return session.state()
}

describe('sensing passive reads', () => {
  it('reads nothing for a player who owns none of the passives', () => {
    expect(passiveReadsOf(minerOwning([]), 'p1')).toEqual(NO_PASSIVE_READS)
  })

  it('reads each passive the player owns, and only those', () => {
    const reads = passiveReadsOf(minerOwning(['passive.assay_lens']), 'p1')
    expect(reads.lens).not.toBeNull()
    expect(reads.periscope).toBeNull()
    expect(reads.barometer).toBeNull()
  })

  it('misses a crawler 11 tiles off as bought and sees it at Mark 2’s 12 tiles', () => {
    expect(passiveReadsOf(minerOwning(PASSIVES), 'p1').periscope).toEqual([])
    // Unlocked at P5, Mark 2 comes at P8 (#161 cadence).
    const marked = passiveReadsOf(minerOwning(PASSIVES, 8), 'p1').periscope
    expect(marked?.map((warning) => warning.kind)).toEqual(['crawler'])
  })
})

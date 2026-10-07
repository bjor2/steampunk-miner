import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import {
  freezeEnemies,
  prepareCorridor,
  spawnEnemy,
} from '../../../systems/authority/combat/combatFixtures'
import { reportAt } from '../../../systems/authority/lava/lavaFixtures'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { createScriptedSession, FREEZE_ENEMIES } from '../../../systems/authority/scriptedSession'
import { magneticFieldHolding } from '../../../systems/registries/magneticGround'
import { planetParamsFor } from '../../../systems/world/planetParams'
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

/** Planet 25 of seed 83921: a tile inside the band-1 field round the vein at -20,831 (#258). */
const MAGNETIC_PLANET = 25
const IN_FIELD = { x: -20 * 1000 + 500, y: 836 * 1000 + 500 }
/** Nine tiles above that field, outside every field. */
const OFF_FIELD = { x: -20 * 1000 + 500, y: 845 * 1000 + 500 }

/**
 * A periscope owner on planet 25 at `at`, a frozen crawler 7 tiles to its right: inside the
 * 10-tile reach as bought, outside the 5 a field leaves it.
 */
function periscopeOnMagneticPlanet(at: { x: number; y: number }) {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: MAGNETIC_PLANET } })
  session.submit(0, FREEZE_ENEMIES)
  session.submit(12, reportAt(at))
  session.submit(12, spawnEnemy('crawler', 1, 7))
  session.submit(12, setVehicleLoadoutCommand({}, ['passive.threat_periscope']))
  return session.state()
}

describe('sensing passive reads', () => {
  it('halves a passive’s reach inside a magnetic field (spec #258, ticket 290)', () => {
    const params = planetParamsFor(83921, MAGNETIC_PLANET)
    expect(magneticFieldHolding(params, { tx: -20, ty: 836 })).not.toBeNull()
    expect(magneticFieldHolding(params, { tx: -20, ty: 845 })).toBeNull()
    const offField = passiveReadsOf(periscopeOnMagneticPlanet(OFF_FIELD), 'p1').periscope
    expect(offField?.map((warning) => warning.kind)).toEqual(['crawler'])
    expect(passiveReadsOf(periscopeOnMagneticPlanet(IN_FIELD), 'p1').periscope).toEqual([])
  })

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

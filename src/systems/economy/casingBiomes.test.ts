import { describe, expect, it } from 'vitest'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import { liningRowIdOf } from '../vehicle/liningType'
import { biomeOfPlanet } from './casingGrades'
import { ECONOMY } from './economy'
import { STANDARD_LINING_TYPE } from './heatEconomy'

// Ticket 829, the HS lining conditions (GD re-lock): a lining is a trim that follows its biome, and
// its debut row (P8 refractory, P17 insulated, P25 grounded) is the first planet that biome
// appears on. A biome never generates before its lining row's planet; moving one earlier is a named
// re-pin of that row, never a quiet data change.

function planetOfRow(rowId: string): number | undefined {
  return LOCKED_SCHEDULE.rows.find((row) => row.id === rowId)?.planetIndex
}

const BIOMES_WITH_LINING = ECONOMY.archetypes.filter(
  (biome) => biome.liningType !== STANDARD_LINING_TYPE,
)

describe('casing biomes and their linings (ticket 829)', () => {
  it('lists every biome with a lining it needs', () => {
    expect(BIOMES_WITH_LINING.map(({ id, liningType }) => [id, liningType])).toEqual([
      ['heat', 'refractory'],
    ])
  })

  it.each(BIOMES_WITH_LINING.map((biome) => [biome.id, biome] as const))(
    'never generates the %s biome before its lining row planet',
    (_, biome) => {
      const debut = planetOfRow(liningRowIdOf(biome.liningType))
      expect(debut).toBeDefined()
      expect(biome.planets.first).toBeGreaterThanOrEqual(debut ?? Number.MAX_SAFE_INTEGER)
      expect(biomeOfPlanet(biome.planets.first - 1)?.id).not.toBe(biome.id)
    },
  )

  it('keeps every biome delta 0 or 1, as the data reader refuses any other', () => {
    expect(
      ECONOMY.archetypes.every(({ casingBiomeDelta }) => [0, 1].includes(casingBiomeDelta)),
    ).toBe(true)
  })
})

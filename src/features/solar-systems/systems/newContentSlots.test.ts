import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../../../systems/economy/economy'
import { LOCKED_SCHEDULE } from '../../../systems/unlocks/unlockSchedule'
import { MATERIALS } from '../../materials'
import { ORE_ROWS, oreFamilies } from '../../ores'
import { planetsPerSystem } from './newContentSlots'
import { ARCHETYPE_PALETTE } from './paletteRows'

// The SS2-B new-content set (HS-1 on ticket 775; completed by ticket 780): a family the first solar
// system never had, by id and by name, against every enemy kind, hazard kind, ore family, species
// and schedule row the campaign already names. The behaviour level of the same check, with each
// row's "Never" column, is familyBehaviours.test.ts.

const FAMILIES = ARCHETYPE_PALETTE.newContent.families

function normalised(text: string): string {
  return text.toLowerCase().replace(/[\s_-]+/g, '')
}

/** Every id and display name the first system's content already uses, normalised. */
function firstSystemWords(): Set<string> {
  const enemies = ECONOMY.enemies.kinds.flatMap((kind) => [kind.id])
  const metalEnemies = Object.keys(ECONOMY.enemies.metal)
  const hazards = Object.keys(ORE_ROWS.planets.hazards)
  const families = oreFamilies().flatMap((family) => [family.id, family.name])
  const species = MATERIALS.materials.flatMap((material) => [material.id, material.name])
  const rows = LOCKED_SCHEDULE.rows.flatMap((row) => [row.id, row.name])
  return new Set(
    [...enemies, ...metalEnemies, ...hazards, ...families, ...species, ...rows].map(normalised),
  )
}

describe('new-content slots', () => {
  it('holds a family for every planet of system 2, of all three kinds', () => {
    expect(FAMILIES.length).toBeGreaterThanOrEqual(5)
    expect(FAMILIES.length).toBe(planetsPerSystem())
    expect(new Set(FAMILIES.map((family) => family.kind))).toEqual(
      new Set(['enemy', 'hazard', 'ore_family']),
    )
  })

  it('names no family the first solar system already has, by id or by name', () => {
    const taken = firstSystemWords()
    const recoloured = FAMILIES.filter(
      (family) => taken.has(normalised(family.id)) || taken.has(normalised(family.name)),
    )
    expect(recoloured).toEqual([])
    expect(taken.has(normalised('emp_mite'))).toBe(true)
  })

  it('pins the SS2-B rows as Progression wrote them, each with its one rig part on an attach point', () => {
    expect(
      FAMILIES.map((family) => [
        family.id,
        family.kind,
        family.rigPart.name,
        family.rigPart.attach,
      ]),
    ).toEqual([
      ['vent_flare', 'hazard', 'Flare shroud', 'drill.housing'],
      ['cinder_salt', 'ore_family', 'Quench tank', 'hull.cargo'],
      ['brine_leech', 'enemy', 'Scraper skirt', 'hull.plates'],
      ['ferro_sand_sink', 'hazard', 'Auger guard', 'drill.hood'],
      ['spall_glass', 'ore_family', 'Cutting collar', 'drill.collar'],
    ])
  })

  it("refuses Progression's Void glass, a recolour of the exotic family Voidglass; spall glass replaces it", () => {
    const taken = firstSystemWords()
    expect(taken.has(normalised('Void glass'))).toBe(true)
    expect(oreFamilies().find((family) => family.id === 'exotic')?.name).toBe('Voidglass')
    expect(taken.has(normalised('Spall glass'))).toBe(false)
    expect(FAMILIES.find((family) => family.id === 'spall_glass')?.behaviour.effect).toBe(
      'shatter_on_side_cut',
    )
  })
})

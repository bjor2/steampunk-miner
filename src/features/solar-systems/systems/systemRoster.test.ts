import { describe, expect, it } from 'vitest'
import { planetDisplayNameOf } from '../../../systems/registries/planetRow'
import { campaignIndex } from '../../../systems/starMap/campaignIndex'
import { actOf } from '../../planet-mix'
import { planetsPerSystem } from './newContentSlots'
import { ARCHETYPE_PALETTE } from './paletteRows'
import { rosterPlanetOf, systemRosterOf, type RosterPlanet } from './systemRoster'

// A system's roster (ticket 775): every pick drawn from the palette by the address seed, keyed on
// the contiguous campaign index g, deterministic, with ids never names.

const SEED = 20261024
const OTHER_SEED = 42
const COUNT = planetsPerSystem()
const SYSTEMS_2_TO_40 = Array.from({ length: 39 }, (_, at) => BigInt(at + 2))

function rostersOf(seed: number, systems: readonly bigint[]): RosterPlanet[] {
  return systems.flatMap((system) => systemRosterOf(seed, system))
}

function placeOf(planet: RosterPlanet): bigint {
  return BigInt(planet.id.planet)
}

describe('system roster', () => {
  it('draws the same roster on every read, byte for byte, and another under another world seed', () => {
    const once = systemRosterOf(SEED, 2n)
    expect(JSON.stringify(systemRosterOf(SEED, 2n))).toBe(JSON.stringify(once))
    expect(JSON.stringify(systemRosterOf(OTHER_SEED, 2n))).not.toBe(JSON.stringify(once))
  })

  it('keys every planet on its address, with the contiguous campaign index as its number', () => {
    for (const system of [2n, 10n, 1_000_000n]) {
      const roster = systemRosterOf(SEED, system)
      expect(roster.map((planet) => planet.id)).toEqual(
        Array.from({ length: COUNT }, (_, at) => ({
          system: system.toString(),
          planet: `${at + 1}`,
        })),
      )
      for (const planet of roster) {
        const g = campaignIndex(system, placeOf(planet))
        expect(planet.campaignIndex).toBe(g.toString())
        expect(planet.name.endsWith(` ${g}`)).toBe(true)
      }
    }
  })

  it("names each planet <Prefix> <Noun> <g> with a prefix of its act's colour", () => {
    for (const planet of rostersOf(SEED, SYSTEMS_2_TO_40)) {
      const [prefix, noun, number, ...rest] = planet.name.split(' ')
      expect(rest).toEqual([])
      expect(ARCHETYPE_PALETTE.names.prefixesByAct[planet.act]).toContain(prefix)
      expect(ARCHETYPE_PALETTE.names.nouns).toContain(noun)
      expect(number).toBe(planet.campaignIndex)
      expect(planet.name.length).toBeLessThanOrEqual(ARCHETYPE_PALETTE.names.charactersMax)
    }
  })

  it('gives no two planets of systems 2 to 40 one name, and none a name of system 1', () => {
    const names = rostersOf(SEED, SYSTEMS_2_TO_40).map((planet) => planet.name)
    expect(new Set(names).size).toBe(names.length)
    for (const system of SYSTEMS_2_TO_40) {
      const nouns = systemRosterOf(SEED, system).map((planet) => planet.name.split(' ')[1])
      expect(new Set(nouns).size).toBe(nouns.length)
    }
    const systemOne = new Set(Array.from({ length: 400 }, (_, at) => planetDisplayNameOf(at + 1)))
    expect(names.filter((name) => systemOne.has(name))).toEqual([])
  })

  it("wears a look of #141's act at g, walking the act's looks before any repeats", () => {
    for (const system of SYSTEMS_2_TO_40) {
      const roster = systemRosterOf(SEED, system)
      for (const planet of roster) {
        const g = campaignIndex(system, placeOf(planet))
        expect(planet.act).toBe(actOf(Number(g)).id)
        expect(ARCHETYPE_PALETTE.looks.find((look) => look.id === planet.look)?.act).toBe(
          planet.act,
        )
      }
      for (const act of new Set(roster.map((planet) => planet.act))) {
        const worn = roster.filter((planet) => planet.act === act).map((planet) => planet.look)
        const inPalette = ARCHETYPE_PALETTE.looks.filter((look) => look.act === act).length
        expect(new Set(worn).size).toBe(Math.min(worn.length, inPalette))
      }
    }
  })

  it("starts the system's last planet hard and every other planet standard, P1 always", () => {
    for (const planet of rostersOf(SEED, SYSTEMS_2_TO_40)) {
      expect(planet.surface).toBe(placeOf(planet) === BigInt(COUNT) ? 'hard' : 'std')
    }
  })

  it('draws XL only on a standard start and every class somewhere', () => {
    const planets = rostersOf(SEED, SYSTEMS_2_TO_40)
    expect(
      planets.filter((planet) => planet.sizeClass === 'XL').every((p) => p.surface === 'std'),
    ).toBe(true)
    expect(new Set(planets.map((planet) => planet.sizeClass))).toEqual(
      new Set(['S', 'M', 'L', 'XL']),
    )
  })

  it('gives each planet of system 2 its own new family while the set lasts, none twice in the campaign', () => {
    const drawn = rostersOf(SEED, SYSTEMS_2_TO_40).flatMap((planet) => planet.slot ?? [])
    expect(new Set(drawn.map((slot) => slot.id)).size).toBe(drawn.length)
    const systemTwo = systemRosterOf(SEED, 2n).map((planet) => planet.slot?.id ?? null)
    const families = ARCHETYPE_PALETTE.newContent.families.map((family) => family.id)
    expect(systemTwo.filter((slot) => slot === null).length).toBe(COUNT - families.length)
    expect(systemTwo.filter((slot) => slot !== null).sort()).toEqual([...families].sort())
  })

  it('leaves a slot empty, never recoloured, once the set is spent', () => {
    const spent = rostersOf(SEED, [3n, 1_000_000n])
    expect(spent.every((planet) => planet.slot === null)).toBe(true)
  })

  it("fills the ledger hook from the slot's kind: minding a hazard or enemy, else paying", () => {
    for (const planet of systemRosterOf(SEED, 2n)) {
      const look = ARCHETYPE_PALETTE.looks.find((candidate) => candidate.id === planet.look)
      expect(
        planet.hook.startsWith(
          `Entered at folio ${planet.campaignIndex}. Ground: ${look?.groundMotif}.`,
        ),
      ).toBe(true)
      const isMindful = planet.slot !== null && planet.slot.kind !== 'ore_family'
      expect(planet.hook.includes('mind the')).toBe(isMindful)
      if (planet.slot?.kind === 'ore_family')
        expect(planet.hook).toContain(`Pays in ${planet.slot.name.toLowerCase()}.`)
    }
  })

  it('answers one planet by address and refuses system 1 or a place the system lacks', () => {
    expect(rosterPlanetOf(SEED, 2n, 3n)).toEqual(systemRosterOf(SEED, 2n)[2])
    expect(() => rosterPlanetOf(SEED, 1n, 1n)).toThrow(RangeError)
    expect(() => rosterPlanetOf(SEED, 2n, BigInt(COUNT + 1))).toThrow(RangeError)
  })
})

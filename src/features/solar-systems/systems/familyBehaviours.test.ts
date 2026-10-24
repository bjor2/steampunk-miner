import { describe, expect, it } from 'vitest'
import { COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import { ECONOMY } from '../../../systems/economy/economy'
import { LOCKED_SCHEDULE } from '../../../systems/unlocks/unlockSchedule'
import { ORE_ROWS } from '../../ores'
import {
  FIRST_SYSTEM_BEHAVIOURS,
  recolouredFamiliesOf,
  recolourProblemsOf,
  telegraphTicksOf,
} from './familyBehaviours'
import { ARCHETYPE_PALETTE, type NewContentFamily } from './paletteRows'

// The behaviour level of fail-on-recolour (ticket 780; HS-1 on ticket 775): each SS2-B family does
// something no first-system content does, and each row's "Never" column (Progression, 23 Oct) is a
// true statement about the first system's content.

const FAMILIES = ARCHETYPE_PALETTE.newContent.families

function familyOf(id: string): NewContentFamily {
  const family = FAMILIES.find((candidate) => candidate.id === id)
  if (family === undefined) throw new Error(`no family ${id}`)
  return family
}

function firstSystemIds(): Set<string> {
  return new Set([
    ...ECONOMY.enemies.kinds.map((kind) => kind.id),
    ...Object.keys(ECONOMY.enemies.holdsTheRig),
    ...Object.keys(ORE_ROWS.planets.hazards),
    ...LOCKED_SCHEDULE.rows.map((row) => row.id),
  ])
}

describe('family behaviours', () => {
  it('ledgers every first-system enemy kind and hazard kind, naming only ids the first system has', () => {
    const ids = firstSystemIds()
    for (const entry of FIRST_SYSTEM_BEHAVIOURS) expect(ids.has(entry.id)).toBe(true)
    const ledgered = new Set(FIRST_SYSTEM_BEHAVIOURS.map((entry) => entry.id))
    for (const kind of ECONOMY.enemies.kinds) expect(ledgered.has(kind.id)).toBe(true)
    for (const hazard of Object.keys(ORE_ROWS.planets.hazards))
      expect(ledgered.has(hazard)).toBe(true)
  })

  it("reads each hazard kind's effect from the ores slice's table, not from memory", () => {
    for (const [id, kind] of Object.entries(ORE_ROWS.planets.hazards)) {
      expect(FIRST_SYSTEM_BEHAVIOURS.find((entry) => entry.id === id)?.effect).toBe(kind.effect)
    }
  })

  it('gives every family an effect no first-system content has, so none is a recolour', () => {
    expect(recolourProblemsOf(FAMILIES)).toEqual([])
    expect(recolouredFamiliesOf(FAMILIES)).toEqual([])
    const effects = FAMILIES.map((family) => family.behaviour.effect)
    expect(new Set(effects).size).toBe(effects.length)
  })

  it("asserts Progression's Never column: leeches neither disable tools nor shoot, sinks never pull, flares never bite", () => {
    const never = (id: string) =>
      familyOf(id).behaviour.never.map((line) => `${line.of}:${line.effect}`)
    expect(never('brine_leech')).toEqual(['emp_mite:disable_tools', 'frost_spitter:shoot'])
    expect(never('ferro_sand_sink')).toEqual(['magnetic_planets:magnetic_pull'])
    expect(never('vent_flare')).toEqual(['magma_tick:contact_damage'])
    expect(never('cinder_salt')).toEqual([])
    expect(never('spall_glass')).toEqual([])
    for (const family of FAMILIES) {
      for (const line of family.behaviour.never)
        expect(family.behaviour.effect).not.toBe(line.effect)
    }
  })

  it('names a family whose effect is a first-system one, and a Never line the first system contradicts', () => {
    const leech = familyOf('brine_leech')
    const shover = {
      ...leech,
      id: 'brine_shover',
      behaviour: { ...leech.behaviour, effect: 'shove' },
    }
    const liar = {
      ...leech,
      id: 'brine_liar',
      behaviour: { ...leech.behaviour, never: [{ effect: 'shoot', of: 'emp_mite' }] },
    }
    const stranger = {
      ...leech,
      id: 'brine_stranger',
      behaviour: { ...leech.behaviour, never: [{ effect: 'sting', of: 'sand_wasp' }] },
    }
    expect(recolourProblemsOf([shover, liar, stranger])).toEqual([
      'brine_shover recolours steamvent: both shove',
      'brine_liar.never[0] says emp_mite has shoot; it has disable_tools',
      'brine_stranger.never[0] names sand_wasp, not in the ledger',
    ])
    expect(recolouredFamiliesOf([shover, liar, leech])).toEqual(['brine_shover'])
  })

  it('telegraphs a vent flare for the collapse reaction window at least, and an untelegraphed family not at all', () => {
    expect(telegraphTicksOf(familyOf('vent_flare').behaviour)).toBeGreaterThanOrEqual(
      COLLAPSE_WARN_TICKS,
    )
    expect(telegraphTicksOf(familyOf('ferro_sand_sink').behaviour)).toBe(0)
    expect(FAMILIES.filter((family) => family.behaviour.telegraphed).map((f) => f.id)).toEqual([
      'vent_flare',
    ])
  })
})

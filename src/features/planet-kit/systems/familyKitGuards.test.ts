import { describe, expect, it } from 'vitest'
import economyFile from '../planet-kit.economy.json'
import kitsFile from '../planetKits.json'
import { planetKitGuardContext, planetKitProblems } from './planetKitRows'

type Raw = Record<string, unknown>
type MutableFile = {
  merchants: Raw[]
  familyKits: Raw[]
  noFamilyKit: Raw
  premiumRules: Record<string, Raw>
}

/** A deep copy of the shipped rows for a spec to break one field of. */
function kitsCopy(): MutableFile {
  return structuredClone(kitsFile) as unknown as MutableFile
}

function problemsOf(file: unknown): string[] {
  return planetKitProblems(file, economyFile, planetKitGuardContext())
}

function rowOf(file: MutableFile, familyId: string): Raw {
  return file.familyKits.find((row) => row.familyId === familyId)!
}

function withoutRows(file: MutableFile, ...familyIds: string[]): MutableFile {
  return {
    ...file,
    familyKits: file.familyKits.filter((r) => !familyIds.includes(String(r.familyId))),
  }
}

describe('family kit rows (ticket 824)', () => {
  it('accepts the shipped rows', () => {
    expect(problemsOf(kitsFile)).toEqual([])
  })

  it('carries one row for every hazard and roster family a planet can hold', () => {
    const { kitFamilyIds } = planetKitGuardContext()
    expect(
      kitsCopy()
        .familyKits.map((row) => row.familyId)
        .sort(),
    ).toEqual([...kitFamilyIds].sort())
  })

  it('lists every family left without a kit row', () => {
    expect(problemsOf(withoutRows(kitsCopy(), 'vent_flare', 'spall_glass'))).toEqual([
      'family vent_flare has no kit row: give it an item or itemId null',
      'family spall_glass has no kit row: give it an item or itemId null',
    ])
  })

  it('refuses a row for a family no planet can carry, and a second row for one family', () => {
    const file = kitsCopy()
    file.familyKits.push({ ...rowOf(file, 'cinder_salt'), familyId: 'frost_mite' })
    file.familyKits.push({ ...rowOf(file, 'brine_leech') })
    expect(problemsOf(file)).toEqual([
      'familyKits row frost_mite is no hazard or family a planet can carry',
      'family brine_leech has more than one kit row',
    ])
  })

  it('refuses a first-system kit drawn again under a new family (no recolour, no repeat)', () => {
    const file = kitsCopy()
    rowOf(file, 'vent_flare').itemId = 'vent_vane'
    expect(problemsOf(file)).toEqual([
      "kit item vent_vane is on more than one family's row",
      'vent_flare: vent_vane hooks steamvent, not this family',
    ])
  })

  it('refuses an item no kit authors, so a generated kit never mints a stats id', () => {
    const file = kitsCopy()
    rowOf(file, 'spall_glass').itemId = 'cutting_collar'
    expect(problemsOf(file)).toEqual(['spall_glass: cutting_collar is no authored kit item'])
  })

  it('keeps each authored hazard item on its hazard’s row under its home merchant’s variant', () => {
    const file = kitsCopy()
    rowOf(file, 'rockfall').itemId = null
    rowOf(file, 'firedamp').merchantVariant = 'Assay'
    expect(problemsOf(file)).toEqual([
      'scree_plough: not on the kit row of its hazard rockfall',
      "firedamp: variant Assay; damp_flask's home is Gasworks",
    ])
  })

  it('refuses a row under a variant no merchant carries', () => {
    const file = kitsCopy()
    rowOf(file, 'cinder_salt').merchantVariant = 'Bazaar'
    expect(problemsOf(file)).toEqual(['cinder_salt: no merchant carries the variant Bazaar'])
  })

  it('refuses a merchant whose name does not end in its variant', () => {
    const file = kitsCopy()
    file.merchants[1].variant = 'Gravel'
    expect(problemsOf(file)).toContain('Scree Yard: the name does not end in its variant Gravel')
  })

  it('refuses a premium rule that reaches for rare gems', () => {
    const file = kitsCopy()
    file.premiumRules.own_pool_reach.rarities = ['common', 'rare']
    expect(problemsOf(file)).toEqual([
      'premium rule own_pool_reach picks rare: only common and mid kinds',
    ])
  })

  it('keeps the no-family row premium only and every rule reference resolved', () => {
    const file = kitsCopy()
    file.noFamilyKit.itemId = 'cache_crate'
    rowOf(file, 'brine_leech').premiumRule = 'first_gem'
    expect(problemsOf(file)).toEqual([
      'familyKits[6].premiumRule names no rule of premiumRules',
      'noFamilyKit.itemId must be null: premium only',
    ])
  })
})

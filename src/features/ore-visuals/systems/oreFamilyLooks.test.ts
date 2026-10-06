import { describe, expect, it } from 'vitest'
import looksFile from '../oreLooks.json'
import {
  ORE_LOOKS,
  oreAtlasCellCapacityOf,
  oreAtlasCellCountOf,
  oreFamilyLookOf,
  oreLookProblems,
} from './oreFamilyLooks'

// The 12 family rows the Game Director fixed on #151, with the atlas and hue rules the file
// must keep (#140 acceptance 7, #151 budgets).

const GD_FAMILIES = [
  'metal',
  'ancient',
  'fossil',
  'radioactive',
  'alien',
  'relic',
  'crystal',
  'cryo',
  'energy',
  'exotic',
  'organic',
  'volcanic',
]

function withFamilies(families: unknown[]): unknown {
  return { ...looksFile, families }
}

describe('ore look data (#151)', () => {
  it('accepts the committed file', () => {
    expect(oreLookProblems(looksFile)).toEqual([])
  })

  it('holds the 12 families of the Game Director, sorted by id', () => {
    const ids = ORE_LOOKS.families.map((family) => family.id)
    expect([...ids].sort()).toEqual([...GD_FAMILIES].sort())
    expect(ids).toEqual([...ids].sort())
  })

  it('fits the 240 cells of 12 families x 4 variants x 5 grades in one 4096 atlas of 256', () => {
    expect(oreAtlasCellCountOf(ORE_LOOKS)).toBe(240)
    expect(oreAtlasCellCapacityOf(ORE_LOOKS.atlas)).toBe(256)
  })

  it('keeps every hue band out of the heat and enemy-purple bands', () => {
    for (const family of ORE_LOOKS.families) {
      const [low, high] = family.hueBand
      expect({ id: family.id, heat: low <= 45 && high >= 15 }).toEqual({
        id: family.id,
        heat: false,
      })
      expect({ id: family.id, purple: low <= 285 && high >= 268 }).toEqual({
        id: family.id,
        purple: false,
      })
    }
  })

  it('tells every family apart by silhouette, never by hue alone', () => {
    const silhouettes = ORE_LOOKS.families.map((family) => family.silhouette)
    expect(new Set(silhouettes).size).toBe(silhouettes.length)
  })

  it('finds a family by id and answers null for an unknown one', () => {
    expect(oreFamilyLookOf(ORE_LOOKS, 'crystal')?.shaderSilhouette).toBe('shards')
    expect(oreFamilyLookOf(ORE_LOOKS, 'brass')).toBeNull()
  })

  it('refuses a 13th family, naming the per-planet atlas follow-up', () => {
    const thirteenth = {
      ...looksFile.families[0],
      id: 'brass',
      silhouette: 'ingots',
      hueBand: [100, 110],
    }
    const problems = oreLookProblems(withFamilies([...looksFile.families, thirteenth]))
    expect(problems).toEqual([
      expect.stringContaining('13 families need 260 atlas cells, but one 4096 px atlas holds 256'),
    ])
    expect(problems[0]).toContain('per-planet atlas follow-up')
  })

  it('refuses a hue band in the reserved heat band and a fifth variant, every problem at once', () => {
    const [metal, ...rest] = looksFile.families
    const broken = withFamilies([{ ...metal, hueBand: [20, 30], variants: 5 }, ...rest])
    expect(oreLookProblems(broken)).toEqual([
      'families[0].hueBand overlaps the reserved 15-45 degrees',
      'families[0].variants must be at most 4',
    ])
  })

  it('refuses two families sharing a silhouette or an id', () => {
    const [metal, ancient, fossil, ...rest] = looksFile.families
    const broken = withFamilies([
      metal,
      { ...ancient, silhouette: 'flecks' },
      { ...fossil, id: 'metal' },
      ...rest,
    ])
    expect(oreLookProblems(broken)).toEqual([
      'families share the id "metal"; each family needs its own',
      'families share the silhouette "flecks"; each family needs its own',
    ])
  })

  it('refuses grade knobs that fall with the grade', () => {
    const broken = { ...looksFile, grades: { ...looksFile.grades, glow: [0, 0, 0.5, 0.4, 1] } }
    expect(oreLookProblems(broken)).toEqual([
      'grades.glow must list 5 values that never fall',
      'grades.strengthFloor must be in 0..1',
    ])
  })

  it('refuses a glow ladder whose next grade starts dimmer than the grade before ends', () => {
    const broken = { ...looksFile, grades: { ...looksFile.grades, glow: [0, 0, 0.3, 0.9, 1] } }
    expect(oreLookProblems(broken)).toEqual([
      'grades.glow x strengthFloor must not fall below the grade before',
    ])
  })
})

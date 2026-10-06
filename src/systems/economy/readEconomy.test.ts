import { describe, expect, it } from 'vitest'
import economyFile from './economy.json'
import { UPGRADE_IDS } from './economyDefinition'
import { readEconomy } from './readEconomy'

/** A deep copy of the committed file that a test may break. */
function economyFileCopy(): typeof economyFile {
  return structuredClone(economyFile)
}

function problemsOf(raw: unknown): string[] {
  return readEconomy(raw).problems
}

describe('economy data validation', () => {
  it('reads the committed economy.json with no problem', () => {
    expect(problemsOf(economyFile)).toEqual([])
  })

  it('holds exactly the six upgrade tracks, each uncapped and on its own cost curve', () => {
    const reading = readEconomy(economyFile)
    if (!('economy' in reading)) throw new Error(reading.problems.join('\n'))
    const upgrades = reading.economy.upgrades
    expect(upgrades.map((upgrade) => upgrade.id).sort()).toEqual([...UPGRADE_IDS].sort())
    expect(upgrades.map((upgrade) => upgrade.costCurveId)).toEqual(
      upgrades.map((upgrade) => `cost.vehicle.${upgrade.id}`),
    )
    expect(upgrades.every((upgrade) => upgrade.maxLevel === null)).toBe(true)
  })

  it('lists every broken field of the auto_guns block (#107)', () => {
    const broken = economyFileCopy() as unknown as { gun: Record<string, unknown> }
    broken.gun.damageFractionOfDrill = 0.25
    broken.gun.mountCost = { band: 5 }
    expect(problemsOf(broken)).toEqual([
      'gun.damageFractionOfDrill must be a decimal string >= 0',
      'gun.mountCost.oreUnits must be a decimal string >= 0',
    ])
  })

  it('refuses a heat archetype whose bands or throttle line do not fit the gauge (#113)', () => {
    const broken = economyFileCopy()
    broken.archetypes[0].bandHeatPerSecond = ['0', '0.100']
    Object.assign(broken.archetypes[0], { throttleAt: 100 })
    expect(problemsOf(broken)).toEqual([
      'archetypes[0].bandHeatPerSecond must list 5 bands',
      'archetypes[0].throttleAt must lie inside the gauge, above 0 and below gaugeMax',
    ])
  })

  it('lists an unknown upgrade id as a problem', () => {
    const broken = economyFileCopy()
    broken.upgrades[0].id = 'laser'
    expect(problemsOf(broken)).toContain(
      'upgrades[0].id must be one of drill_power, drill_tip, engine, boiler, cargo_hold, hull, got "laser"',
    )
  })

  it('lists a track that is missing or listed twice', () => {
    const broken = economyFileCopy()
    broken.upgrades[1] = economyFileCopy().upgrades[0]
    expect(problemsOf(broken)).toEqual(
      expect.arrayContaining([
        'upgrades must list the track drill_power once, found 2',
        'upgrades must list the track drill_tip once, found 0',
      ]),
    )
  })

  it('lists a cost curve id that does not resolve to a curve in the data', () => {
    const broken = economyFileCopy()
    broken.costCurves = broken.costCurves.filter((curve) => curve.id !== 'cost.vehicle.hull')
    expect(problemsOf(broken)).toContain(
      'upgrades[5].costCurveId cost.vehicle.hull has no curve in costCurves',
    )
  })

  it('lists a cost curve id that points at another track', () => {
    const broken = economyFileCopy()
    broken.upgrades[0].costCurveId = 'cost.vehicle.hull'
    expect(problemsOf(broken)).toContain('upgrades[0].costCurveId must be cost.vehicle.drill_power')
  })

  it('lists a track whose effect has the wrong shape or stat', () => {
    const broken = economyFileCopy()
    broken.upgrades[0].effect.stat = 'hullMax'
    expect(problemsOf(broken)).toContain(
      'upgrades[0].effect must be geometric drillPower for drill_power',
    )
  })

  it('refuses a capped track', () => {
    const broken = economyFileCopy()
    Object.assign(broken.upgrades[2], { maxLevel: 50 })
    expect(problemsOf(broken)).toContain('upgrades[2].maxLevel must be null (uncapped, #7)')
  })

  it('refuses a price written as a JSON number instead of a decimal string', () => {
    const broken = economyFileCopy()
    Object.assign(broken.costCurves[0], { ratio: 1.24 })
    expect(problemsOf(broken)).toContain('costCurves[0].ratio must be a decimal string >= 0')
  })

  it('refuses pace scale steps that do not climb by planet (#131)', () => {
    const broken = economyFileCopy()
    Object.assign(broken.planets.paceScale, {
      fromPlanet: [
        { from: 8, scale: '1' },
        { from: 3, scale: '1.3' },
      ],
    })
    expect(problemsOf(broken)).toContain(
      'planets.paceScale.fromPlanet must climb by planet from 1 or later, one row a planet',
    )
  })

  it('lists every problem at once and returns no economy', () => {
    const broken = economyFileCopy()
    broken.ore.valueRatio = 'lots'
    broken.enemies.kinds[0].windupTicks = 24.5
    Object.assign(broken.planets.paceScale, { byPlanet: { '0': '1' } })
    const reading = readEconomy(broken)
    expect(reading.problems).toEqual([
      'ore.valueRatio must be a decimal string >= 0',
      'planets.paceScale.byPlanet key 0 must be a safe integer',
      'enemies.kinds[0].windupTicks must be a safe integer',
    ])
    expect('economy' in reading).toBe(false)
  })

  it('refuses a refinery whose slot curve does not price each slot past the first', () => {
    const broken = economyFileCopy()
    Object.assign(broken.refinery, { slotsMax: 4 })
    expect(problemsOf(broken)).toContain(
      'cost.refinery.slot must price 3 slots, slotsStart to slotsMax',
    )
  })

  it('refuses a refinery slot curve that is not priced in band ore', () => {
    const broken = economyFileCopy()
    Object.assign(broken.refinery, { slotCostCurveId: 'cost.casing.upgrade' })
    expect(problemsOf(broken)).toContain(
      'refinery.slotCostCurveId cost.casing.upgrade has no bandOre curve',
    )
  })

  it('refuses a file that is not an object', () => {
    expect(problemsOf(null)).toContain('economy must be an object')
  })
})

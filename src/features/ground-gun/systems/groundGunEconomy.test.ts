import { describe, expect, it } from 'vitest'
import { fromCanonical } from '../../../systems/money'
import economyFile from '../groundGun.json'
import { GROUND_GUN, GUN_TRACK_IDS, readGroundGunEconomy } from './groundGunEconomy'

describe('ground gun economy', () => {
  it('reads the bore as #309 and the #310 amendment fixed it: 4 cells to a cap of 10, 2 ticks a cell, a 30-tick hold, 90 dig ticks a shot', () => {
    expect(GROUND_GUN.bore).toEqual({
      boreRangeBase: 4,
      rangeCap: 10,
      openIntervalTicks: 2,
      collapseHoldTicks: 30,
      shotDigTicks: 90,
    })
  })

  it('reads one gap per track: rate 10 driving kGunPct and cooldown, penetration 17, energy 14', () => {
    expect(GROUND_GUN.tracks.rate.gap0).toBe(10)
    expect(GROUND_GUN.tracks.rate.stats).toEqual({
      kGunPct: { wall: 45, perGap: -2 },
      cooldownTicks: { wall: 15, perGap: 3 },
    })
    expect(GROUND_GUN.tracks.penetration.gap0).toBe(17)
    expect(GROUND_GUN.tracks.penetration.stats).toEqual({ gunFactorPct: { wall: 100, perGap: -3 } })
    expect(GROUND_GUN.tracks.energy.gap0).toBe(14)
    expect(GROUND_GUN.tracks.energy.stats).toEqual({ energyPerCellPct: { wall: 100, perGap: 7 } })
  })

  it('prices every track level as 1 band-5 ore unit at its target planet, x1.225 on a repeat planet', () => {
    for (const trackId of GUN_TRACK_IDS) {
      expect(GROUND_GUN.tracks[trackId].price).toEqual({
        band: 5,
        oreUnits: fromCanonical('1'),
        samePlanetRatio: fromCanonical('1.225'),
      })
    }
  })

  it('reads the long barrel hold absorber (3 ticks a Mark to 15), the auto-shoot reserve, preview and wait floor, and the bot shot floor', () => {
    expect(GROUND_GUN.longBarrel).toEqual({ holdStep: 3, holdCap: 15 })
    expect(GROUND_GUN.autoShoot).toEqual({
      reserveAboveRescueBp: 1000,
      previewTicks: 10,
      manualWaitFloorTicks: 20,
    })
    expect(GROUND_GUN.bot).toEqual({ minShots: 60 })
  })

  it('reads the turret cap of 10 tiles and energy per shot as the past-cap stat', () => {
    expect(GROUND_GUN.turret).toEqual({ gunRangeCap: 10, pastCapStat: 'energyPerShot' })
  })

  it('reads a module as its Mark roles over named whole stats', () => {
    expect(GROUND_GUN.modules['weapon.splay_choke']).toEqual({
      marks: { isIncomeItem: true, cooldown: 'splayCooldownTicks', charges: 'splayLines' },
      stats: { splaySteps: 8, splayCooldownTicks: 15, splayLines: 2 },
    })
    expect(GROUND_GUN.combos).toEqual({
      'combo.sounding_bore': { soundRadius: 2 },
      'combo.winch_bore': { hookWindowTicks: 60 },
    })
  })

  it('refuses the whole file and lists every broken field', () => {
    const broken: Record<string, unknown> = structuredClone(economyFile)
    broken.bore = { ...economyFile.bore, rangeCap: '10' }
    broken.tracks = {
      ...economyFile.tracks,
      rate: { ...economyFile.tracks.rate, targetPlanet: [1, 2, 'three'] },
      energy: { ...economyFile.tracks.energy, stats: {} },
    }
    broken.turret = { gunRangeCap: 10, pastCapStat: 'damage' }
    broken.modules = {
      'weapon.flushing_shell': {
        marks: { isIncomeItem: 'yes', magnitude: 'flushRange' },
        stats: { flushTicks: 90 },
      },
    }
    expect(readGroundGunEconomy(broken)).toEqual({
      problems: [
        'bore.rangeCap must be a safe integer',
        'tracks.rate.targetPlanet[2] must be a safe integer',
        'tracks.energy.stats.energyPerCellPct must be an object',
        'tracks.energy.stats.energyPerCellPct.wall must be a safe integer',
        'tracks.energy.stats.energyPerCellPct.perGap must be a safe integer',
        'turret.pastCapStat must be one of energyPerShot, got "damage"',
        'modules.weapon.flushing_shell.marks.isIncomeItem must be a boolean',
        'modules.weapon.flushing_shell.marks names flushRange, which modules.weapon.flushing_shell.stats lacks',
      ],
    })
  })
})

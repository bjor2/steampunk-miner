import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../../../systems/economy/economy'
import { lastMarkOf } from '../../tech-tree'
import {
  armouryModuleIds,
  armouryModuleOf,
  isOverpressureNetRateHeld,
  moduleLadderOf,
  moduleStatsAt,
} from './armouryModules'
import { GROUND_GUN } from './groundGunEconomy'

/** Every `{placeholder}` of Content's table on #310, and the key that resolves it here. */
const CONTENT_PLACEHOLDERS: Readonly<Record<string, number>> = {
  boreRangeBase: GROUND_GUN.bore.boreRangeBase,
  rangeCap: GROUND_GUN.bore.rangeCap,
  shotBoreBudget: GROUND_GUN.bore.shotDigTicks,
  holdStep: GROUND_GUN.longBarrel.holdStep,
  holdCap: GROUND_GUN.longBarrel.holdCap,
  overrideTicks: statOf('weapon.steam_sear', 'manualWaitTicks'),
  searDwellTicks: GROUND_GUN.autoShoot.previewTicks,
  retargetTicks: statOf('weapon.gimbal_sight', 'retargetTicks'),
  splaySteps: statOf('weapon.splay_choke', 'splaySteps'),
  splayCooldownTicks: statOf('weapon.splay_choke', 'splayCooldownTicks'),
  cementCharges: statOf('weapon.cementing_round', 'cementCharges'),
  cementCooldownTicks: statOf('weapon.cementing_round', 'cementCooldownTicks'),
  cementEnergyPerCell: statOf('weapon.cementing_round', 'cementEnergyPerCellBp'),
  groundTicks: statOf('weapon.earthing_spike', 'groundTicks'),
  rifleTurns: statOf('weapon.rifled_bore', 'rifleTurns'),
  strutTicks: statOf('weapon.strut_bore', 'strutTicks'),
  strutCharges: statOf('weapon.strut_bore', 'strutCharges'),
  gunRangeCap: GROUND_GUN.turret.gunRangeCap,
  directorRetargetTicks: statOf('weapon.fire_director', 'directorRetargetTicks'),
  camOpenDelayTicks: statOf('weapon.sentry_cam', 'camOpenDelayTicks'),
  knockCells: statOf('weapon.concussion_shells', 'knockCells'),
  knockCooldownTicks: statOf('weapon.concussion_shells', 'knockCooldownTicks'),
  grapeTargets: statOf('weapon.grapeshot_breech', 'grapeTargets'),
  grapeConeDeg: statOf('weapon.grapeshot_breech', 'grapeConeDeg'),
  flushRange: statOf('weapon.flushing_shell', 'flushRange'),
  flushTicks: statOf('weapon.flushing_shell', 'flushTicks'),
  burstTicks: statOf('weapon.overpressure_burst', 'burstTicks'),
  ventTicks: statOf('weapon.overpressure_burst', 'ventTicks'),
  bounceLegCells: statOf('weapon.ricochet_shot', 'bounceLegCells'),
  soundRadius: GROUND_GUN.combos['combo.sounding_bore'].soundRadius,
  hookWindowTicks: GROUND_GUN.combos['combo.winch_bore'].hookWindowTicks,
  minBotShots: GROUND_GUN.bot.minShots,
}

const BORE_GUN_MODULES = [
  'weapon.gimbal_sight',
  'weapon.steam_sear',
  'weapon.splay_choke',
  'weapon.cementing_round',
  'weapon.earthing_spike',
  'weapon.rifled_bore',
  'weapon.strut_bore',
]

const AUTO_GUNS_MODULES = [
  'weapon.fire_director',
  'weapon.sentry_cam',
  'weapon.concussion_shells',
  'weapon.grapeshot_breech',
  'weapon.flushing_shell',
  'weapon.overpressure_burst',
  'weapon.ricochet_shot',
]

function statOf(itemId: string, name: string): number {
  return armouryModuleOf(itemId).stats[name]
}

function mastered(itemId: string) {
  return moduleStatsAt(itemId, lastMarkOf(moduleLadderOf(itemId)))
}

describe('armoury modules', () => {
  it('resolves every placeholder of the node table to a whole number', () => {
    for (const [name, value] of Object.entries(CONTENT_PLACEHOLDERS)) {
      expect(Number.isSafeInteger(value), name).toBe(true)
      expect(value, name).toBeGreaterThan(0)
    }
    expect([...armouryModuleIds()].sort()).toEqual(
      [...BORE_GUN_MODULES, ...AUTO_GUNS_MODULES].sort(),
    )
  })

  it('puts the gun modules on the income limits and the turret modules on the general ones, the sear excepted', () => {
    for (const itemId of BORE_GUN_MODULES) {
      expect(moduleLadderOf(itemId).isIncomeItem, itemId).toBe(itemId !== 'weapon.steam_sear')
    }
    for (const itemId of AUTO_GUNS_MODULES) {
      expect(moduleLadderOf(itemId).isIncomeItem, itemId).toBe(false)
    }
  })

  it('reads a module as bought and steps only the stats its Marks name', () => {
    expect(moduleLadderOf('weapon.splay_choke')).toEqual({
      isIncomeItem: true,
      cooldown: 15,
      charges: 2,
    })
    expect(moduleStatsAt('weapon.splay_choke', 1)).toEqual({
      itemId: 'weapon.splay_choke',
      mark: 1,
      stats: { splaySteps: 8, splayCooldownTicks: 15, splayLines: 2 },
      isMastered: false,
    })
    expect(moduleStatsAt('weapon.splay_choke', 3).stats).toEqual({
      splaySteps: 8,
      splayCooldownTicks: 14,
      splayLines: 3,
    })
  })

  it('masters the gimbal sight at 21 ticks between picks, inside one pick per 15 ticks', () => {
    expect(mastered('weapon.gimbal_sight')).toMatchObject({ mark: 5, stats: { retargetTicks: 21 } })
  })

  it('masters the sear at a 30-tick wait, above the GD floor of 20 and the 10-tick preview', () => {
    expect(mastered('weapon.steam_sear')).toMatchObject({
      mark: 10,
      stats: { manualWaitTicks: 30 },
    })
    expect(mastered('weapon.steam_sear').stats.manualWaitTicks).toBeGreaterThanOrEqual(
      GROUND_GUN.autoShoot.manualWaitFloorTicks,
    )
    expect(GROUND_GUN.autoShoot.manualWaitFloorTicks).toBeGreaterThan(
      GROUND_GUN.autoShoot.previewTicks,
    )
  })

  it('masters the bore modules where the income limits stop them', () => {
    // The income floor of 15 ticks is 10.5, which the tree rounds to even: 10 at Mark 9.
    expect(mastered('weapon.splay_choke')).toMatchObject({
      mark: 9,
      stats: { splayCooldownTicks: 10, splayLines: 5 },
    })
    expect(mastered('weapon.cementing_round')).toMatchObject({
      mark: 9,
      stats: { cementCooldownTicks: 84, cementCharges: 6 },
    })
    expect(mastered('weapon.earthing_spike')).toMatchObject({
      mark: 9,
      stats: { groundTicks: 840, groundCooldownTicks: 210 },
    })
    expect(mastered('weapon.rifled_bore')).toMatchObject({
      mark: 9,
      stats: { rifleTurns: 4, rifleCooldownTicks: 10 },
    })
    expect(mastered('weapon.strut_bore')).toMatchObject({
      mark: 7,
      stats: { strutTicks: 840, strutCharges: 5 },
    })
  })

  it('masters the turret modules where the general limits stop them', () => {
    expect(mastered('weapon.fire_director')).toMatchObject({
      mark: 9,
      stats: { directorRetargetTicks: 15 },
    })
    expect(mastered('weapon.sentry_cam')).toMatchObject({
      mark: 10,
      stats: { camOpenDelayTicks: 30 },
    })
    expect(mastered('weapon.concussion_shells')).toMatchObject({
      mark: 15,
      stats: { knockCells: 4, knockCooldownTicks: 90 },
    })
    expect(mastered('weapon.grapeshot_breech')).toMatchObject({
      mark: 13,
      stats: { grapeTargets: 5, grapeCooldownTicks: 60 },
    })
    expect(mastered('weapon.flushing_shell')).toMatchObject({
      mark: 15,
      stats: { flushRange: 8, flushCooldownTicks: 150 },
    })
    expect(mastered('weapon.overpressure_burst')).toMatchObject({
      mark: 15,
      stats: { burstTicks: 240, ventTicks: 150 },
    })
    expect(mastered('weapon.ricochet_shot')).toMatchObject({
      mark: 15,
      stats: { bounceLegCells: 6, ricochetCooldownTicks: 60 },
    })
  })

  it('cements a bored cell at no less than twice the drill energy: never a cheaper route than drill plus case', () => {
    expect(statOf('weapon.cementing_round', 'cementEnergyPerCellBp')).toBeGreaterThanOrEqual(10000)
  })

  it('never lets a knock stun-lock: its cooldown at Mastered is at least the slowest enemy attack cooldown', () => {
    const slowestAttack = Math.max(
      ...ECONOMY.enemies.kinds.map((kind) => kind.attackCooldownTicks.min),
    )
    expect(slowestAttack).toBe(90)
    expect(mastered('weapon.concussion_shells').stats.knockCooldownTicks).toBeGreaterThanOrEqual(
      slowestAttack,
    )
  })

  it('splits grapeshot over no more targets than the pack can hold, and keeps flush and bounce inside the turret cap', () => {
    expect(mastered('weapon.grapeshot_breech').stats.grapeTargets).toBeLessThanOrEqual(
      ECONOMY.enemies.combat.maxActivePerVehicle,
    )
    expect(mastered('weapon.flushing_shell').stats.flushRange).toBeLessThanOrEqual(
      GROUND_GUN.turret.gunRangeCap,
    )
    expect(mastered('weapon.ricochet_shot').stats.bounceLegCells).toBeLessThanOrEqual(
      GROUND_GUN.turret.gunRangeCap,
    )
  })

  it('keeps overpressure at or under the gun track rate at every Mark: 0.92 at worst', () => {
    const last = lastMarkOf(moduleLadderOf('weapon.overpressure_burst'))
    for (let mark = 1; mark <= last; mark += 1) {
      const { stats } = moduleStatsAt('weapon.overpressure_burst', mark)
      expect(isOverpressureNetRateHeld(stats), `Mark ${mark}`).toBe(true)
    }
    expect(
      isOverpressureNetRateHeld({ ...mastered('weapon.overpressure_burst').stats, ventTicks: 119 }),
    ).toBe(false)
  })

  it('covers a full bore and its hold with the winch window: 10 cells at 2 ticks plus the 30-tick hold', () => {
    const { bore } = GROUND_GUN
    expect(GROUND_GUN.combos['combo.winch_bore'].hookWindowTicks).toBeGreaterThanOrEqual(
      bore.rangeCap * bore.openIntervalTicks + bore.collapseHoldTicks,
    )
  })

  it('refuses an unknown module', () => {
    expect(() => moduleLadderOf('weapon.lodestar_sight')).toThrow(RangeError)
  })
})

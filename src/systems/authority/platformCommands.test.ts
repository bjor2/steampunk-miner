import { describe, expect, it } from 'vitest'
import { computeVehicleStats } from '../vehicle/vehicleStats'
import { canonicalStatsOf } from '../vehicle/vehicleStatsView'
import { FACING, bayPoseAt, dockedPoseAt } from '../vehicle/vehiclePose'
import type { BayId } from '../world/dockBays'
import { toCanonical } from '../money'
import type { CommandIntent } from './authorityCommand'
import { canDock, dockedBayOf } from './dockRules'
import type { DomainEvent } from './domainEvent'
import { quickServiceCharges, serviceQuote } from './platformServices'
import {
  coreTiles,
  createScriptedSession,
  FREEZE_ENEMIES,
  GROUND,
  mineTile,
  poseAbove,
  SITE,
  surfaceOreTiles,
  typesOf,
  type ScriptedSession,
} from './scriptedSession'
import { canBuyUpgrade } from './workshopRules'

const FULL_TANK = 150 * 240
const SIX_TRACKS = ['cargo_hold', 'boiler', 'engine', 'hull', 'drill_power', 'drill_tip']

function poseAtDock(velocity: { vx: number; vy: number } = { vx: 0, vy: 0 }) {
  return poseAtBay('sell', velocity)
}

/** At rest (or moving) in one bay's pad zone (#37); the Sell bay is where a run starts. */
function poseAtBay(bay: BayId, velocity: { vx: number; vy: number } = { vx: 0, vy: 0 }) {
  return {
    type: 'reportPose' as const,
    payload: {
      ...bayPoseAt(SITE, bay),
      ...velocity,
      driving: false,
      thrusting: false,
      drilling: false,
      thrustTicks: 0,
      driveTicks: 0,
      drillTicks: 0,
    },
  }
}

const dock = { type: 'dock', payload: { bay: 'sell' } } as const
const dockAtUpgradeBay = { type: 'dock', payload: { bay: 'upgrade' } } as const
const undock = { type: 'undock', payload: {} } as const
const repair = { type: 'repairHull', payload: {} } as const
const recharge = { type: 'rechargeEnergy', payload: {} } as const
const quickService = { type: 'quickService', payload: {} } as const
const sell = (resourceTier: number | 'all') =>
  ({ type: 'sellCargo', payload: { resourceTier } }) as const
const buy = (upgradeId: string) => ({ type: 'buyUpgrade', payload: { upgradeId } }) as const
const grant = (amount: string) => ({ type: 'debug.grantMoney', payload: { amount } }) as const
const setUpgrade = (upgradeId: string, level: number) =>
  ({ type: 'debug.setUpgrade', payload: { upgradeId, level } }) as const

const walletOf = (session: ScriptedSession, playerId = 'p1') =>
  toCanonical(session.state().players[playerId].wallet)

const rejectionOf = (events: readonly DomainEvent[]) =>
  events[0].type === 'CommandRejected' ? events[0].reason : null

/** Mines `count` band-1 ore tiles, returns to the pad and docks. */
function mineOreAndDock(session: ScriptedSession, count: number, startTick = 10): number {
  surfaceOreTiles(count).forEach((tile, index) => mineTile(session, startTick + 50 * index, tile))
  const tick = startTick + 50 * count
  session.submit(tick, poseAtDock())
  session.submit(tick, dock)
  return tick
}

/** A vehicle that digs core at once (#24 acceptance 3: tip 7 scratches it) with a large hold. */
/** Mining at the core, where crawlers live: frozen so the spec sees only the platform's rules. */
function equipForCore(session: ScriptedSession): void {
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, setUpgrade('drill_tip', 7))
  session.submit(0, setUpgrade('drill_power', 60))
  session.submit(0, setUpgrade('cargo_hold', 20))
}

function mineCore(
  session: ScriptedSession,
  startTick: number,
  tiles: ReturnType<typeof coreTiles>,
) {
  tiles.forEach((tile, index) => mineTile(session, startTick + 50 * index, tile))
  return startTick + 50 * tiles.length
}

/** Undocks, drives over to the Upgrade bay and docks there (#37). */
function moveToUpgradeBay(session: ScriptedSession, tick: number): void {
  if (session.vehicle().mode === 'docked') session.submit(tick, undock)
  session.submit(tick, poseAtBay('upgrade'))
  session.submit(tick, dockAtUpgradeBay)
}

/** Applies the same intents to a fresh session and to a second one, for comparisons. */
function sessionAfter(steps: readonly [number, CommandIntent][]): ScriptedSession {
  const session = createScriptedSession()
  for (const [tick, intent] of steps) session.submit(tick, intent)
  return session
}

describe('platform: docking', () => {
  it('docks a stationary vehicle in the pad zone and logs the entry, then a dock digest', () => {
    const session = createScriptedSession()
    const events = session.submit(5, dock)
    expect(typesOf(events)).toEqual(['VehicleModeChanged', 'DockEntered', 'StateDigested'])
    expect(events[0]).toMatchObject({ from: 'active', to: 'docked', reason: 'dock' })
    expect(events[1]).toMatchObject({ cargoUnits: 0, energy: FULL_TANK, hull: '1e+2' })
    expect(events[2]).toMatchObject({ scope: 'dock' })
    expect(session.vehicle().mode).toBe('docked')
  })

  it('refuses to dock outside the pad zone, changing nothing', () => {
    const session = createScriptedSession()
    session.submit(5, poseAbove(GROUND, FACING.down))
    const before = session.state()
    expect(rejectionOf(session.submit(6, dock))).toBe('not_docked')
    expect(session.state().players).toEqual(before.players)
    expect(canDock(session.state(), 'p1', 'sell')).toBe(false)
  })

  it('refuses to dock a vehicle still moving in the pad zone', () => {
    const session = createScriptedSession()
    session.submit(5, poseAtDock({ vx: 2000, vy: 0 }))
    expect(rejectionOf(session.submit(6, dock))).toBe('not_docked')
    expect(session.vehicle().mode).toBe('active')
  })

  it('docks with energy 0 in the pad zone with no tow and no fee', () => {
    const session = createScriptedSession()
    session.submit(0, grant('100'))
    session.submit(0, { type: 'debug.setEnergy', payload: { energy: '0' } })
    session.advanceTo(500)
    const events = session.submit(500, dock)
    expect(typesOf(session.events())).not.toContain('RescueTriggered')
    expect(events[1]).toMatchObject({ type: 'DockEntered', energy: 0 })
    expect(walletOf(session)).toBe('1e+2')
  })

  it('logs dock_left with the ticks spent docked, then the change back to active', () => {
    const session = createScriptedSession()
    session.submit(5, dock)
    const events = session.submit(305, undock)
    expect(typesOf(events)).toEqual(['DockLeft', 'VehicleModeChanged'])
    expect(events[0]).toMatchObject({ durationTicks: 300 })
    expect(events[1]).toMatchObject({ from: 'docked', to: 'active', reason: 'undock' })
  })

  it('refuses to undock a vehicle that is not docked', () => {
    const session = createScriptedSession()
    expect(rejectionOf(session.submit(5, undock))).toBe('not_docked')
  })

  it('counts the first pose report after undocking from the undock tick', () => {
    const session = createScriptedSession()
    session.submit(5, dock)
    session.submit(1000, undock)
    const tooMany = { ...poseAtDock(), payload: { ...poseAtDock().payload, driveTicks: 30 } }
    expect(rejectionOf(session.submit(1011, tooMany))).toBe('too_many_ticks')
  })
})

describe('platform: core bay', () => {
  it('moves carried core fragments into the bay on docking', () => {
    const session = createScriptedSession()
    equipForCore(session)
    const tick = mineCore(session, 10, coreTiles(10))
    session.submit(tick, poseAtDock())
    const events = session.submit(tick, dock)
    expect(events.find((event) => event.type === 'CoreBayDeposited')).toMatchObject({
      fragments: 10,
      total: 10,
      source: 'dock',
    })
    expect(events[1]).toMatchObject({ type: 'DockEntered', cargoUnits: 10 })
    expect(session.vehicle().cargo.coreFragments).toBe(0)
    expect(session.state().platform.coreBay).toBe(10)
  })

  it('delivers carried core to the bay with the tow and loses only the ore', () => {
    const session = createScriptedSession()
    equipForCore(session)
    const [ore] = surfaceOreTiles(1)
    mineTile(session, 10, ore)
    const tick = mineCore(session, 60, coreTiles(10))
    session.submit(tick, { type: 'debug.setHull', payload: { hull: '0' } })
    const towed = session.advanceTo(tick + 120)
    expect(typesOf(towed)).toEqual([
      'RescueTriggered',
      'MoneyChanged',
      'VehicleModeChanged',
      'CoreBayDeposited',
    ])
    expect(towed[0]).toMatchObject({ cause: 'destroyed', cargoLostValue: '1e+1' })
    expect(towed[3]).toMatchObject({ fragments: 10, total: 10, source: 'rescue' })
    expect(session.vehicle().cargo).toEqual({ ore: {}, coreFragments: 0 })
  })

  it('tows a stranded vehicle after the grace and banks its core, with a full hull and 25% energy', () => {
    const session = createScriptedSession()
    equipForCore(session)
    const tick = mineCore(session, 10, coreTiles(5))
    session.submit(tick, { type: 'debug.setHull', payload: { hull: '40' } })
    session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '0.05' } })
    session.submit(tick + 12, poseAbove(GROUND, FACING.right, { driveTicks: 12 }))
    expect(session.vehicle().mode).toBe('stranded')
    const towed = session.advanceTo(tick + 12 + 180)
    expect(towed[0]).toMatchObject({ type: 'RescueTriggered', cause: 'stranded', fee: '0e+0' })
    expect(towed.at(-1)).toMatchObject({ type: 'CoreBayDeposited', fragments: 5, source: 'rescue' })
    expect(session.state().platform.coreBay).toBe(5)
    expect(session.vehicle()).toMatchObject({ mode: 'docked', energy: FULL_TANK / 4 })
    expect(toCanonical(session.vehicle().hull)).toBe('1e+2')
  })

  it('keeps the bay total through three rescues while carrying core', () => {
    const session = createScriptedSession()
    equipForCore(session)
    const tiles = coreTiles(9)
    for (const trip of [0, 1, 2]) {
      const start = 1000 * trip + 10
      if (session.vehicle().mode === 'docked') session.submit(start, undock)
      const end = mineCore(session, start + 1, tiles.slice(3 * trip, 3 * trip + 3))
      session.submit(end, { type: 'debug.setHull', payload: { hull: '0' } })
      session.submit(end + 1, { type: 'requestRescue', payload: {} })
    }
    expect(session.state().platform.coreBay).toBe(9)
    expect(typesOf(session.events()).filter((type) => type === 'RescueTriggered')).toHaveLength(3)
  })

  it('shows the core drive once, when the bay first reaches the 63 fragments planet 1 needs', () => {
    const session = createScriptedSession()
    equipForCore(session)
    const tiles = coreTiles(70)
    const first = mineCore(session, 10, tiles.slice(0, 62))
    session.submit(first, poseAtDock())
    const atSixtyTwo = session.submit(first, dock)
    expect(typesOf(atSixtyTwo)).not.toContain('PlatformConfigurationChanged')
    expect(session.state().platform.visualState).toBe('outpost')
    session.submit(first + 1, undock)
    const second = mineCore(session, first + 10, tiles.slice(62, 66))
    session.submit(second, poseAtDock())
    const atSixtySix = session.submit(second, dock)
    expect(atSixtySix.filter((event) => event.type === 'PlatformConfigurationChanged')).toEqual([
      expect.objectContaining({ visualState: 'core_drive' }),
    ])
    session.submit(second + 1, undock)
    const third = mineCore(session, second + 10, tiles.slice(66, 70))
    session.submit(third, poseAtDock())
    expect(typesOf(session.submit(third, dock))).not.toContain('PlatformConfigurationChanged')
    expect(session.state().platform).toEqual({ coreBay: 70, visualState: 'core_drive' })
  })
})

describe('platform: shop', () => {
  it('sells the whole hold at 10 per planet-1 surface ore unit and empties it', () => {
    const session = createScriptedSession()
    const tick = mineOreAndDock(session, 4)
    const events = session.submit(tick + 1, sell('all'))
    expect(events).toEqual([
      expect.objectContaining({
        type: 'ResourceSold',
        items: [{ tier: 1, amount: 4 }],
        value: '4e+1',
        mode: 'all',
      }),
    ])
    expect(walletOf(session)).toBe('4e+1')
    expect(session.vehicle().cargo.ore).toEqual({})
  })

  it('sells one tier as a single sale', () => {
    const session = createScriptedSession()
    const tick = mineOreAndDock(session, 2)
    expect(session.submit(tick + 1, sell(1))[0]).toMatchObject({ mode: 'single', value: '2e+1' })
  })

  it('refuses a sale away from the dock, of a tier not held, or of an empty hold', () => {
    const session = createScriptedSession()
    const [ore] = surfaceOreTiles(1)
    mineTile(session, 10, ore)
    expect(rejectionOf(session.submit(60, sell('all')))).toBe('not_docked')
    session.submit(70, poseAtDock())
    session.submit(70, dock)
    expect(rejectionOf(session.submit(71, sell(2)))).toBe('nothing_to_sell')
    session.submit(72, sell('all'))
    expect(rejectionOf(session.submit(73, sell('all')))).toBe('nothing_to_sell')
  })

  it('refuses a malformed tier, naming the field', () => {
    const session = createScriptedSession()
    session.submit(5, dock)
    const [refused] = session.submit(6, sell(0))
    expect(refused).toMatchObject({ reason: 'invalid_payload' })
  })
})

describe('platform: repair and recharge', () => {
  /** Repair is the Upgrade bay's and recharge the Sell bay's (#37). */
  function dockedWith(
    steps: readonly CommandIntent[],
    money = '100',
    bay: BayId = 'sell',
  ): ScriptedSession {
    const session = createScriptedSession()
    session.submit(0, grant(money))
    for (const intent of steps) session.submit(1, intent)
    session.submit(2, poseAtBay(bay))
    session.submit(2, { type: 'dock', payload: { bay } })
    return session
  }

  it('charges 11.25 for a full repair and 11.25 * x for a repair of x of the hull', () => {
    const almostGone = dockedWith(
      [{ type: 'debug.setHull', payload: { hull: '0.001' } }],
      '100',
      'upgrade',
    )
    expect(almostGone.submit(3, repair)[0]).toMatchObject({
      type: 'RepairPurchased',
      hullFrom: '1e-3',
      hullTo: '1e+2',
      cost: '1.125e+1',
    })
    const half = dockedWith([{ type: 'debug.setHull', payload: { hull: '50' } }], '100', 'upgrade')
    expect(half.submit(3, repair)[0]).toMatchObject({ cost: '5.625e+0' })
    expect(walletOf(half)).toBe('9.4375e+1')
    expect(toCanonical(half.vehicle().hull)).toBe('1e+2')
  })

  it('charges 6.75 for a full 150-unit tank and only the missing energy for a partial one', () => {
    const empty = dockedWith([{ type: 'debug.setEnergy', payload: { energy: '0' } }])
    expect(empty.submit(3, recharge)[0]).toEqual(
      expect.objectContaining({ type: 'EnergyRecharged', from: 0, to: FULL_TANK, cost: '6.75e+0' }),
    )
    const half = dockedWith([{ type: 'debug.setEnergy', payload: { energy: '75' } }])
    expect(half.submit(3, recharge)[0]).toMatchObject({ from: 18000, cost: '3.375e+0' })
    expect(half.vehicle().energy).toBe(FULL_TANK)
  })

  it('rounds a charge up to the next 0.001', () => {
    const session = dockedWith([{ type: 'debug.setEnergy', payload: { energy: '149.5' } }])
    // 0.5 unit at 0.045 is 0.0225, rounded up to 0.023.
    expect(session.submit(3, recharge)[0]).toMatchObject({ cost: '2.3e-2' })
  })

  it('refuses a repair or recharge the wallet cannot pay, changing nothing', () => {
    const worn = [
      { type: 'debug.setHull', payload: { hull: '50' } },
      { type: 'debug.setEnergy', payload: { energy: '0' } },
    ] as const
    const atUpgradeBay = dockedWith(worn, '1', 'upgrade')
    const atSellBay = dockedWith(worn, '1', 'sell')
    const before = atUpgradeBay.state().players
    expect(rejectionOf(atUpgradeBay.submit(3, repair))).toBe('money_short')
    expect(rejectionOf(atSellBay.submit(4, recharge))).toBe('money_short')
    expect(atUpgradeBay.state().players.p1.vehicle).toEqual(before.p1.vehicle)
    expect(walletOf(atUpgradeBay)).toBe('1e+0')
    expect(walletOf(atSellBay)).toBe('1e+0')
  })

  it('refuses to repair a full hull or recharge a full tank', () => {
    expect(rejectionOf(dockedWith([], '100', 'upgrade').submit(3, repair))).toBe('hull_full')
    expect(rejectionOf(dockedWith([]).submit(4, recharge))).toBe('energy_full')
  })
})

describe('platform: quick service', () => {
  /** A docked vehicle with 4 ore, half a hull and a quarter tank, and no money. */
  const worn: readonly [number, CommandIntent][] = [
    [1, { type: 'debug.setHull', payload: { hull: '50' } }],
  ]

  function wornSessionAtDock(): { session: ScriptedSession; tick: number } {
    const session = sessionAfter(worn)
    const tick = mineOreAndDock(session, 4)
    session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '37.5' } })
    return { session, tick: tick + 1 }
  }

  it('sells, repairs and recharges in that order with the three normal events', () => {
    const { session, tick } = wornSessionAtDock()
    const events = session.submit(tick, quickService)
    expect(typesOf(events)).toEqual(['ResourceSold', 'RepairPurchased', 'EnergyRecharged'])
    expect(events[0]).toMatchObject({ mode: 'all' })
  })

  it('leaves the same money and vehicle as the three actions at current prices', () => {
    const quick = wornSessionAtDock()
    const quote = serviceQuote(quick.session.state(), 'p1')
    quick.session.submit(quick.tick, quickService)
    const three = wornSessionAtDock()
    three.session.submit(three.tick, sell('all'))
    three.session.submit(three.tick, recharge)
    moveToUpgradeBay(three.session, three.tick)
    three.session.submit(three.tick, repair)
    expect(walletOf(quick.session)).toBe(walletOf(three.session))
    const { hull, energy, cargo } = three.session.vehicle()
    expect(quick.session.vehicle()).toMatchObject({ hull, energy, cargo })
    // 40 sold, 5.625 repair, 5.0625 -> 5.063 recharge.
    expect(toCanonical(quickServiceCharges(quote))).toBe('1.0688e+1')
    expect(walletOf(quick.session)).toBe('2.9312e+1')
  })

  it('refuses when the sale and the wallet cannot pay the repair and recharge', () => {
    const session = sessionAfter(worn)
    session.submit(2, { type: 'debug.setEnergy', payload: { energy: '0' } })
    session.submit(3, dock)
    expect(rejectionOf(session.submit(4, quickService))).toBe('money_short')
    expect(session.vehicle().energy).toBe(0)
  })

  it('refuses when there is nothing to sell, repair or recharge', () => {
    const session = createScriptedSession()
    session.submit(5, dock)
    expect(rejectionOf(session.submit(6, quickService))).toBe('nothing_to_service')
  })
})

describe('platform: workshop', () => {
  function dockedWithMoney(money: string, playerIds: readonly string[] = ['p1']) {
    const session = createScriptedSession(playerIds)
    for (const playerId of playerIds) session.submit(0, grant(money), playerId)
    for (const playerId of playerIds) session.submit(1, poseAtBay('upgrade'), playerId)
    for (const playerId of playerIds) session.submit(1, dockAtUpgradeBay, playerId)
    return session
  }

  it('prices level 0 of the six tracks at 24, 24, 36, 48, 48 and 72', () => {
    const session = dockedWithMoney('1000')
    const costs = SIX_TRACKS.map((id) => session.submit(2, buy(id))[0])
    expect(costs.map((event) => (event.type === 'UpgradePurchased' ? event.cost : ''))).toEqual([
      '2.4e+1',
      '2.4e+1',
      '3.6e+1',
      '4.8e+1',
      '4.8e+1',
      '7.2e+1',
    ])
    expect(walletOf(session)).toBe('7.48e+2')
  })

  it('prices level 1 at ceil(base * ratio)', () => {
    const session = dockedWithMoney('1000')
    session.submit(2, buy('cargo_hold'))
    session.submit(2, buy('drill_tip'))
    expect(session.submit(3, buy('cargo_hold'))[0]).toMatchObject({ cost: '3e+1' })
    expect(session.submit(3, buy('drill_tip'))[0]).toMatchObject({ cost: '1.11e+2' })
  })

  it('logs the purchase with the levels, curve, tier and the stats at the new level', () => {
    const session = dockedWithMoney('100')
    const [event] = session.submit(2, buy('hull'))
    const levels = { ...session.vehicle().levels }
    const stats = computeVehicleStats(levels)
    expect('stats' in stats).toBe(true)
    expect(event).toEqual(
      expect.objectContaining({
        type: 'UpgradePurchased',
        upgradeId: 'hull',
        kind: 'vertical',
        fromLevel: 0,
        toLevel: 1,
        cost: '4.8e+1',
        costCurveId: 'cost.vehicle.hull',
        totalLevel: 1,
        visualTier: 1,
        statsAfter: 'stats' in stats ? canonicalStatsOf(stats.stats) : {},
      }),
    )
    expect(event.type === 'UpgradePurchased' && event.statsAfter.hullMax).toBe('1.12e+2')
  })

  it('refuses an unaffordable purchase with no state change and no purchase event', () => {
    const session = dockedWithMoney('71.999')
    const before = session.state().players
    const events = session.submit(2, buy('drill_tip'))
    expect(typesOf(events)).toEqual(['CommandRejected'])
    expect(rejectionOf(events)).toBe('money_short')
    expect(session.state().players.p1.vehicle).toEqual(before.p1.vehicle)
    expect(canBuyUpgrade(session.state(), 'p1', 'drill_tip')).toBe(false)
    expect(canBuyUpgrade(session.state(), 'p1', 'boiler')).toBe(true)
  })

  it('refuses an unknown track or a vehicle that is not docked', () => {
    const session = dockedWithMoney('1000')
    expect(rejectionOf(session.submit(2, buy('turret')))).toBe('unknown_upgrade')
    session.submit(3, undock)
    expect(rejectionOf(session.submit(4, buy('boiler')))).toBe('not_docked')
  })

  it('keeps two players levels apart', () => {
    const session = dockedWithMoney('1000', ['p1', 'p2'])
    session.submit(2, buy('engine'), 'p1')
    session.submit(2, buy('boiler'), 'p2')
    expect(session.vehicle('p1').levels).toMatchObject({ engine: 1, boiler: 0 })
    expect(session.vehicle('p2').levels).toMatchObject({ engine: 0, boiler: 1 })
  })

  it('logs the visual tier change once at 8 levels and once at 20, in any purchase order', () => {
    const tiersOf = (order: readonly string[]) => {
      const session = dockedWithMoney('1e9')
      const changes = order.flatMap((id, index) =>
        session
          .submit(2 + index, buy(id))
          .filter((event) => event.type === 'VehicleConfigurationChanged')
          .map((event) => ({ purchase: index + 1, event })),
      )
      return changes.map(({ purchase, event }) => [purchase, event])
    }
    const roundRobin = Array.from({ length: 20 }, (_, index) => SIX_TRACKS[index % 6])
    const oneTrackFirst = [...Array(12).fill('boiler'), ...Array(8).fill('cargo_hold')]
    for (const order of [roundRobin, oneTrackFirst]) {
      expect(tiersOf(order)).toEqual([
        [8, expect.objectContaining({ visualTier: 2 })],
        [20, expect.objectContaining({ visualTier: 3 })],
      ])
    }
  })
})

describe('platform: two bays', () => {
  const SELL_BAY_COMMANDS: readonly CommandIntent[] = [sell('all'), recharge, quickService]
  const UPGRADE_BAY_COMMANDS: readonly CommandIntent[] = [
    repair,
    buy('engine'),
    { type: 'buyCasingGrade', payload: {} },
  ]

  /** Worn, with ore in the hold and money, so every service has something to do. */
  function wornWithOre(): { session: ScriptedSession; tick: number } {
    const session = createScriptedSession()
    session.submit(0, grant('1000'))
    session.submit(1, { type: 'debug.setHull', payload: { hull: '50' } })
    const tick = mineOreAndDock(session, 2)
    session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '75' } })
    return { session, tick: tick + 1 }
  }

  it('docks at the bay whose pad the vehicle stands in and says so in dock_entered', () => {
    const session = createScriptedSession()
    expect(session.submit(5, dock)[1]).toMatchObject({ type: 'DockEntered', bay: 'sell' })
    session.submit(6, undock)
    session.submit(7, poseAtBay('upgrade'))
    expect(session.submit(8, dockAtUpgradeBay)[1]).toMatchObject({
      type: 'DockEntered',
      bay: 'upgrade',
    })
    expect(dockedBayOf(session.state(), 'p1')).toBe('upgrade')
    expect(session.submit(9, undock)[0]).toMatchObject({ type: 'DockLeft', bay: 'upgrade' })
  })

  it('refuses to dock at the other bay until the vehicle has driven onto its pad', () => {
    const session = createScriptedSession()
    session.submit(5, dock)
    session.submit(6, undock)
    expect(rejectionOf(session.submit(7, dockAtUpgradeBay))).toBe('not_docked')
    expect(canDock(session.state(), 'p1', 'upgrade')).toBe(false)
    session.submit(8, poseAtBay('upgrade'))
    expect(canDock(session.state(), 'p1', 'sell')).toBe(false)
    expect(typesOf(session.submit(9, dockAtUpgradeBay))).toContain('DockEntered')
  })

  it('docks again at once after undocking while still in the pad zone: there is no grace', () => {
    const session = createScriptedSession()
    session.submit(5, dock)
    session.submit(6, undock)
    expect(typesOf(session.submit(6, dock))).toContain('DockEntered')
  })

  it('sells, recharges and runs the quick action at the Sell bay; buys and repairs are wrong_bay', () => {
    for (const intent of SELL_BAY_COMMANDS) {
      const { session, tick } = wornWithOre()
      expect(rejectionOf(session.submit(tick, intent))).toBeNull()
    }
    for (const intent of UPGRADE_BAY_COMMANDS) {
      const { session, tick } = wornWithOre()
      const before = session.state().players
      expect(rejectionOf(session.submit(tick, intent))).toBe('wrong_bay')
      expect(session.state().players).toEqual(before)
    }
  })

  it('buys and repairs at the Upgrade bay; selling, recharging and the quick action are wrong_bay', () => {
    for (const intent of UPGRADE_BAY_COMMANDS) {
      const { session, tick } = wornWithOre()
      moveToUpgradeBay(session, tick)
      expect(rejectionOf(session.submit(tick, intent))).toBeNull()
    }
    for (const intent of SELL_BAY_COMMANDS) {
      const { session, tick } = wornWithOre()
      moveToUpgradeBay(session, tick)
      expect(rejectionOf(session.submit(tick, intent))).toBe('wrong_bay')
    }
  })

  it('banks carried core fragments on docking at the Upgrade bay too', () => {
    const session = createScriptedSession()
    equipForCore(session)
    const tick = mineCore(session, 10, coreTiles(4))
    session.submit(tick, poseAtBay('upgrade'))
    const events = session.submit(tick, dockAtUpgradeBay)
    expect(events.find((event) => event.type === 'CoreBayDeposited')).toMatchObject({
      fragments: 4,
      source: 'dock',
    })
  })

  it('tows a wrecked vehicle home docked at the Sell bay', () => {
    const session = createScriptedSession()
    session.submit(5, poseAbove(GROUND, FACING.down))
    session.submit(6, { type: 'debug.setHull', payload: { hull: '0' } })
    session.submit(7, { type: 'requestRescue', payload: {} })
    expect(session.vehicle().mode).toBe('docked')
    expect(dockedBayOf(session.state(), 'p1')).toBe('sell')
  })

  it('starts the run in the Sell bay', () => {
    expect(createScriptedSession().vehicle().pose).toEqual(dockedPoseAt(SITE))
    expect(canDock(createScriptedSession().state(), 'p1', 'sell')).toBe(true)
  })
})

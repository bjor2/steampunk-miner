import { describe, expect, it } from 'vitest'
import { ENERGY_QUANTA_PER_UNIT } from '../../constants/balance'
import { MM_PER_METRE } from '../../constants/physics'
import {
  CORRIDOR_MIDDLE,
  prepareCorridor,
  spawnEnemy,
} from '../../systems/authority/combat/combatFixtures'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { statsOfVehicle } from '../../systems/vehicle/vehicleState'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { chargesLeftOf, intentToUseSlot } from '../power-up-core'
import { AETHERIC_ECONOMY } from './systems/aethericEconomy'
import { ENERGY_SHORT } from './systems/aethericEvents'
import { GOVERNOR_ID } from './systems/governorItem'
import { isInHeldPocket } from './systems/governorPockets'
import { itemHeatUnitsAt } from './systems/itemHeat'
import { pocketOf } from './systems/pocketSection'

// The chronometric governor in play on the loaded slices (#263, the GD lock on #245 "slow"): a slot
// tap opens a pocket round the tile the vehicle stands on, and every enemy within its range steps
// at half speed until it ends; the vehicle is never slowed. In the corridor fight of
// `combatFixtures.ts`: a crawler walks in from the left while the vehicle stands still.

const GOVERNOR = AETHERIC_ECONOMY.chronometricGovernor
const EFFECT_TICKS = 6
/** Five tiles left of the vehicle: past a crawler's 4-tile lunge, so it walks for a while. */
const SPAWN_DX = -5
/** Ticks of walking measured after the act: well before the crawler reaches its lunge reach. */
const WALK_TICKS = 20

interface GovernedFight {
  session: ScriptedSession
  pressTick: number
  actTick: number
  /** The crawler's x each tick from the press on, index 0 the press tick. */
  crawlerXs: number[]
}

/**
 * The corridor fight: the governor in `powerup.1`, a crawler spawned five tiles left, a tap on the
 * next tick, stepped tick by tick for `ticks` ticks while the vehicle stands still.
 */
function governedFight({ press = true, ticks = WALK_TICKS, energy = '' } = {}): GovernedFight {
  const session = createScriptedSession()
  const start = prepareCorridor(session, FACING.right)
  session.submit(start, setVehicleLoadoutCommand({ 'powerup.1': GOVERNOR_ID }))
  session.submit(start, spawnEnemy('crawler', 1, SPAWN_DX))
  if (energy !== '') session.submit(start, { type: 'debug.setEnergy', payload: { energy } })
  const pressTick = start + 1
  if (press) session.submit(pressTick, intentToUseSlot('powerup.1'))
  const crawlerXs = [crawlerXOf(session)]
  for (let at = 1; at <= ticks; at++) {
    session.advanceTo(pressTick + at)
    crawlerXs.push(crawlerXOf(session))
  }
  return { session, pressTick, actTick: pressTick + GOVERNOR.windupTicks, crawlerXs }
}

function crawlerXOf(session: ScriptedSession): number {
  return session.state().combat.enemies[0].x
}

/** How far the crawler moved on each tick in [from, to], ticks counted from the press. */
function stepsBetween(xs: readonly number[], from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, at) => xs[from + at] - xs[from + at - 1])
}

function eventsOfType(session: ScriptedSession, type: string) {
  return session.events().filter((event) => event.type === type)
}

describe('chronometric governor', () => {
  it('slows an enemy inside the pocket to half its step within 6 ticks of the press', () => {
    const free = governedFight({ press: false })
    const governed = governedFight()
    const freeStep = stepsBetween(free.crawlerXs, EFFECT_TICKS, EFFECT_TICKS)[0]
    expect(freeStep).toBeGreaterThan(0)
    expect(stepsBetween(governed.crawlerXs, EFFECT_TICKS, WALK_TICKS)).toEqual(
      stepsBetween(free.crawlerXs, EFFECT_TICKS, WALK_TICKS).map((step) => Math.floor(step / 2)),
    )
  })

  it('leaves the vehicle’s motion as it was: the same pose and the same drive stats', () => {
    const free = governedFight({ press: false })
    const governed = governedFight()
    expect(governed.session.vehicle().pose).toEqual(free.session.vehicle().pose)
    expect(statsOfVehicle(governed.session.vehicle())).toEqual(
      statsOfVehicle(free.session.vehicle()),
    )
  })

  it('slows no enemy beyond the pocket’s range', () => {
    const { session, pressTick } = governedFight({ ticks: EFFECT_TICKS })
    const crawler = session.state().combat.enemies[0]
    const outside = { ...crawler, x: crawler.x - GOVERNOR.rangeTiles * MM_PER_METRE }
    expect(isInHeldPocket(session.state(), crawler, pressTick + EFFECT_TICKS)).toBe(true)
    expect(isInHeldPocket(session.state(), outside, pressTick + EFFECT_TICKS)).toBe(false)
  })

  it('opens the pocket round the tile the vehicle stood on, until its duration ends', () => {
    const { session, actTick } = governedFight({ ticks: EFFECT_TICKS })
    expect(pocketOf(session.state(), 'p1').pocket).toMatchObject({
      tx: CORRIDOR_MIDDLE.tx,
      ty: CORRIDOR_MIDDLE.ty,
      reachMm: GOVERNOR.rangeTiles * MM_PER_METRE,
      lastTick: actTick + GOVERNOR.durationTicks,
    })
  })

  it('closes when its duration ends, leaving the section as if it never opened', () => {
    const { session } = governedFight({ ticks: GOVERNOR.windupTicks + 1 })
    expect(pocketOf(session.state(), 'p1').pocket).not.toBeNull()
    session.advanceTo(session.state().tick + GOVERNOR.durationTicks + 1)
    expect(pocketOf(session.state(), 'p1')).toEqual({ pocket: null })
    expect(session.state().players.p1.slices ?? {}).not.toHaveProperty('aetheric.pocket')
  })

  it('takes its energy each tick it holds, and puts its heat on the item gauge', () => {
    const ticks = GOVERNOR.windupTicks + GOVERNOR.durationTicks + 2
    const free = governedFight({ press: false, ticks })
    const governed = governedFight({ ticks })
    expect(free.session.vehicle().energy - governed.session.vehicle().energy).toBe(
      GOVERNOR.energyQuantaPerTick * GOVERNOR.durationTicks,
    )
    const heatAtAct = itemHeatUnitsAt(governed.session.state(), 'p1', governed.actTick)
    expect(heatAtAct).toBe(GOVERNOR.heatUnits)
    expect(governed.session.vehicle().cargo).toEqual(free.session.vehicle().cargo)
    expect(governed.session.state().players.p1.wallet).toEqual(
      free.session.state().players.p1.wallet,
    )
    expect(chargesLeftOf(governed.session.state(), 'p1', GOVERNOR_ID)).toBe(GOVERNOR.charges - 1)
  })

  it('closes early when the tank runs dry, and the enemy steps at full speed again', () => {
    // One unit in the tank pays the open's tick and the next ones until it runs out.
    const paidTicks = ENERGY_QUANTA_PER_UNIT / GOVERNOR.energyQuantaPerTick
    const ticks = GOVERNOR.windupTicks + paidTicks + 2
    const governed = governedFight({ energy: '1', ticks })
    expect(governed.session.vehicle().energy).toBe(0)
    expect(pocketOf(governed.session.state(), 'p1').pocket).toBeNull()
    expect(paidTicks).toBeLessThan(GOVERNOR.durationTicks)
  })

  it('logs one pocket_opened beside power_up_used, on the act tick', () => {
    const fight = governedFight({ ticks: EFFECT_TICKS })
    expect(eventsOfType(fight.session, 'power-up-core.PowerUpUsed')).toMatchObject([
      { tick: fight.actTick, itemId: GOVERNOR_ID },
    ])
    expect(eventsOfType(fight.session, 'aetheric.PocketOpened')).toEqual([
      {
        tick: fight.actTick,
        type: 'aetheric.PocketOpened',
        playerId: 'p1',
        itemId: GOVERNOR_ID,
        tx: CORRIDOR_MIDDLE.tx,
        ty: CORRIDOR_MIDDLE.ty,
        rangeTiles: GOVERNOR.rangeTiles,
        durationTicks: GOVERNOR.durationTicks,
        energyPerTick: GOVERNOR.energyQuantaPerTick,
        heat: GOVERNOR.heatUnits,
      },
    ])
  })

  it('is refused energy_short on a tank that cannot pay its first tick, spending nothing', () => {
    const governed = governedFight({ energy: '0', ticks: EFFECT_TICKS })
    expect(eventsOfType(governed.session, 'power-up-core.PowerUpRefused')).toMatchObject([
      { itemId: GOVERNOR_ID, reason: ENERGY_SHORT },
    ])
    expect(eventsOfType(governed.session, 'aetheric.PocketOpened')).toEqual([])
    expect(chargesLeftOf(governed.session.state(), 'p1', GOVERNOR_ID)).toBe(GOVERNOR.charges)
    expect(pocketOf(governed.session.state(), 'p1').pocket).toBeNull()
  })

  it('opens no pocket for a player whose slots do not hold the governor', () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.right)
    session.submit(start + 1, intentToUseSlot('powerup.1'))
    session.advanceTo(start + 1 + EFFECT_TICKS)
    expect(eventsOfType(session, 'aetheric.PocketOpened')).toEqual([])
    expect(pocketOf(session.state(), 'p1').pocket).toBeNull()
    expect(itemHeatUnitsAt(session.state(), 'p1', session.state().tick)).toBe(0)
  })
})

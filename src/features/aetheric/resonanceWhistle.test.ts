import { describe, expect, it } from 'vitest'
import { MM_PER_METRE } from '../../constants/physics'
import {
  CORRIDOR_MIDDLE,
  poseAt,
  prepareCorridor,
  spawnEnemy,
} from '../../systems/authority/combat/combatFixtures'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { lureGoalOf } from '../../systems/registries/enemyLures'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { chargesLeftOf, intentToUseSlot } from '../power-up-core'
import { AETHERIC_ECONOMY } from './systems/aethericEconomy'
import { ENERGY_SHORT } from './systems/aethericEvents'
import { WHISTLE_ID } from './systems/whistleItem'
import { whistleOf } from './systems/whistleSection'

// The resonance whistle in play on the loaded slices (#262, the GD lock on #245 "lure"): a slot tap
// sounds the whistle on the tile the vehicle stands on, every hunter within its reach paths to that
// cell for the lure's duration, then hunts the vehicle again. In the corridor fight of
// `combatFixtures.ts`: a crawler comes from the left, the vehicle blows and drives off right.

const WHISTLE = AETHERIC_ECONOMY.resonanceWhistle
const RETARGET_TICKS = 6
/** Five tiles left of the vehicle: past a crawler's 4-tile lunge, so it walks to the vehicle. */
const SPAWN_DX = -5
/** The whistle sounds on the corridor's middle, where the vehicle stands when it is pressed. */
const WHISTLE_CELL = CORRIDOR_MIDDLE
const WHISTLE_CENTRE_X = WHISTLE_CELL.tx * MM_PER_METRE + MM_PER_METRE / 2
const WHISTLE_CENTRE_Y = WHISTLE_CELL.ty * MM_PER_METRE + MM_PER_METRE / 2
/** The vehicle drives this many tiles right after the blow, a tile every few ticks. */
const DRIVE_TILES = 5
const TICKS_PER_TILE = 6

interface WhistleFight {
  session: ScriptedSession
  pressTick: number
  actTick: number
  /** The crawler's x each tick from the press on, index 0 the press tick. */
  crawlerXs: number[]
}

/**
 * The corridor fight: the whistle in `powerup.1`, a crawler spawned five tiles left, a tap on the
 * next tick, then the vehicle drives five tiles right; stepped tick by tick for `ticks` ticks.
 */
function whistleFight({ blow = true, ticks = WHISTLE.durationTicks + 40 } = {}): WhistleFight {
  const session = createScriptedSession()
  const start = prepareCorridor(session, FACING.right)
  session.submit(start, setVehicleLoadoutCommand({ 'powerup.1': WHISTLE_ID }))
  session.submit(start, spawnEnemy('crawler', 1, SPAWN_DX))
  const pressTick = start + 1
  if (blow) session.submit(pressTick, intentToUseSlot('powerup.1'))
  const crawlerXs = [crawlerXOf(session)]
  for (let at = 1; at <= ticks; at++) {
    driveRightAt(session, pressTick, at)
    session.advanceTo(pressTick + at)
    crawlerXs.push(crawlerXOf(session))
  }
  return { session, pressTick, actTick: pressTick + WHISTLE.windupTicks, crawlerXs }
}

/** A pose a tile further right every `TICKS_PER_TILE` ticks once the whistle has acted. */
function driveRightAt(session: ScriptedSession, pressTick: number, ticksAfterPress: number) {
  const ticksDriving = ticksAfterPress - WHISTLE.windupTicks
  if (ticksDriving <= 0 || ticksDriving % TICKS_PER_TILE !== 0) return
  const tiles = Math.min(DRIVE_TILES, ticksDriving / TICKS_PER_TILE)
  const tile = { tx: CORRIDOR_MIDDLE.tx + tiles, ty: CORRIDOR_MIDDLE.ty }
  session.submit(pressTick + ticksAfterPress, poseAt(tile, { facing: FACING.right }))
}

function crawlerXOf(session: ScriptedSession): number {
  return session.state().combat.enemies[0].x
}

/** The first tick after the press in [from, to] at which the crawler moved the way `sign` says. */
function firstTickMoving(xs: readonly number[], sign: 1 | -1, from: number, to: number) {
  for (let at = from; at <= to; at++) if (Math.sign(xs[at] - xs[at - 1]) === sign) return at
  return null
}

function eventsOfType(session: ScriptedSession, type: string) {
  return session.events().filter((event) => event.type === type)
}

describe('resonance whistle', () => {
  it('retargets an enemy in range to the whistle cell within 6 ticks of the press', () => {
    const fight = whistleFight({ ticks: RETARGET_TICKS })
    const state = fight.session.state()
    const goal = lureGoalOf(state, state.combat.enemies[0], fight.pressTick + RETARGET_TICKS)
    expect(goal).toEqual({ x: WHISTLE_CENTRE_X, y: WHISTLE_CENTRE_Y })
  })

  it('holds the enemy at the whistle cell while the vehicle drives off, for the whole duration', () => {
    const { crawlerXs } = whistleFight()
    const lured = crawlerXs.slice(0, WHISTLE.windupTicks + WHISTLE.durationTicks)
    expect(Math.max(...lured)).toBeLessThanOrEqual(WHISTLE_CENTRE_X)
    expect(lured.at(-1)).toBe(WHISTLE_CENTRE_X)
  })

  it('lets the same enemy chase the vehicle past the cell when no whistle is blown', () => {
    const { crawlerXs } = whistleFight({ blow: false })
    expect(Math.max(...crawlerXs)).toBeGreaterThan(WHISTLE_CENTRE_X)
  })

  it('returns the enemy to the vehicle within 6 ticks of the duration ending', () => {
    const { crawlerXs } = whistleFight()
    const silence = WHISTLE.windupTicks + WHISTLE.durationTicks
    expect(firstTickMoving(crawlerXs, 1, silence, silence + RETARGET_TICKS)).not.toBeNull()
  })

  it('logs one whistle_sounded beside power_up_used, on the act tick', () => {
    const fight = whistleFight({ ticks: RETARGET_TICKS })
    expect(eventsOfType(fight.session, 'power-up-core.PowerUpUsed')).toMatchObject([
      { tick: fight.actTick, itemId: WHISTLE_ID },
    ])
    expect(eventsOfType(fight.session, 'aetheric.WhistleSounded')).toEqual([
      {
        tick: fight.actTick,
        type: 'aetheric.WhistleSounded',
        playerId: 'p1',
        itemId: WHISTLE_ID,
        tx: WHISTLE_CELL.tx,
        ty: WHISTLE_CELL.ty,
        reachTiles: WHISTLE.reachTiles,
        durationTicks: WHISTLE.durationTicks,
        energy: WHISTLE.energyQuanta,
      },
    ])
  })

  it('spends one charge and the blow’s energy, and no other resource', () => {
    const silent = whistleFight({ blow: false, ticks: RETARGET_TICKS })
    const blown = whistleFight({ ticks: RETARGET_TICKS })
    expect(silent.session.vehicle().energy - blown.session.vehicle().energy).toBe(
      WHISTLE.energyQuanta,
    )
    expect(blown.session.vehicle().cargo).toEqual(silent.session.vehicle().cargo)
    expect(blown.session.state().players.p1.wallet).toEqual(
      silent.session.state().players.p1.wallet,
    )
    expect(chargesLeftOf(blown.session.state(), 'p1', WHISTLE_ID)).toBe(WHISTLE.charges - 1)
  })

  it('falls silent when the duration ends, leaving the section as if it never sounded', () => {
    const fight = whistleFight()
    expect(whistleOf(fight.session.state(), 'p1')).toEqual({ sounding: null })
    expect(fight.session.state().players.p1.slices ?? {}).not.toHaveProperty('aetheric')
  })

  it('is refused energy_short on a tank that cannot pay, spending nothing', () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.right)
    session.submit(start, setVehicleLoadoutCommand({ 'powerup.1': WHISTLE_ID }))
    session.submit(start, { type: 'debug.setEnergy', payload: { energy: '0' } })
    session.submit(start + 1, intentToUseSlot('powerup.1'))
    session.advanceTo(start + 1 + RETARGET_TICKS)
    expect(eventsOfType(session, 'power-up-core.PowerUpRefused')).toMatchObject([
      { itemId: WHISTLE_ID, reason: ENERGY_SHORT },
    ])
    expect(eventsOfType(session, 'aetheric.WhistleSounded')).toEqual([])
    expect(chargesLeftOf(session.state(), 'p1', WHISTLE_ID)).toBe(WHISTLE.charges)
    expect(whistleOf(session.state(), 'p1').sounding).toBeNull()
  })
})

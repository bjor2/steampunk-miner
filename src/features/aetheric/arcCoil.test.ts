import { describe, expect, it } from 'vitest'
import {
  CORRIDOR_MIDDLE,
  freezeEnemies,
  prepareCorridor,
  setUpgrade,
  spawnEnemy,
} from '../../systems/authority/combat/combatFixtures'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { gunShotDamage } from '../../systems/economy/gunStats'
import { toCanonical } from '../../systems/money'
import { FACING, tileOfMillimetres } from '../../systems/vehicle/vehiclePose'
import { chargesLeftOf, intentToUseSlot } from '../power-up-core'
import { AETHERIC_ECONOMY } from './systems/aethericEconomy'
import { ENERGY_SHORT, NO_TARGET } from './systems/aethericEvents'
import { ARC_COIL_ID } from './systems/arcCoilItem'
import { itemHeatUnitsAt } from './systems/itemHeat'

// The galvanic arc coil in play on the loaded slices (#261, the GD locks on #245 and #255 "arc"):
// a slot tap throws a bolt at the nearest enemy in reach, chaining to at most two more, each hit
// one auto-gun shot at the current drill power. In the corridor fight of `combatFixtures.ts`, the
// enemies are frozen where they spawn, so the chain is read off their spacing alone.

const ARC_COIL = AETHERIC_ECONOMY.arcCoil
const PLAYER = 'p1'
const EFFECT_TICKS = 6

interface SpawnOffset {
  dx: number
  dy: number
}

/**
 * Straight down from the corridor into the rock (a spawn must be inside the planet), three tiles
 * apart: a chain within 4 tiles, the fourth one hop too many, and one in the corridor that is
 * further from the first hit than the second.
 */
const CHAIN: SpawnOffset[] = [
  { dx: 0, dy: -2 },
  { dx: 0, dy: -5 },
  { dx: 0, dy: -8 },
  { dx: 0, dy: -11 },
  { dx: -3, dy: 0 },
]

interface ArcFight {
  session: ScriptedSession
  pressTick: number
  actTick: number
  healthBefore: Map<string, string>
}

/** The corridor, the coil in `powerup.1`, `spawns` frozen where they land, a tap on the next tick. */
function arcFight(spawns: readonly SpawnOffset[], { energy = '' } = {}): ArcFight {
  const session = createScriptedSession()
  const start = prepareCorridor(session, FACING.right)
  session.submit(start, setVehicleLoadoutCommand({ 'powerup.1': ARC_COIL_ID }))
  session.submit(start, freezeEnemies(true))
  spawns.forEach(({ dx, dy }) => session.submit(start, spawnEnemy('crawler', 21, dx, dy)))
  if (energy !== '') session.submit(start, { type: 'debug.setEnergy', payload: { energy } })
  const healthBefore = new Map(
    session.state().combat.enemies.map((enemy) => [enemy.id, toCanonical(enemy.health)]),
  )
  const pressTick = start + 1
  session.submit(pressTick, intentToUseSlot('powerup.1'))
  session.advanceTo(pressTick + EFFECT_TICKS)
  return { session, pressTick, actTick: pressTick + ARC_COIL.windupTicks, healthBefore }
}

function eventsOfType(session: ScriptedSession, type: string) {
  return session.events().filter((event) => event.type === type)
}

function damagedIdsOf(session: ScriptedSession): string[] {
  return eventsOfType(session, 'EnemyDamaged').map((event) =>
    'enemyId' in event ? String(event.enemyId) : '',
  )
}

const shotDamage = (session: ScriptedSession) =>
  toCanonical(gunShotDamage(session.vehicle().levels.drill_power))

describe('galvanic arc coil', () => {
  it('hits the nearest enemy in reach and chains to at most two more, within 6 ticks', () => {
    const fight = arcFight(CHAIN)
    expect(fight.session.state().combat.enemies.map((enemy) => enemy.id)).toEqual([
      'e1',
      'e2',
      'e3',
      'e4',
      'e5',
    ])
    expect(damagedIdsOf(fight.session)).toEqual(['e1', 'e2', 'e3'])
    expect(eventsOfType(fight.session, 'EnemyDamaged')[0].tick).toBeLessThanOrEqual(
      fight.pressTick + EFFECT_TICKS,
    )
  })

  it('deals each enemy one auto-gun shot at the current drill power, and no more', () => {
    const fight = arcFight(CHAIN)
    const damage = shotDamage(fight.session)
    expect(eventsOfType(fight.session, 'EnemyDamaged')).toMatchObject([
      { enemyId: 'e1', amount: damage, ticks: 0 },
      { enemyId: 'e2', amount: damage, ticks: 0 },
      { enemyId: 'e3', amount: damage, ticks: 0 },
    ])
    const untouched = fight.session
      .state()
      .combat.enemies.filter((enemy) => enemy.id === 'e4' || enemy.id === 'e5')
    expect(untouched.map((enemy) => toCanonical(enemy.health))).toEqual(
      untouched.map((enemy) => fight.healthBefore.get(enemy.id)),
    )
  })

  it('adds its heat to the item gauge and takes its energy and a charge', () => {
    const free = arcFight([])
    const fight = arcFight(CHAIN)
    expect(itemHeatUnitsAt(fight.session.state(), PLAYER, fight.actTick)).toBe(ARC_COIL.heatUnits)
    expect(free.session.vehicle().energy - fight.session.vehicle().energy).toBe(
      ARC_COIL.energyQuanta,
    )
    expect(chargesLeftOf(fight.session.state(), PLAYER, ARC_COIL_ID)).toBe(ARC_COIL.charges - 1)
    expect(fight.session.vehicle().cargo).toEqual(free.session.vehicle().cargo)
  })

  it('does not chain to an enemy further than chainTiles from the last one hit', () => {
    const apart = [
      { dx: 0, dy: -2 },
      { dx: 0, dy: -(2 + ARC_COIL.chainTiles + 1) },
    ]
    const fight = arcFight(apart)
    expect(damagedIdsOf(fight.session)).toEqual(['e1'])
  })

  it('reaches no enemy beyond its range', () => {
    const fight = arcFight([{ dx: 0, dy: -(ARC_COIL.rangeTiles + 2) }])
    const enemy = fight.session.state().combat.enemies[0]
    expect(CORRIDOR_MIDDLE.ty - tileOfMillimetres(enemy.x, enemy.y).ty).toBe(
      ARC_COIL.rangeTiles + 2,
    )
    expect(eventsOfType(fight.session, 'power-up-core.PowerUpRefused')).toMatchObject([
      { itemId: ARC_COIL_ID, reason: NO_TARGET },
    ])
  })

  it('is refused no_target with no enemy about, spending nothing', () => {
    const fight = arcFight([])
    expect(eventsOfType(fight.session, 'power-up-core.PowerUpRefused')).toMatchObject([
      { itemId: ARC_COIL_ID, reason: NO_TARGET },
    ])
    expect(eventsOfType(fight.session, 'aetheric.ArcFired')).toEqual([])
    expect(chargesLeftOf(fight.session.state(), PLAYER, ARC_COIL_ID)).toBe(ARC_COIL.charges)
    expect(itemHeatUnitsAt(fight.session.state(), PLAYER, fight.actTick)).toBe(0)
  })

  it('is refused energy_short on a tank that cannot pay the bolt, spending nothing', () => {
    const fight = arcFight(CHAIN, { energy: '0' })
    expect(eventsOfType(fight.session, 'power-up-core.PowerUpRefused')).toMatchObject([
      { itemId: ARC_COIL_ID, reason: ENERGY_SHORT },
    ])
    expect(damagedIdsOf(fight.session)).toEqual([])
    expect(chargesLeftOf(fight.session.state(), PLAYER, ARC_COIL_ID)).toBe(ARC_COIL.charges)
  })

  it('logs one arc_fired beside power_up_used on the act tick', () => {
    const fight = arcFight(CHAIN)
    expect(eventsOfType(fight.session, 'power-up-core.PowerUpUsed')).toMatchObject([
      { tick: fight.actTick, itemId: ARC_COIL_ID },
    ])
    expect(eventsOfType(fight.session, 'aetheric.ArcFired')).toEqual([
      {
        tick: fight.actTick,
        type: 'aetheric.ArcFired',
        playerId: PLAYER,
        itemId: ARC_COIL_ID,
        targets: 3,
        damage: shotDamage(fight.session),
        energy: ARC_COIL.energyQuanta,
        heat: ARC_COIL.heatUnits,
      },
    ])
  })

  it('removes an enemy the bolt leaves at no health, as any kill does', () => {
    const fight = arcFight([{ dx: 0, dy: -2 }])
    const weak = arcFightAtTier(1)
    expect(fight.session.state().combat.enemies).toHaveLength(1)
    expect(weak.session.state().combat.enemies).toHaveLength(0)
    expect(eventsOfType(weak.session, 'EnemyKilled')).toMatchObject([{ enemyId: 'e1' }])
  })
})

/** The fight with one tier-`tier` crawler two tiles down and the drill at major 60, for a kill. */
function arcFightAtTier(tier: number): ArcFight {
  const session = createScriptedSession()
  const start = prepareCorridor(session, FACING.right)
  session.submit(start, setUpgrade('drill_power', 60))
  session.submit(start, setVehicleLoadoutCommand({ 'powerup.1': ARC_COIL_ID }))
  session.submit(start, freezeEnemies(true))
  session.submit(start, spawnEnemy('crawler', tier, 0, -2))
  const pressTick = start + 1
  session.submit(pressTick, intentToUseSlot('powerup.1'))
  session.advanceTo(pressTick + EFFECT_TICKS)
  return { session, pressTick, actTick: pressTick + ARC_COIL.windupTicks, healthBefore: new Map() }
}

import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { continueScriptedSession, poseAbove } from '../../../systems/authority/scriptedSession'
import { cmp, fromSafeInteger, toCanonical } from '../../../systems/money'
import { contentOf } from '../../../systems/registries/content'
import { interceptedHullDamage } from '../../../systems/registries/hullDamageIntercepts'
import { vehicleMotionAt } from '../../../systems/registries/vehicleMotionEffects'
import { setPlanetCommand } from '../../../systems/startScenarioCommands'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { planetParamsFor } from '../../../systems/world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { LOCKED_SCHEDULE } from '../../../systems/unlocks/unlockSchedule'
import { oreFamilies } from '../../ores'
import { intentToUseSlot } from '../../power-up-core'
import { CHOOSE_FORK_COMMAND, FORK_TIER, nodeCostOf } from '../../tech-tree'
import { MOBILITY_ITEM } from './itemIds'
import {
  AGILE_BRANCH,
  ARMOURED_BRANCH,
  ARMOURED_LEANED_ROW,
  armouredCurtainTicksOf,
  footingOf,
  MOBILITY_FORK,
} from './mobilityFork'
import { MOBILITY_FORK_NUMBERS } from './mobilityForkEconomy'
import { mobilityRowOf } from './mobilityCatalogue'
import { mobilityOf } from './mobilitySection'

// The mobility lane's P16 fork (GD lock on #255, build 3, ticket 268): Agile gains lift and drive
// off the ground, Armoured takes grounded hits at its share and, once the shields row is open,
// keeps a raised steam curtain standing longer; each only while it is the lane's active branch.

const PLAYER = 'p1'
const SEED = 83921
const SHIELDS_PLANET = 22
const HIT = fromSafeInteger(1000)
const canonical = (amount: number) => toCanonical(fromSafeInteger(amount))
const PRESS_TICK = 10
const SETTLED_TICK = 30

/** A surface tile of `planet`, away from the pad: the miner stands on it. */
function surfaceOf(planet: number): TilePoint {
  const params = planetParamsFor(SEED, planet)
  return { tx: 20, ty: surfaceRowOfColumn(20, params.radiusTiles) }
}

/** Player `p1` on `planet` (the fork's own by default), the mobility fork chosen as `branch`. */
function sessionWithBranch(branch: string | null, planet = FORK_TIER) {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: SEED, playerIds: [PLAYER] })
  const session = continueScriptedSession(start)
  const setup: CommandIntent[] = [
    setPlanetCommand(FORK_TIER),
    { type: 'debug.setMoney', payload: { amount: '1e30' } },
    ...(branch === null ? [] : [chooseMobilityBranch(branch)]),
    ...(planet === FORK_TIER ? [] : [setPlanetCommand(planet)]),
  ]
  setup.forEach((intent) => session.submit(0, intent))
  return session
}

function chooseMobilityBranch(branch: string): CommandIntent {
  return { type: CHOOSE_FORK_COMMAND, payload: { lane: 'mobility', branch } } as CommandIntent
}

/** The session with the miner resting on the surface, or `rowsUp` tiles over it in open air. */
function standing(branch: string | null, rowsUp: number) {
  const session = sessionWithBranch(branch)
  const surface = surfaceOf(FORK_TIER)
  session.submit(1, poseAbove({ ...surface, ty: surface.ty + rowsUp }, FACING.right))
  return session.state()
}

const onGround = (branch: string | null) => standing(branch, 0)
const inAir = (branch: string | null) => standing(branch, 4)

/** What a 1000-point enemy hit takes off the miner's hull. */
function hitTaken(branch: string | null, isGrounded: boolean): string {
  const state = isGrounded ? onGround(branch) : inAir(branch)
  return toCanonical(interceptedHullDamage(state, PLAYER, 'drill-contact enemy', 1, HIT))
}

/** Where the steam curtain pressed at tick 10 stands until, on `planet`. */
function curtainEndOn(branch: string | null, planet: number): number {
  const session = sessionWithBranch(branch, planet)
  session.submit(1, setVehicleLoadoutCommand({ 'powerup.1': MOBILITY_ITEM.steamShield }))
  session.submit(1, poseAbove(surfaceOf(planet), FACING.right))
  session.submit(PRESS_TICK, intentToUseSlot('powerup.1'))
  session.advanceTo(SETTLED_TICK)
  return mobilityOf(session.state(), PLAYER).shieldUntilTick
}

describe('mobility fork: Agile and Armoured', () => {
  it('registers the pair as two P16 capability nodes that unlock no store item', () => {
    const nodes = contentOf('tech-node').filter((node) => node.id.startsWith('tech.mobility.fork.'))
    expect(nodes.map((node) => node.id).sort()).toEqual([
      'tech.mobility.fork.agile',
      'tech.mobility.fork.armoured',
    ])
    expect(nodes.every((node) => node.unlockTier === 16 && node.costKind === 'capability')).toBe(
      true,
    )
    const storeItems = new Set(contentOf('vehicle-item').map((item) => item.id))
    expect(nodes.filter((node) => storeItems.has(node.unlocks))).toEqual([])
  })

  it('prices both branches the same, on every planet', () => {
    const [agile, armoured] = MOBILITY_FORK.branches
    expect(cmp(nodeCostOf(agile.id)!, nodeCostOf(armoured.id)!)).toBe(0)
  })

  it('reads the miner on the surface as grounded and four tiles over it as airborne', () => {
    expect(footingOf(onGround(null), PLAYER)).toBe('grounded')
    expect(footingOf(inAir(null), PLAYER)).toBe('airborne')
  })

  it('changes neither motion nor hits before the lane chooses', () => {
    expect(vehicleMotionAt(inAir(null), PLAYER, 1)).toMatchObject({
      liftBoostBp: 0,
      driveBoostBp: 0,
    })
    expect(hitTaken(null, true)).toBe(canonical(1000))
  })

  it('Agile lifts and drives harder in the air, and not on the ground', () => {
    const boost = MOBILITY_FORK_NUMBERS.agile.airBoostBp
    expect(boost).toBeGreaterThan(0)
    expect(vehicleMotionAt(inAir(AGILE_BRANCH), PLAYER, 1)).toMatchObject({
      liftBoostBp: boost,
      driveBoostBp: boost,
    })
    expect(vehicleMotionAt(onGround(AGILE_BRANCH), PLAYER, 1)).toMatchObject({
      liftBoostBp: 0,
      driveBoostBp: 0,
    })
    expect(hitTaken(AGILE_BRANCH, true)).toBe(canonical(1000))
  })

  it('Armoured takes three quarters of a hit on the ground, and the whole hit in the air', () => {
    expect(MOBILITY_FORK_NUMBERS.armoured.groundedDamageScaleBp).toBe(7500)
    expect(hitTaken(ARMOURED_BRANCH, true)).toBe(canonical(750))
    expect(hitTaken(ARMOURED_BRANCH, false)).toBe(canonical(1000))
    expect(vehicleMotionAt(inAir(ARMOURED_BRANCH), PLAYER, 1)).toMatchObject({ liftBoostBp: 0 })
  })

  it('Armoured keeps a steam curtain up longer only once the shields row is open', () => {
    const extra = MOBILITY_FORK_NUMBERS.armoured.curtainExtraTicks
    expect(armouredCurtainTicksOf(sessionWithBranch(ARMOURED_BRANCH).state(), PLAYER)).toBe(0)
    const onShields = sessionWithBranch(ARMOURED_BRANCH, SHIELDS_PLANET).state()
    expect(armouredCurtainTicksOf(onShields, PLAYER)).toBe(extra)
    const bareEnd = curtainEndOn(null, SHIELDS_PLANET)
    expect(bareEnd).toBeGreaterThan(SETTLED_TICK)
    expect(curtainEndOn(ARMOURED_BRANCH, SHIELDS_PLANET) - bareEnd).toBe(extra)
    expect(curtainEndOn(ARMOURED_BRANCH, FORK_TIER)).toBe(curtainEndOn(null, FORK_TIER))
    expect(curtainEndOn(AGILE_BRANCH, SHIELDS_PLANET)).toBe(bareEnd)
  })

  it('names neither the leaned row nor its steam shield on a card, and no ore family 3-12', () => {
    const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === ARMOURED_LEANED_ROW)!
    const shield = mobilityRowOf(MOBILITY_ITEM.steamShield)!
    const forbidden = [
      row.id,
      row.name,
      shield.name,
      shield.iconId,
      ...oreFamilies()
        .slice(2)
        .map((family) => family.name),
    ].map((word) => word.toLowerCase())
    const cards = MOBILITY_FORK.branches.map((node) => JSON.stringify(node).toLowerCase())
    expect(cards.flatMap((card) => forbidden.filter((word) => card.includes(word)))).toEqual([])
  })
})

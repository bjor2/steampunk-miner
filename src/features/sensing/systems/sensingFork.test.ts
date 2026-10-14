import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { freezeEnemies, spawnEnemy } from '../../../systems/authority/combat/combatFixtures'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { createScriptedSession, FREEZE_ENEMIES } from '../../../systems/authority/scriptedSession'
import { contentOf } from '../../../systems/registries/content'
import { vehicleItemOfferOf } from '../../../systems/registries/vehicleItemSales'
import { FACING, type Facing } from '../../../systems/vehicle/vehiclePose'
import { planetParamsFor } from '../../../systems/world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { powerUpOfItem } from '../../power-up-core'
import { nodeCostOf } from '../../tech-tree'
import { press, standInPocket } from '../sensingTestSession'
import { divinerReadOf } from './divinerCone'
import { BRANCH_INACTIVE } from './forkItems'
import { boardAfterUses, EMPTY_REVEAL_BOARD } from './revealBoard'
import { vagueMarksOf } from './scoutPing'
import { DIVINER_ROD, divinerLengthOf, SCOUT_PINGER, SENSING_FORK_BALANCE } from './sensingFork'

// The sensing lane's P16 fork (GD lock on #255, ticket 269): each branch is a charged item pressed
// from a slot, so a Scout ping and a Diviner cone read are uses the balance:forks metric counts.
// The Scout's ping is wide and vague, kept until the dock; the Diviner's read narrow and exact.

const FORK_PLANET = 16
const SCOUT = 'tech.sensing.fork.scout'
const DIVINER = 'tech.sensing.fork.diviner'
const PARAMS = planetParamsFor(83921, FORK_PLANET)
/** Twenty tiles under the P16 surface, in solid ground. */
const POCKET: TilePoint = { tx: 20, ty: surfaceRowOfColumn(20, PARAMS.radiusTiles) - 20 }
const PRESS_TICK = 10
const { scout, diviner } = SENSING_FORK_BALANCE

type Branch = 'scout' | 'diviner'

function chooseFork(branch: Branch): CommandIntent {
  return { type: 'tech-tree.choose_fork', payload: { lane: 'sensing', branch } } as CommandIntent
}

/**
 * A rich miner on P16 owning both fork items with `slotted` in slot 1, `branch` chosen (or none),
 * at rest in a pocket facing `facing`.
 */
function minerOnForkPlanet(branch: Branch | null, slotted: string, facing: Facing = FACING.down) {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: FORK_PLANET } })
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e30' } })
  if (branch !== null) session.submit(0, chooseFork(branch))
  session.submit(0, setVehicleLoadoutCommand({ 'powerup.1': slotted }, [SCOUT_PINGER, DIVINER_ROD]))
  standInPocket(session, 1, POCKET, facing)
  return session
}

/** The session after slot 1 is pressed and its wind-up has run. */
function pressedOnce(branch: Branch | null, slotted: string, facing: Facing = FACING.down) {
  const session = minerOnForkPlanet(branch, slotted, facing)
  session.submit(PRESS_TICK, press('powerup.1'))
  session.advanceTo(PRESS_TICK + scout.windupTicks + 2)
  return session
}

function usesIn(events: readonly DomainEvent[]): DomainEvent[] {
  return events.filter((event) => event.type === 'power-up-core.PowerUpUsed')
}

function refusalsIn(events: readonly DomainEvent[]): string[] {
  return events
    .filter((event) => event.type === 'power-up-core.PowerUpRefused')
    .map((event) => (event as unknown as { reason: string }).reason)
}

describe('sensing fork', () => {
  it('registers the Scout and the Diviner as the lane’s P16 pair, priced alike', () => {
    const nodes = contentOf('tech-node').filter((node) => node.id.startsWith('tech.sensing.fork.'))
    expect(nodes.map((node) => [node.id, node.unlockTier, node.unlocks])).toEqual([
      [DIVINER, FORK_PLANET, DIVINER_ROD],
      [SCOUT, FORK_PLANET, SCOUT_PINGER],
    ])
    expect(nodeCostOf(SCOUT)).toEqual(nodeCostOf(DIVINER))
  })

  it('sells both items as charged slot items at one price', () => {
    for (const itemId of [SCOUT_PINGER, DIVINER_ROD]) {
      expect(powerUpOfItem(itemId)?.powerUpClass).toBe('charged')
    }
    const scoutPrice = vehicleItemOfferOf(SCOUT_PINGER)?.price
    expect(scoutPrice).toBeDefined()
    expect(vehicleItemOfferOf(DIVINER_ROD)?.price).toEqual(scoutPrice)
  })

  it('plays the chosen branch’s item and refuses the other branch’s, at no cost', () => {
    expect(usesIn(pressedOnce('scout', SCOUT_PINGER).events())).toHaveLength(1)
    const off = pressedOnce('diviner', SCOUT_PINGER).events()
    expect(usesIn(off)).toEqual([])
    expect(refusalsIn(off)).toEqual([BRANCH_INACTIVE])
    expect(refusalsIn(pressedOnce(null, DIVINER_ROD).events())).toEqual([BRANCH_INACTIVE])
  })

  it('marks one vague cell per block from a Scout ping, never a gate badge, kept until the dock', () => {
    const session = pressedOnce('scout', SCOUT_PINGER)
    const { marks } = boardAfterUses(EMPTY_REVEAL_BOARD, session.events(), session.state(), 'p1')
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.every((mark) => mark.untilTick === null)).toBe(true)
    expect(marks.some((mark) => mark.kind === 'gate')).toBe(false)
    const half = Math.floor(scout.blockTiles / 2)
    const isBlockMiddle = (at: number) =>
      (((at - half) % scout.blockTiles) + scout.blockTiles) % scout.blockTiles === 0
    expect(marks.every((mark) => isBlockMiddle(mark.tile.tx) && isBlockMiddle(mark.tile.ty))).toBe(
      true,
    )
  })

  it('shows the gravest thing in a block: lava over ore over open cave', () => {
    const marks = vagueMarksOf(
      [
        { tile: { tx: 0, ty: 0 }, kind: 'cave', gate: null },
        { tile: { tx: 1, ty: 0 }, kind: 'gate', gate: 'rig' },
        { tile: { tx: 2, ty: 1 }, kind: 'lava', gate: null },
        { tile: { tx: 5, ty: 0 }, kind: 'gate', gate: 'dynamite' },
      ],
      4,
    )
    expect(marks).toEqual([
      { tile: { tx: 2, ty: 2 }, kind: 'lava', gate: null },
      { tile: { tx: 6, ty: 2 }, kind: 'ore', gate: null },
    ])
  })

  it('marks a narrow cone ahead of the drill from a Diviner read, for its reveal time', () => {
    const session = pressedOnce('diviner', DIVINER_ROD, FACING.down)
    const [used] = usesIn(session.events())
    const { marks } = boardAfterUses(EMPTY_REVEAL_BOARD, session.events(), session.state(), 'p1')
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.every((mark) => mark.untilTick === used.tick + diviner.revealTicks)).toBe(true)
    expect(marks.every((mark) => mark.tile.ty < POCKET.ty)).toBe(true)
    const widest = Math.max(...marks.map((mark) => Math.abs(mark.tile.tx - POCKET.tx)))
    expect(widest).toBeLessThanOrEqual(Math.ceil(diviner.lengthTiles / 3))
  })

  it('warns of an enemy in the Diviner’s cone only while the Diviner is the active branch', () => {
    const divining = minerOnForkPlanet('diviner', DIVINER_ROD, FACING.right)
    divining.submit(2, freezeEnemies(true))
    divining.submit(2, spawnEnemy('crawler', 1, 1))
    expect(divinerLengthOf(divining.state(), 'p1')).toBe(diviner.lengthTiles)
    const warnings = divinerReadOf(divining.state(), 'p1')?.warnings ?? []
    expect(warnings.map((warning) => warning.kind)).toContain('enemy')
    expect(divinerReadOf(minerOnForkPlanet('scout', SCOUT_PINGER).state(), 'p1')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  PARAMS,
  poseAbove,
} from '../../../systems/authority/scriptedSession'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../../systems/world/worldState'
import { powerUpAtMarkOf } from '../../power-up-core'
import { lastMarkOf, markLadderOfItem, unlockTierOfItem } from '../../tech-tree'
import { SOFT_GROUND_LINK_REACTION } from './softGroundLink'

// The vibratory bit's re-keyed Mark 3 link (the GD ruling, addendum and TD pin on #276): at most one
// fire per authority tick in which the drill cut soft ground, the corer's own cooldown between
// fires, so the count never scales with speed. Drill commands are handed to the reaction as the
// authority hands them, one per tick, with the soft cells the cut crossed in that tick.

const BIT = 'gear.vibratory_bit'
const CORER = 'gear.sampling_corer'
/** Band-1 ground six rows under the surface: the bit is above ore within the corer's half reach. */
const SOFT_GROUND: TilePoint = { tx: 30, ty: 285 }
/** Drill tip 2.48 on planet 1: band-1 ground is under half of it, the bit's soft ground. */
const SHARP_TIP_LEVEL = 40
/** The bit reaches Mark 3 from planet 10 (unlocked on 4). */
const BIT_MARK_3_PLANET = 10

const researchThrough = (planetIndex: number): CommandIntent =>
  ({ type: 'debug.tech-tree.unlockThrough', payload: { planetIndex } }) as CommandIntent

/** The miner over soft ground with the bit and the corer slotted, the bit at Mark 3. */
function drillingSoftGround(): AuthorityState {
  const session = createScriptedSession()
  session.submit(0, researchThrough(BIT_MARK_3_PLANET))
  session.submit(0, {
    type: 'debug.setUpgrade',
    payload: { upgradeId: 'drill_tip', level: SHARP_TIP_LEVEL },
  })
  session.submit(0, setVehicleLoadoutCommand({ 'drill.head': BIT, 'drill.collar': CORER }))
  session.submit(1, poseAbove(SOFT_GROUND, FACING.down))
  return session.state()
}

/** Band-1 plain ground cells, the continuous soft ground a fast cut keeps crossing. */
const SOFT_CELLS: readonly TilePoint[] = Array.from({ length: 40 }, (_, at) => ({
  tx: 10 + at,
  ty: SOFT_GROUND.ty,
})).filter((tile) => kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile)) === CELL_KIND.ground)

/** One drill command at `tick` whose cut yielded `cells` soft cells. */
function drillCommandAt(tick: number, cells: number): DomainEvent[] {
  const stamp = { playerId: 'p1', tick, seq: tick }
  const drilled = { ...stamp, type: 'DrillDamageDealt', ...SOFT_GROUND, ticks: 1, damage: '1' }
  const destroyed = Array.from({ length: cells }, (_, at) => ({
    ...stamp,
    type: 'TileDestroyed',
    ...SOFT_CELLS[(tick + at) % SOFT_CELLS.length],
    kind: 'ground',
  }))
  return [drilled, ...destroyed] as DomainEvent[]
}

/** Whole cells crossed by the end of `tick` at `metresPerSecond` (a cell is a metre). */
function cellsCrossedBy(tick: number, metresPerSecond: number): number {
  return Math.floor((tick * metresPerSecond) / TICKS_PER_SECOND)
}

/** The link's fires over `ticks` of continuous soft ground at `metresPerSecond`. */
function firesOver(ticks: number, metresPerSecond: number): number[] {
  let state = drillingSoftGround()
  const fired: number[] = []
  for (let tick = 2; tick < 2 + ticks; tick++) {
    const cells = cellsCrossedBy(tick, metresPerSecond) - cellsCrossedBy(tick - 1, metresPerSecond)
    if (cells === 0) continue
    const effect = SOFT_GROUND_LINK_REACTION.react(state, state, drillCommandAt(tick, cells))
    state = effect.state
    if (effect.events.some((event) => event.type === 'power-up-core.LinkFired')) fired.push(tick)
  }
  return fired
}

const linkFiresIn = (events: readonly { type: string }[]) =>
  events.filter((event) => event.type === 'power-up-core.LinkFired').length

describe('drill-gear soft-ground link (#276)', () => {
  it('fires as often at 18 m/s as at 100 m/s over the same time in soft ground', () => {
    const corerCooldown = powerUpAtMarkOf(drillingSoftGround(), 'p1', CORER)?.cooldownTicks ?? 0
    const ticks = 2 * corerCooldown + corerCooldown / 2
    const slow = firesOver(ticks, 18)
    const fast = firesOver(ticks, 100)
    expect(slow.length).toBe(3)
    expect(fast.length).toBe(slow.length)
  })

  it("waits out the corer's own cooldown at its Mark between fires", () => {
    const corerCooldown = powerUpAtMarkOf(drillingSoftGround(), 'p1', CORER)?.cooldownTicks ?? 0
    const fired = firesOver(2 * corerCooldown + 10, 100)
    expect(fired.slice(1).map((tick, at) => tick - fired[at])).toEqual([
      corerCooldown,
      corerCooldown,
    ])
  })

  it('fires once for a tick whose cut crosses many soft cells', () => {
    const state = drillingSoftGround()
    const effect = SOFT_GROUND_LINK_REACTION.react(state, state, drillCommandAt(2, 30))
    expect(linkFiresIn(effect.events)).toBe(1)
  })

  it('fires nothing for a second drill command in the same tick', () => {
    const state = drillingSoftGround()
    const first = SOFT_GROUND_LINK_REACTION.react(state, state, drillCommandAt(2, 1))
    const second = SOFT_GROUND_LINK_REACTION.react(first.state, first.state, drillCommandAt(2, 1))
    expect(linkFiresIn(first.events)).toBe(1)
    expect(linkFiresIn(second.events)).toBe(0)
  })

  it('fires nothing for a drill command that cut no soft ground', () => {
    const state = drillingSoftGround()
    const effect = SOFT_GROUND_LINK_REACTION.react(state, state, drillCommandAt(2, 0))
    expect(linkFiresIn(effect.events)).toBe(0)
  })

  it('cools the corer for at least a tick at every Mark, so the link never fires twice a tick', () => {
    const ladder = markLadderOfItem(CORER)
    const unlockTier = unlockTierOfItem(CORER) ?? 0
    for (let mark = 1; ladder !== null && mark <= lastMarkOf(ladder); mark++) {
      const session = createScriptedSession()
      session.submit(0, researchThrough(unlockTier + 3 * (mark - 1)))
      session.submit(0, setVehicleLoadoutCommand({ 'drill.collar': CORER }))
      const corer = powerUpAtMarkOf(session.state(), 'p1', CORER)
      expect(corer?.mark).toBe(mark)
      expect(corer?.cooldownTicks).toBeGreaterThanOrEqual(1)
    }
  })
})

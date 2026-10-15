import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { carveCircleCommand } from '../../systems/authority/groundCommands'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  continueScriptedSession,
  coreTiles,
  createScriptedSession,
  PARAMS,
  poseAbove,
  surfaceOreTiles,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import {
  rankedCandidatesOf,
  scalarHookValueOf,
  type ItemHookContext,
} from '../../systems/registries/itemHooks'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { SOLID_DENSITY } from '../../systems/world/sampleGrid'
import type { TilePoint } from '../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../systems/world/worldCell'
import { cellAt } from '../../systems/world/worldState'
import { chargesLeftOf, intentToUseSlot } from '../power-up-core'
import { COMBO_HOLDS, COMBO_ITEMS } from '.'
import { COMBO_HOOKS } from './systems/comboHooks'
import { SAMPLED_VEIN_REACTION } from './systems/sampledVein'

// #162 acceptance 3 with the combos in play (GD lock on #206: hooks never make air and never touch
// a gated or core cell). A combo is no item a slot presses: it changes how its partner item
// plays, so the partner is pressed with every shipped combo owned. Against the core the drain is
// still blocked, logged and keeps its charge, and no core cell changes even with its reach
// widened toward a plug; and every combo hook only reorders the cells its lane hands it, which
// the lane's own `canMine` and gate checks chose, and widens a reach in whole cells under the cap.

const P1 = 'p1'
const DRAIN = 'power.mineral_drain'
const MM = 1000
const PRESS_TICK = 10
/** The drain's 60-tick channel, and a few ticks for the terrain queue. */
const SETTLED_TICK = 74
const CORE_ORIGIN: TilePoint = { tx: 0, ty: 0 }
/** The winch bore lifts the grapple only after a bore shot (`armouryCombos.test.ts`). */
const AFTER_A_SHOT_REACH_IDS: ReadonlySet<string> = new Set(['combos.winch_bore_reach'])
const SHIPPED_IDS = COMBO_ITEMS.map((item) => item.itemId).filter(
  (itemId) => !Object.hasOwn(COMBO_HOLDS, itemId),
)

function drainAtCore(owned: readonly string[]): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, setVehicleLoadoutCommand({ 'powerup.1': DRAIN }, owned))
  const centre = { x: CORE_ORIGIN.tx * MM + MM / 2, y: CORE_ORIGIN.ty * MM + MM / 2 }
  session.submit(1, carveCircleCommand({ ...centre, radius: 1200, amount: SOLID_DENSITY }))
  const { payload } = poseAbove(CORE_ORIGIN, FACING.up)
  session.submit(2, { type: 'reportPose', payload: { ...payload, ...centre, vx: 0 } })
  return session
}

/** The session with a corer plug kept beside the core, as the corer's `OreSampled` leaves it. */
function withPlugBesideCore(session: ScriptedSession): ScriptedSession {
  const state = session.state()
  const plug: DomainEvent = {
    tick: 3,
    type: 'OreSampled',
    playerId: P1,
    tx: CORE_ORIGIN.tx + 8,
    ty: CORE_ORIGIN.ty,
    oreId: 'kernel.metal.t1',
    via: 'corer',
  }
  return continueScriptedSession(SAMPLED_VEIN_REACTION.react(state, state, [plug]).state)
}

const coreTilesOf = (session: ScriptedSession) =>
  coreTiles(400).filter((tile) => kindAt(session, tile) === CELL_KIND.core)

const kindAt = (session: ScriptedSession, tile: TilePoint) =>
  kindOfCell(cellAt(session.state().world, PARAMS, tile))

const ofType = (events: readonly DomainEvent[], type: string) =>
  events.filter((event) => event.type === type)

function pressDrain(session: ScriptedSession): void {
  session.submit(PRESS_TICK, intentToUseSlot('powerup.1'))
  session.advanceTo(SETTLED_TICK)
}

describe('combos gates fixture', () => {
  it('leaves the drain blocked by the core with every combo owned: logged, charge kept', () => {
    const session = drainAtCore(SHIPPED_IDS)
    const worldBefore = session.state().world
    pressDrain(session)
    expect(ofType(session.events(), 'power-up-core.PowerUpBlocked')).toMatchObject([
      { itemId: DRAIN, gateKind: 'core', chargesLeft: 2 },
    ])
    expect(session.state().world).toBe(worldBefore)
    expect(chargesLeftOf(session.state(), P1, DRAIN)).toBe(2)
  })

  it('changes no core cell when the cored drain widens the reach toward a plug', () => {
    const session = withPlugBesideCore(drainAtCore(SHIPPED_IDS))
    const core = coreTilesOf(session)
    expect(core.length).toBeGreaterThan(100)
    pressDrain(session)
    expect(core.filter((tile) => kindAt(session, tile) !== CELL_KIND.core)).toEqual([])
  })

  it('only reorders the cells a lane hands its hooks, and widens a reach under the cap', () => {
    const session = withPlugBesideCore(drainAtCore(SHIPPED_IDS))
    const state = session.state()
    const candidates = [...surfaceOreTiles(4), ...coreTiles(2)]
    const ctx: ItemHookContext = { tick: 5, mark: 1, magnitude: 6, origin: CORE_ORIGIN, candidates }
    COMBO_HOOKS.forEach(({ id, hook, parentItemId }) => {
      if (hook === 'targetOrder' || hook === 'dragTarget' || hook === 'aim') {
        const ranked = rankedCandidatesOf(state, P1, { point: hook, parentItemId, ctx })
        expect(new Set(ranked), parentItemId).toEqual(new Set(candidates))
        expect(ranked).toHaveLength(candidates.length)
      }
      if (hook === 'reach') {
        const reach = scalarHookValueOf(state, P1, { point: hook, parentItemId, ctx, base: 3 })
        expect(reach).toBeLessThanOrEqual(12)
        if (!AFTER_A_SHOT_REACH_IDS.has(id)) expect(reach).toBeGreaterThan(3)
      }
    })
  })
})

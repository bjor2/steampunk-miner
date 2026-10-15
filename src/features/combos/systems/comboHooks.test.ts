import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { prepareCorridor, spawnEnemy } from '../../../systems/authority/combat/combatFixtures'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import {
  continueScriptedSession,
  createScriptedSession,
  PARAMS,
  surfaceOreTiles,
} from '../../../systems/authority/scriptedSession'
import { densestOreClusterOf, lungeWarningsOf } from '../../../systems/authority/sensingQueries'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import { oreSalePrice } from '../../../systems/economy/oreEconomy'
import { cmp } from '../../../systems/money'
import type { ItemHookContext } from '../../../systems/registries/itemHooks'
import { saleTierOf } from '../../../systems/registries/oreTypes'
import { setPlanetCommand } from '../../../systems/startScenarioCommands'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { COMBO_HOOKS } from './comboHooks'
import {
  assayDrainOrderOf,
  coredDrainOrderOf,
  coredDrainReachOf,
  lodestoneDrainOrderOf,
  lodestoneDrainReachOf,
} from './drainCombos'
import { CORED_DRAIN_ID, SAMPLED_VEIN_REACTION, sampledVeinOf } from './sampledVein'
import {
  alarmRadiusAt,
  alarmShieldFiresOf,
  lensCorerAimOf,
  magneticSurveyTargetOf,
} from './sensingCombos'

// The combos' answers at their partner items' decision points (GD lock on #206): nothing until the
// combo is owned; then the drains' order and reach, the shifter's target, the corer's aim and the
// shield's alarm, each only ranking the lane's own candidates or adding whole cells under the cap.

const P1 = 'p1'
const ORE = surfaceOreTiles(8)
/** Just above the second ore tile, with two more ore tiles within a tile of it. */
const ORIGIN: TilePoint = { tx: ORE[1].tx, ty: ORE[1].ty + 1 }
/** The grade-1 share of the 12-cell cap: half of it. */
const GRADE_1_REACH = 6

function stateOwning(itemIds: readonly string[]): AuthorityState {
  const session = createScriptedSession()
  session.submit(0, setVehicleLoadoutCommand({}, itemIds))
  return session.state()
}

function contextOf(candidates: readonly TilePoint[], extra: Partial<ItemHookContext> = {}) {
  return { tick: 10, mark: 1, magnitude: 6, origin: ORIGIN, candidates, ...extra }
}

function corerPlugOf(tile: TilePoint, oreId: string, via: 'corer' | 'lens' = 'corer') {
  return { tick: 10, type: 'OreSampled', playerId: P1, ...tile, oreId, via } as DomainEvent
}

function withPlug(state: AuthorityState, tile: TilePoint, via: 'corer' | 'lens' = 'corer') {
  const oreId = oreTypeAtTile(state, tile)?.id as string
  return SAMPLED_VEIN_REACTION.react(state, state, [corerPlugOf(tile, oreId, via)]).state
}

/** A ground tile one row above the column's surface: no ore. */
function groundNear(tile: TilePoint): TilePoint {
  return { tx: tile.tx, ty: surfaceRowOfColumn(tile.tx, PARAMS.radiusTiles) + 1 }
}

/** The first ore tile down one column, and the first below it that sells for another price. */
function twoPricedOreTiles(state: AuthorityState): [TilePoint, TilePoint] {
  const tx = ORE[0].tx
  const top = surfaceRowOfColumn(tx, PARAMS.radiusTiles)
  const column = Array.from({ length: 400 }, (_, depth) => ({ tx, ty: top - depth }))
  const ore = column.filter((tile) => oreTypeAtTile(state, tile) !== null)
  const other = ore.find((tile) => cmp(priceAt(state, tile), priceAt(state, ore[0])) !== 0)
  return [ore[0], other as TilePoint]
}

function priceAt(state: AuthorityState, tile: TilePoint) {
  return oreSalePrice(saleTierOf(oreTypeAtTile(state, tile)!))
}

describe('combo hooks', () => {
  it('answers nothing at any point while the player does not own the combo', () => {
    const state = withPlug(stateOwning([]), ORE[1])
    const ctx = contextOf(ORE, { beacon: { tile: ORIGIN, gatherRadiusTiles: 10 } })
    COMBO_HOOKS.forEach((hook) => expect(hook.answer(state, P1, ctx), hook.id).toBeNull())
  })

  it('lists one hook per combo decision point, each on its partner lane item', () => {
    expect(COMBO_HOOKS.map((hook) => `${hook.parentItemId}:${hook.hook}`)).toEqual([
      'power.mineral_drain:targetOrder',
      'power.mineral_drain:reach',
      'power.mineral_drain:targetOrder',
      'power.mineral_drain:reach',
      'power.mineral_drain:targetOrder',
      'power.ore_shifter:dragTarget',
      'gear.sampling_corer:aim',
      'power.steam_shield:autoFire',
      'power.grapple_winch:reach',
    ])
  })
})

describe('combo hooks: assay drain and lens corer', () => {
  it('ranks the cells by what they sell for, the dearer higher, ground lowest', () => {
    const state = stateOwning(['combo.assay_drain', 'combo.lens_corer'])
    const [first, second] = twoPricedOreTiles(state)
    const [cheap, dear] =
      cmp(priceAt(state, first), priceAt(state, second)) < 0 ? [first, second] : [second, first]
    const candidates = [groundNear(cheap), cheap, dear]
    expect(assayDrainOrderOf(state, P1, contextOf(candidates))).toEqual([0, 1, 2])
    expect(lensCorerAimOf(state, P1, contextOf([dear, cheap]))).toEqual([1, 0])
  })

  it('gives cells of one price one score, so the lane keeps its own order among them', () => {
    const state = stateOwning(['combo.assay_drain'])
    const sameOre = ORE.filter((tile) => cmp(priceAt(state, tile), priceAt(state, ORE[0])) === 0)
    const scores = assayDrainOrderOf(state, P1, contextOf(sameOre)) as number[]
    expect(new Set(scores).size).toBe(1)
  })
})

describe('combo hooks: cored drain', () => {
  it('keeps the newest corer plug of a player who owns the combo, on its planet', () => {
    const owner = withPlug(withPlug(stateOwning([CORED_DRAIN_ID]), ORE[1]), ORE[2])
    expect(sampledVeinOf(owner, P1)).toMatchObject({ planetIndex: 1, ...ORE[2] })
  })

  it('keeps nothing for a lens read, or for a player without the combo', () => {
    expect(sampledVeinOf(withPlug(stateOwning([CORED_DRAIN_ID]), ORE[1], 'lens'), P1)).toBeNull()
    const stranger = stateOwning([])
    expect(withPlug(stranger, ORE[1])).toBe(stranger)
  })

  it('forgets the plug on another planet', () => {
    const plugged = withPlug(stateOwning([CORED_DRAIN_ID]), ORE[1])
    expect(sampledVeinOf(plugged, P1)).not.toBeNull()
    const moved = continueScriptedSession(plugged)
    moved.submit(1, setPlanetCommand(2))
    expect(sampledVeinOf(moved.state(), P1)).toBeNull()
  })

  it("widens the drain by the grade's share of the cap while the plug lies within the cap", () => {
    const owner = stateOwning([CORED_DRAIN_ID])
    expect(coredDrainReachOf(owner, P1, contextOf([]))).toBeNull()
    expect(coredDrainReachOf(withPlug(owner, ORE[1]), P1, contextOf([]))).toBe(GRADE_1_REACH)
    const far = { tx: ORIGIN.tx + 13, ty: ORIGIN.ty }
    expect(
      coredDrainReachOf(withPlug(owner, ORE[1]), P1, contextOf([], { origin: far })),
    ).toBeNull()
  })

  it('takes the sampled ore first, nearest the plug, and scores every other cell 0', () => {
    const state = withPlug(stateOwning([CORED_DRAIN_ID]), ORE[1])
    const candidates = [groundNear(ORE[1]), ORE[1], ORE[2]]
    const [ground, plug, other] = coredDrainOrderOf(state, P1, contextOf(candidates)) as number[]
    expect(ground).toBe(0)
    expect(plug).toBeGreaterThan(0)
    const isSameOre = oreTypeAtTile(state, ORE[2])?.id === oreTypeAtTile(state, ORE[1])?.id
    expect(other < plug && (isSameOre ? other > 0 : other === 0)).toBe(true)
  })
})

describe('combo hooks: lodestone drain', () => {
  const beacon = { tile: { tx: ORIGIN.tx + 4, ty: ORIGIN.ty }, gatherRadiusTiles: 10 }

  it("reaches by the grade's share of the cap from a drain started inside the gather radius", () => {
    const owner = stateOwning(['combo.lodestone_drain'])
    expect(lodestoneDrainReachOf(owner, P1, contextOf([], { beacon }))).toBe(GRADE_1_REACH)
    const outside = { tx: beacon.tile.tx + 11, ty: beacon.tile.ty }
    expect(lodestoneDrainReachOf(owner, P1, contextOf([], { beacon, origin: outside }))).toBeNull()
    expect(lodestoneDrainReachOf(owner, P1, contextOf([]))).toBeNull()
  })

  it('takes the gathered cells first, nearest the beacon, and scores the rest 0', () => {
    const owner = stateOwning(['combo.lodestone_drain'])
    const atBeacon = beacon.tile
    const inside = { tx: atBeacon.tx + 3, ty: atBeacon.ty }
    const outside = { tx: atBeacon.tx + 11, ty: atBeacon.ty }
    const scores = lodestoneDrainOrderOf(
      owner,
      P1,
      contextOf([outside, inside, atBeacon], { beacon }),
    )
    expect(scores).toEqual([0, 92, 101])
  })
})

describe('combo hooks: magnetic survey', () => {
  it('drags the nodules nearest the densest draggable cluster first', () => {
    const state = stateOwning(['combo.magnetic_survey'])
    const asker = { playerId: P1, tool: 'terrain-tools.ore_shifter' }
    const cluster = densestOreClusterOf(state, ORIGIN, 12, asker)
    expect(cluster).not.toBeNull()
    const scores = magneticSurveyTargetOf(state, P1, contextOf(ORE)) as number[]
    const best = ORE[scores.indexOf(Math.max(...scores))]
    const distanceSq = (tile: TilePoint) =>
      (tile.tx - cluster!.tile.tx) ** 2 + (tile.ty - cluster!.tile.ty) ** 2
    expect(Math.min(...ORE.map(distanceSq))).toBe(distanceSq(best))
  })
})

describe('combo hooks: alarm shield', () => {
  it("widens the periscope's radius by the grade's share of the way to the 12-tile cap", () => {
    expect([1, 2, 3].map((grade) => alarmRadiusAt(grade, 10))).toEqual([11, 11, 11])
    expect([1, 2, 3].map((grade) => alarmRadiusAt(grade, 4))).toEqual([8, 10, 11])
    expect(alarmRadiusAt(1, 20)).toBe(12)
  })

  it('fires once on a lunge warning inside its radius, and never with no warning', () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session)
    session.submit(start, setVehicleLoadoutCommand({}, ['combo.alarm_shield']))
    expect(alarmShieldFiresOf(session.state(), P1, contextOf([]))).toBeNull()
    session.submit(start, spawnEnemy('crawler', 1, 3))
    for (let tick = start + 1; lungeWarningsOf(session.state(), P1, 12).length === 0; tick++) {
      session.advanceTo(tick)
    }
    expect(alarmShieldFiresOf(session.state(), P1, contextOf([]))).toBe(1)
  })
})

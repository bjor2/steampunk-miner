import { describe, expect, it } from 'vitest'
import { TERRAIN_EDIT_UNITS_PER_TICK, SWAP_CELL_UNITS } from '../../../constants/terrainBudget'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { dockInBay } from '../../../systems/authority/scriptedSession'
import type { TerrainCellEdit } from '../../../systems/authority/terrain/terrainEdits'
import type { ItemHook, ItemHookContext } from '../../../systems/registries/itemHooks'
import { liveBeaconOf } from '../../../systems/registries/liveBeacon'
import { scalarHookValueOf } from '../../../systems/registries/itemHooks'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { slice as TERRAIN_TOOLS_SLICE } from '../register'
import { buriedTile, press, sessionWith, standAt } from '../terrainTestSession'
import { isLooseOre, openGroundView } from './groundView'
import { magnitudeAt, terrainItemNamed } from './itemMagnitude'
import { LODESTONE_BEACON_ID } from './lodestoneBeacon'
import { ORE_SHIFTER_ID, planOreDrag } from './oreShifter'
import { editSourceOf, type TerrainPlan } from './terrainOutcome'

// The terrain lane's item hook consults (GD lock on #206, TD ruling; ticket 326): a combo's
// `dragTarget` answer changes only which loose nodules the ore-shifter drags, never past the Mark's
// count or the activation cap, and never a gated, core or air cell; and every hook hears the owner's
// live lodestone beacon (tile and gather radius) in its context, for `lodestone_drain`. Fixture
// slices register the hooks, so no combo is imported.

const DEPTHS = [6, 8, 12, 18, 24]
/** The bought shifter, and a Mark whose count the 64-swap cap holds back. */
const MARKS = [1, 40]
const GATHER_RADIUS = 10

/** A combo that drags the farthest loose nodules first. */
const FAR_FIRST: ItemHook = {
  id: 'combo-fixture.far_first',
  hook: 'dragTarget',
  laneId: 'terrain-tools',
  parentItemId: ORE_SHIFTER_ID,
  answer: (_state, _playerId, ctx) => ctx.candidates.map((tile) => distanceSq(tile, ctx.origin)),
}

/** A combo that scores every nodule alike, so the shifter's own order decides. */
const NO_PREFERENCE: ItemHook = {
  ...FAR_FIRST,
  id: 'combo-fixture.no_preference',
  answer: (_state, _playerId, ctx) => ctx.candidates.map(() => 0),
}

function fixtureSliceOf(hooks: readonly ItemHook[]): SliceDefinition {
  return { id: 'combo-fixture', register: (r) => hooks.forEach((hook) => r.itemHook(hook)) }
}

/** Every ore cell refused to every tool, as `canMine` refuses a gated one. */
const GATE_EVERY_ORE: SliceDefinition = {
  id: 'gate-probe',
  register: (r) =>
    r.gateCheck({
      id: 'gate-probe.rig',
      check: () => ({ outcome: 'refused', gateKind: 'rig', required: 'rig', have: 'none' }),
    }),
}

function distanceSq(a: TilePoint, b: TilePoint): number {
  return (a.tx - b.tx) ** 2 + (a.ty - b.ty) ** 2
}

function standingState(depth: number): { state: AuthorityState; stand: TilePoint } {
  const session = sessionWith({})
  const stand = buriedTile(depth)
  standAt(session, 5, stand, FACING.right)
  return { state: session.state(), stand }
}

/** The shifter's plan at `stand` with only terrain-tools and `extra` registered. */
function dragWith(
  extra: readonly SliceDefinition[],
  state: AuthorityState,
  stand: TilePoint,
  mark: number,
): TerrainPlan {
  return withRegistrations([TERRAIN_TOOLS_SLICE, ...extra], () => {
    const view = openGroundView(state, 'p1', editSourceOf(ORE_SHIFTER_ID))
    const pose = vehicleOf(state, 'p1').pose
    if (view === null || pose === null) throw new Error('no ground to stand on')
    return planOreDrag(view, { origin: stand, tick: 10, itemId: ORE_SHIFTER_ID, mark }, pose)
  })
}

function cellsOf(plan: TerrainPlan): readonly TerrainCellEdit[] {
  return plan.kind === 'edit' ? plan.cells : []
}

/** Each move is two swaps, the ore onto its resting tile, then the ground back where it was. */
function draggedFrom(cells: readonly TerrainCellEdit[]): string[] {
  return cells.filter((_cell, index) => index % 2 === 1).map(({ tx, ty }) => `${tx},${ty}`)
}

/** The loose ore the drag may move at `stand`, with only terrain-tools registered. */
function looseOreAround(state: AuthorityState, stand: TilePoint): Set<string> {
  return withRegistrations([TERRAIN_TOOLS_SLICE], () => {
    const view = openGroundView(state, 'p1', editSourceOf(ORE_SHIFTER_ID))
    if (view === null) throw new Error('no planet')
    const loose = new Set<string>()
    for (let dy = -8; dy <= 8; dy += 1)
      for (let dx = -8; dx <= 8; dx += 1) {
        const tile = { tx: stand.tx + dx, ty: stand.ty + dy }
        if (isLooseOre(view, tile)) loose.add(`${tile.tx},${tile.ty}`)
      }
    return loose
  })
}

const CASES = DEPTHS.flatMap((depth) => MARKS.map((mark) => [depth, mark] as const))

describe('terrain-tools item hooks', () => {
  it.each(CASES)(
    'a drag hook at depth %i (Mark %i) drags no more than the Mark’s count, within the cap',
    (depth, mark) => {
      const { state, stand } = standingState(depth)
      const hooked = cellsOf(dragWith([fixtureSliceOf([FAR_FIRST])], state, stand, mark))
      const count = magnitudeAt(terrainItemNamed(ORE_SHIFTER_ID), mark)
      expect(draggedFrom(hooked).length).toBeLessThanOrEqual(count)
      expect(hooked.length * SWAP_CELL_UNITS).toBeLessThanOrEqual(TERRAIN_EDIT_UNITS_PER_TICK)
    },
  )

  it.each(CASES)(
    'a hook scoring every nodule alike at depth %i (Mark %i) leaves the drag exactly as it was',
    (depth, mark) => {
      const { state, stand } = standingState(depth)
      const plain = dragWith([], state, stand, mark)
      expect(dragWith([fixtureSliceOf([NO_PREFERENCE])], state, stand, mark)).toEqual(plain)
    },
  )

  it.each(CASES)(
    'a drag hook at depth %i (Mark %i) drags only loose ore, by swaps that make no air',
    (depth, mark) => {
      const { state, stand } = standingState(depth)
      const hooked = cellsOf(dragWith([fixtureSliceOf([FAR_FIRST])], state, stand, mark))
      const loose = looseOreAround(state, stand)
      expect(draggedFrom(hooked).every((tile) => loose.has(tile))).toBe(true)
      expect(hooked.every((cell) => cell.kind === 'swap')).toBe(true)
      const kinds = hooked.map((cell) => (cell.kind === 'swap' ? kindOfCell(cell.cell) : -1))
      expect(kinds.filter((kind) => kind === CELL_KIND.ore)).toHaveLength(hooked.length / 2)
      expect(kinds.filter((kind) => kind === CELL_KIND.ground)).toHaveLength(hooked.length / 2)
    },
  )

  it('changes which nodules the drag takes', () => {
    const changed = CASES.filter(([depth, mark]) => {
      const { state, stand } = standingState(depth)
      const plain = draggedFrom(cellsOf(dragWith([], state, stand, mark)))
      const hooked = draggedFrom(
        cellsOf(dragWith([fixtureSliceOf([FAR_FIRST])], state, stand, mark)),
      )
      return plain.join(';') !== hooked.join(';')
    })
    expect(changed.length).toBeGreaterThan(0)
  })

  it('offers the hook only loose ore cells, nearest first', () => {
    const { state, stand } = standingState(12)
    const heard: ItemHookContext[] = []
    const listening = {
      ...FAR_FIRST,
      answer: (...args: Parameters<typeof FAR_FIRST.answer>) => {
        heard.push(args[2])
        return null
      },
    } as ItemHook
    dragWith([fixtureSliceOf([listening])], state, stand, 1)
    const loose = looseOreAround(state, stand)
    expect(heard).toHaveLength(1)
    expect(heard[0].candidates.length).toBeGreaterThan(0)
    expect(heard[0].candidates.every(({ tx, ty }) => loose.has(`${tx},${ty}`))).toBe(true)
    const distances = heard[0].candidates.map((tile) => distanceSq(tile, stand))
    expect(distances).toEqual([...distances].sort((a, b) => a - b))
  })

  it('still lets a gate block the drag, changing no cell, whatever the hook scores', () => {
    const { state, stand } = standingState(8)
    const plan = dragWith([GATE_EVERY_ORE, fixtureSliceOf([FAR_FIRST])], state, stand, 1)
    expect(plan).toMatchObject({ kind: 'blocked', block: { gateKind: 'rig' } })
  })

  it('tells every hook the owner’s live beacon: its tile and its gather radius', () => {
    const { state, stand } = plantedBeacon(12)
    expect(liveBeaconOf(state, 'p1')).toEqual({ tile: stand, gatherRadiusTiles: GATHER_RADIUS })
    expect(reachHeardBy(state, 'p1')?.beacon).toEqual({
      tile: stand,
      gatherRadiusTiles: GATHER_RADIUS,
    })
  })

  it('tells no beacon to another player, nor once the dock has spent it', () => {
    const { state } = plantedBeacon(12, ['p1', 'p2'])
    expect(liveBeaconOf(state, 'p2')).toBeNull()
    expect(reachHeardBy(state, 'p2')).not.toHaveProperty('beacon')
    expect(liveBeaconOf(dockedAfterPlanting(12), 'p1')).toBeNull()
    expect(reachHeardBy(dockedAfterPlanting(12), 'p1')).not.toHaveProperty('beacon')
  })
})

function plantedBeacon(depth: number, playerIds: readonly string[] = ['p1']) {
  const session = sessionWith({ 'powerup.1': LODESTONE_BEACON_ID }, playerIds)
  const stand = buriedTile(depth)
  standAt(session, 5, stand, FACING.right)
  session.submit(10, press())
  session.advanceTo(12)
  return { state: session.state(), stand }
}

function dockedAfterPlanting(depth: number): AuthorityState {
  const session = sessionWith({ 'powerup.1': LODESTONE_BEACON_ID })
  standAt(session, 5, buriedTile(depth), FACING.right)
  session.submit(10, press())
  dockInBay(session, 40, 'sell')
  session.advanceTo(60)
  return session.state()
}

/** The context a fixture `reach` hook on some drain item hears for `playerId`. */
function reachHeardBy(state: AuthorityState, playerId: string): ItemHookContext | null {
  let heard: ItemHookContext | null = null
  const listening: ItemHook = {
    id: 'combo-fixture.lodestone_reach',
    hook: 'reach',
    laneId: 'extraction',
    parentItemId: 'power.fixture_drain',
    answer: (_state, _playerId, ctx) => {
      heard = ctx
      return null
    },
  }
  withRegistrations([TERRAIN_TOOLS_SLICE, fixtureSliceOf([listening])], () =>
    scalarHookValueOf(state, playerId, {
      point: 'reach',
      parentItemId: 'power.fixture_drain',
      ctx: { tick: 20, mark: 1, magnitude: 4, origin: { tx: 0, ty: 0 }, candidates: [] },
      base: 4,
    }),
  )
  return heard
}

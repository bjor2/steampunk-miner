import { describe, expect, expectTypeOf, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { createAuthorityState } from '../authority/authorityState'
import type { TilePoint } from '../world/tileGrid'
import {
  ITEM_HOOK_POINTS,
  rankedCandidatesOf,
  scalarHookValueOf,
  type ItemHook,
  type ItemHookContext,
  type ItemHookPoint,
  type ScalarHookAsk,
  type ScalarHookPoint,
  type SelectionHookPoint,
} from './itemHooks'
import type { LiveBeacon, LiveBeaconProvider } from './liveBeacon'
import { RegistrationRefusedError } from './seal'

// Slice hooks on how a lane item plays (GD lock on #206, ticket 323). Fake slices register through
// withRegistrations, so no real slice is imported.

const PARENT = 'power.parent_item'
const STATE = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })

const CANDIDATES: readonly TilePoint[] = [
  { tx: 0, ty: -4 },
  { tx: 1, ty: -4 },
  { tx: 2, ty: -4 },
  { tx: 3, ty: -4 },
]

const CONTEXT: ItemHookContext = {
  tick: 120,
  mark: 2,
  magnitude: 6,
  origin: { tx: 0, ty: -3 },
  candidates: CANDIDATES,
}

const SCALAR_POINTS = ITEM_HOOK_POINTS.filter(
  (point): point is ScalarHookPoint => !isSelectionPoint(point),
)
const SELECTION_POINTS = ITEM_HOOK_POINTS.filter(isSelectionPoint)

/** Answers that pass the reach cap and the other points' ceiling together. */
const SCALAR_ANSWERS = [5, -2, 7, 4]
/** Summed: 1, 3, 3, 1; the ties keep the lane's order. */
const SCORE_LISTS = [
  [0, 3, 1, 0],
  [0, 0, 1, 0],
  [0, 0, 1, 1],
  [1, 0, 0, 0],
]
/** Hook ids and the lanes they sit on: the fold sorts by lane, then id. */
const HOOK_SEATS = [
  { id: 'combo-a.first', laneId: 'extraction' },
  { id: 'combo-a.second', laneId: 'terrain-tools' },
  { id: 'combo-b.first', laneId: 'drill-gear' },
  { id: 'combo-b.second', laneId: 'extraction' },
]

function isSelectionPoint(point: ItemHookPoint): point is SelectionHookPoint {
  return point === 'targetOrder' || point === 'dragTarget' || point === 'aim'
}

function scalarAsk(point: ScalarHookPoint, base: number): ScalarHookAsk {
  if (point === 'reach') return { point, parentItemId: PARENT, ctx: CONTEXT, base }
  return { point, parentItemId: PARENT, ctx: CONTEXT, base, ceiling: 9 }
}

function scalarHook(point: ScalarHookPoint, id: string, laneId: string, answer: number | null) {
  return { id, laneId, parentItemId: PARENT, hook: point, answer: () => answer }
}

function selectionHook(point: SelectionHookPoint, id: string, laneId: string, scores: number[]) {
  return { id, laneId, parentItemId: PARENT, hook: point, answer: () => scores }
}

/** One fake slice per hook, each named for its id's prefix. */
function slicesOf(hooks: readonly ItemHook[]): SliceDefinition[] {
  const prefixes = [...new Set(hooks.map((hook) => hook.id.split('.')[0]))]
  return prefixes.map((prefix) => ({
    id: prefix,
    register: (r) =>
      hooks.filter((hook) => hook.id.startsWith(`${prefix}.`)).forEach((hook) => r.itemHook(hook)),
  }))
}

function scalarWith(hooks: readonly ItemHook[], ask: ScalarHookAsk): number {
  return withRegistrations(slicesOf(hooks), () => scalarHookValueOf(STATE, 'p1', ask))
}

function rankedWith(hooks: readonly ItemHook[], point: SelectionHookPoint): TilePoint[] {
  return withRegistrations(slicesOf(hooks), () =>
    rankedCandidatesOf(STATE, 'p1', { point, parentItemId: PARENT, ctx: CONTEXT }),
  )
}

const BEACON: LiveBeacon = { tile: { tx: 4, ty: -9 }, gatherRadiusTiles: 5 }

/** A fake terrain slice whose player `p1` has `BEACON` waiting. */
const BEACON_SLICE: SliceDefinition = {
  id: 'beacon-a',
  register: (r) => r.liveBeacon(beaconProvider()),
}

function beaconProvider(): LiveBeaconProvider {
  return {
    id: 'beacon-a.live',
    liveBeaconOf: (_state, playerId) => (playerId === 'p1' ? BEACON : null),
  }
}

/** The contexts a reach hook and a drag hook heard for player `playerId`. */
function contextsHeard(slices: readonly SliceDefinition[], playerId: string) {
  const heard: ItemHookContext[] = []
  const listen = (ctx: ItemHookContext) => {
    heard.push(ctx)
    return null
  }
  const hooks: ItemHook[] = [
    {
      ...scalarHook('reach', 'combo-a.reach', 'extraction', null),
      answer: (_s, _p, c) => listen(c),
    },
    {
      ...selectionHook('dragTarget', 'combo-a.drag', 'terrain-tools', []),
      answer: (_s, _p, c) => listen(c),
    },
  ]
  withRegistrations([...slicesOf(hooks), ...slices], () => {
    scalarHookValueOf(STATE, playerId, scalarAsk('reach', 3))
    rankedCandidatesOf(STATE, playerId, { point: 'dragTarget', parentItemId: PARENT, ctx: CONTEXT })
  })
  return heard
}

/** Every ordering of `values`. */
function permutationsOf<T>(values: readonly T[]): T[][] {
  if (values.length <= 1) return [[...values]]
  return values.flatMap((value, index) =>
    permutationsOf([...values.slice(0, index), ...values.slice(index + 1)]).map((rest) => [
      value,
      ...rest,
    ]),
  )
}

/** Each answer seated on a hook id and lane, in the order given. */
function seatedScalarHooks(point: ScalarHookPoint, answers: readonly number[]): ItemHook[] {
  return answers.map((answer, index) =>
    scalarHook(point, HOOK_SEATS[index].id, HOOK_SEATS[index].laneId, answer),
  )
}

function seatedSelectionHooks(point: SelectionHookPoint, lists: readonly number[][]): ItemHook[] {
  return lists.map((scores, index) =>
    selectionHook(point, HOOK_SEATS[index].id, HOOK_SEATS[index].laneId, scores),
  )
}

describe('item hooks', () => {
  it('leaves every scalar lane value exactly as it was with nothing registered', () => {
    for (const point of SCALAR_POINTS) expect(scalarWith([], scalarAsk(point, 15))).toBe(15)
  })

  it('leaves every selection lane order exactly as it was with nothing registered', () => {
    for (const point of SELECTION_POINTS) expect(rankedWith([], point)).toEqual(CANDIDATES)
  })

  it('never takes a reach past twelve cells, however many hooks add to it', () => {
    const hooks = seatedScalarHooks('reach', [6, 6, 6])
    expect(scalarWith(hooks, scalarAsk('reach', 4))).toBe(12)
    expect(scalarWith(hooks, { ...scalarAsk('reach', 4), ceiling: 10 })).toBe(10)
  })

  it('holds the other scalar points to the ceiling their lane passes', () => {
    for (const point of SCALAR_POINTS.filter((p) => p !== 'reach')) {
      expect(scalarWith(seatedScalarHooks(point, [3]), scalarAsk(point, 2))).toBe(5)
      expect(scalarWith(seatedScalarHooks(point, [30]), scalarAsk(point, 2))).toBe(9)
    }
  })

  it('hears only the hooks on the asked point and lane item, and none that says nothing', () => {
    const others = [
      { ...scalarHook('reach', 'other.item', 'extraction', 5), parentItemId: 'power.other' },
      scalarHook('tow', 'other.point', 'extraction', 5),
      scalarHook('reach', 'other.silent', 'extraction', null),
    ]
    expect(scalarWith(others, scalarAsk('reach', 4))).toBe(4)
  })

  it('ranks the candidates by summed score and keeps every one of them, adding none', () => {
    for (const point of SELECTION_POINTS) {
      const ranked = rankedWith(seatedSelectionHooks(point, SCORE_LISTS), point)
      expect(ranked).toEqual([CANDIDATES[1], CANDIDATES[2], CANDIDATES[0], CANDIDATES[3]])
    }
  })

  it('gives the same capped scalar for every permutation of the registered hooks', () => {
    for (const point of SCALAR_POINTS) {
      const results = permutationsOf(SCALAR_ANSWERS).map((answers) =>
        scalarWith(seatedScalarHooks(point, answers), scalarAsk(point, 3)),
      )
      expect(new Set(results)).toEqual(new Set([point === 'reach' ? 12 : 9]))
    }
  })

  it('gives the same ranking for every permutation of the registered hooks', () => {
    for (const point of SELECTION_POINTS) {
      const rankings = permutationsOf(SCORE_LISTS).map((lists) =>
        JSON.stringify(rankedWith(seatedSelectionHooks(point, lists), point)),
      )
      expect(new Set(rankings).size).toBe(1)
    }
  })

  it('hands every answer the player’s live beacon on top of the lane’s context', () => {
    const heard = contextsHeard([BEACON_SLICE], 'p1')
    expect(heard).toEqual([
      { ...CONTEXT, beacon: BEACON },
      { ...CONTEXT, beacon: BEACON },
    ])
  })

  it('leaves the beacon out for a player with none, or with no provider', () => {
    expect(contextsHeard([BEACON_SLICE], 'p2')).toEqual([CONTEXT, CONTEXT])
    expect(contextsHeard([], 'p1')).toEqual([CONTEXT, CONTEXT])
  })

  it('refuses a hook whose id names a row of the unlock schedule', () => {
    const naming = scalarHook('reach', 'combo-a.auto_guns', 'extraction', 1)
    expect(() => scalarWith([naming], scalarAsk('reach', 1))).toThrow(RegistrationRefusedError)
    expect(() => scalarWith([naming], scalarAsk('reach', 1))).toThrow(/unlock id "auto_guns"/)
  })

  it('refuses a hook on a point the kernel has not got', () => {
    const digging = { ...scalarHook('reach', 'combo-a.dig', 'drill-gear', 1), hook: 'dig' }
    expect(() => scalarWith([digging as ItemHook], scalarAsk('reach', 1))).toThrow(
      /hooks no point "dig"/,
    )
  })

  it('has no dig point and no dig number in any context (Vertical pin 1)', () => {
    type DigNamed = `${string}${'dig' | 'Dig' | 'bore' | 'Bore' | 'drill' | 'Drill'}${string}`
    type DigField = 'ticksPerCell' | 'hardness' | 'digBudget' | 'feltCps' | 'boreAdvance'
    expectTypeOf<Extract<ItemHookPoint, DigNamed>>().toBeNever()
    expectTypeOf<Extract<keyof ItemHookContext, DigField | DigNamed>>().toBeNever()
    expectTypeOf<NonNullable<ItemHookContext[keyof ItemHookContext]>>().toMatchTypeOf<
      number | TilePoint | readonly TilePoint[] | LiveBeacon
    >()
    expectTypeOf<LiveBeacon[keyof LiveBeacon]>().toMatchTypeOf<number | TilePoint>()
    expect(ITEM_HOOK_POINTS.filter((point) => /dig|bore|drill/i.test(point))).toEqual([])
    expect(
      Object.keys(CONTEXT).filter((field) => /dig|bore|tick.*cell|hard|cps/i.test(field)),
    ).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { cargoCapacity } from '../../../systems/economy/vehicleStats'
import { campaignIndex } from '../../../systems/starMap/campaignIndex'
import { cargoUnitsOf, EMPTY_CARGO, type Cargo } from '../../../systems/vehicle/vehicleState'
import economyFile from '../planet-kit.economy.json'
import {
  containedUnitsOf,
  containersOn,
  dropContainer,
  NO_PLACED_CONTAINERS,
  pickupContainer,
  shownContainersOn,
  type ContainerDrop,
  type PlacedContainers,
} from './placedContainers'
import {
  placedContainersOf,
  placedContainersProblems,
  toPortablePlacedContainers,
} from './placedContainersPortable'
import { planetKitEconomyOf, planetKitEconomyProblems } from './planetKitEconomy'

const ECONOMY = planetKitEconomyOf(economyFile as unknown as Record<string, unknown>)
const CRATE_CAP = ECONOMY.containerCaps.get('cache_crate') as number
const P1 = '1:1'
const P2 = '1:2'
const OWNER = 'player_1'
const GUEST = 'player_2'
const MIXED_HOLD: Cargo = { ore: { '1': 4, '2': 3, '5': 2 }, coreFragments: 1 }

function crateDrop(planetKey: string, hold: Cargo, ownerId = OWNER): ContainerDrop {
  return {
    planetKey,
    kind: 'cache_crate',
    ownerId,
    access: ECONOMY.containerDefaultAccess,
    cell: { tx: 3, ty: -7 },
    hold,
    cap: CRATE_CAP,
  }
}

function dropped(placed: PlacedContainers, drop: ContainerDrop): PlacedContainers {
  const outcome = dropContainer(placed, drop)
  if (!outcome.isDropped) throw new Error(`drop refused: ${outcome.reason}`)
  return outcome.placed
}

/** A hold filled to the capacity of cargo level `level`, spread over three tiers. */
function fullHoldAt(level: number): Cargo {
  const capacity = cargoCapacity(level)
  const third = Math.floor(capacity / 3)
  return { ore: { '1': capacity - 2 * third, '4': third, '9': third }, coreFragments: 0 }
}

/** Through the save codec and back, as a save and load does. */
function savedAndLoaded(placed: PlacedContainers): PlacedContainers {
  const text = JSON.stringify(toPortablePlacedContainers(placed))
  const body: unknown = JSON.parse(text)
  expect(placedContainersProblems(body)).toEqual([])
  return placedContainersOf(body)
}

describe('placed containers (ticket 823)', () => {
  it('reads the cache crate cap of 3 per player per planet and owner access from the data row', () => {
    expect(planetKitEconomyProblems(economyFile)).toEqual([])
    expect(CRATE_CAP).toBe(3)
    expect(ECONOMY.containerDefaultAccess).toBe('owner')
  })

  it('moves the whole hold into a new crate at the drop cell and leaves the hold empty', () => {
    const outcome = dropContainer(NO_PLACED_CONTAINERS, crateDrop(P1, MIXED_HOLD))
    expect(outcome.isDropped).toBe(true)
    if (!outcome.isDropped) return
    expect(outcome.hold).toEqual(EMPTY_CARGO)
    expect(outcome.container).toEqual({
      containerId: 1,
      kind: 'cache_crate',
      ownerId: OWNER,
      access: 'owner',
      cell: { tx: 3, ty: -7 },
      cargo: MIXED_HOLD,
    })
  })

  it('numbers containers with a per-planet counter that never reuses an id', () => {
    let placed = dropped(NO_PLACED_CONTAINERS, crateDrop(P1, MIXED_HOLD))
    placed = dropped(placed, crateDrop(P2, MIXED_HOLD))
    const pickup = pickupContainer(placed, {
      planetKey: P1,
      playerId: OWNER,
      containerId: 1,
      hold: EMPTY_CARGO,
      capacity: 100,
    })
    if (!pickup.isPickedUp) throw new Error('pickup refused')
    placed = dropped(pickup.placed, crateDrop(P1, MIXED_HOLD))
    expect(containersOn(placed, P1).map((c) => c.containerId)).toEqual([2])
    expect(containersOn(placed, P2).map((c) => c.containerId)).toEqual([1])
  })

  it('refuses a 4th crate on one planet and changes nothing, while another planet still takes one', () => {
    let placed = NO_PLACED_CONTAINERS
    for (let i = 0; i < 3; i += 1) placed = dropped(placed, crateDrop(P1, MIXED_HOLD))
    expect(dropContainer(placed, crateDrop(P1, MIXED_HOLD))).toEqual({
      isDropped: false,
      reason: 'container_cap',
    })
    expect(dropContainer(placed, crateDrop(P2, MIXED_HOLD)).isDropped).toBe(true)
    expect(dropContainer(placed, crateDrop(P1, MIXED_HOLD, GUEST)).isDropped).toBe(true)
  })

  it('refuses to drop an empty hold', () => {
    expect(dropContainer(NO_PLACED_CONTAINERS, crateDrop(P1, EMPTY_CARGO))).toEqual({
      isDropped: false,
      reason: 'empty_hold',
    })
  })

  it('refuses a pickup by anyone but the owner while the crate is the owner’s', () => {
    const placed = dropped(NO_PLACED_CONTAINERS, crateDrop(P1, MIXED_HOLD))
    const pickup = { planetKey: P1, containerId: 1, hold: EMPTY_CARGO, capacity: 100 }
    expect(pickupContainer(placed, { ...pickup, playerId: GUEST })).toEqual({
      isPickedUp: false,
      reason: 'not_allowed',
    })
    expect(pickupContainer(placed, { ...pickup, playerId: OWNER }).isPickedUp).toBe(true)
  })

  it('opens a crew container to every player, so sharing is a data flip', () => {
    const drop = { ...crateDrop(P1, MIXED_HOLD), access: 'crew' as const }
    const placed = dropped(NO_PLACED_CONTAINERS, drop)
    const pickup = { planetKey: P1, containerId: 1, hold: EMPTY_CARGO, capacity: 100 }
    expect(pickupContainer(placed, { ...pickup, playerId: GUEST }).isPickedUp).toBe(true)
  })

  it('refuses a pickup into a full hold and of a container that is not there', () => {
    const placed = dropped(NO_PLACED_CONTAINERS, crateDrop(P1, MIXED_HOLD))
    const full = { planetKey: P1, playerId: OWNER, containerId: 1, hold: MIXED_HOLD, capacity: 10 }
    expect(pickupContainer(placed, full)).toEqual({ isPickedUp: false, reason: 'hold_full' })
    expect(pickupContainer(placed, { ...full, containerId: 2, hold: EMPTY_CARGO })).toEqual({
      isPickedUp: false,
      reason: 'unknown_container',
    })
  })

  it('picks up core fragments first, then ore from the highest tier, leaving the rest in the crate', () => {
    const placed = dropped(NO_PLACED_CONTAINERS, crateDrop(P1, MIXED_HOLD))
    const hold: Cargo = { ore: { '1': 6 }, coreFragments: 0 }
    const outcome = pickupContainer(placed, {
      planetKey: P1,
      playerId: OWNER,
      containerId: 1,
      hold,
      capacity: 10,
    })
    if (!outcome.isPickedUp) throw new Error('pickup refused')
    expect(outcome.moved).toEqual({ ore: { '5': 2, '2': 1 }, coreFragments: 1 })
    expect(outcome.hold).toEqual({ ore: { '1': 6, '5': 2, '2': 1 }, coreFragments: 1 })
    expect(outcome.left?.cargo).toEqual({ ore: { '1': 4, '2': 2 }, coreFragments: 0 })
  })

  it('removes a container its pickup empties', () => {
    const placed = dropped(NO_PLACED_CONTAINERS, crateDrop(P1, MIXED_HOLD))
    const outcome = pickupContainer(placed, {
      planetKey: P1,
      playerId: OWNER,
      containerId: 1,
      hold: EMPTY_CARGO,
      capacity: 100,
    })
    if (!outcome.isPickedUp) throw new Error('pickup refused')
    expect(outcome.left).toBeNull()
    expect(outcome.hold).toEqual(MIXED_HOLD)
    expect(containersOn(outcome.placed, P1)).toEqual([])
  })

  it('keeps the cargo total through drop, save, load, a jump away and back, and pickup', () => {
    const before = cargoUnitsOf(MIXED_HOLD)
    const drop = dropContainer(NO_PLACED_CONTAINERS, crateDrop(P1, MIXED_HOLD))
    if (!drop.isDropped) throw new Error('drop refused')
    const loaded = savedAndLoaded(drop.placed)
    const awayAndBack = dropped(loaded, crateDrop(P2, { ore: { '3': 2 }, coreFragments: 0 }))
    expect(containedUnitsOf(awayAndBack) - 2).toBe(before)
    const pickup = pickupContainer(savedAndLoaded(awayAndBack), {
      planetKey: P1,
      playerId: OWNER,
      containerId: 1,
      hold: drop.hold,
      capacity: 100,
    })
    if (!pickup.isPickedUp) throw new Error('pickup refused')
    expect(pickup.hold).toEqual(MIXED_HOLD)
    expect(cargoUnitsOf(pickup.hold) + containedUnitsOf(pickup.placed) - 2).toBe(before)
  })

  it('keeps two players’ totals apart and hides a departed owner’s crate until they rejoin', () => {
    let placed = dropped(NO_PLACED_CONTAINERS, crateDrop(P1, MIXED_HOLD))
    placed = dropped(placed, crateDrop(P1, { ore: { '2': 5 }, coreFragments: 0 }, GUEST))
    expect(shownContainersOn(placed, P1, [OWNER, GUEST]).map((c) => c.ownerId)).toEqual([
      OWNER,
      GUEST,
    ])
    expect(shownContainersOn(placed, P1, [GUEST]).map((c) => c.ownerId)).toEqual([GUEST])
    const rejoined = savedAndLoaded(placed)
    expect(shownContainersOn(rejoined, P1, [GUEST, OWNER])).toHaveLength(2)
    expect(containedUnitsOf(rejoined)).toBe(cargoUnitsOf(MIXED_HOLD) + 5)
  })

  it('refuses a saved body with a foreign key, an empty crate or an unknown field', () => {
    const placed = dropped(NO_PLACED_CONTAINERS, crateDrop(P1, MIXED_HOLD))
    const body = structuredClone(placed) as unknown as Record<string, Record<string, unknown>>
    expect(placedContainersProblems({ ...body, g6: body[P1] })).toEqual([
      'placed containers key "g6" is not a planet\'s s:p',
    ])
    const crate = (body[P1].byId as Record<string, Record<string, unknown>>)['1']
    crate.cargo = { ore: {}, coreFragments: 0 }
    crate.colour = 'red'
    expect(placedContainersProblems(body)).toEqual([
      '1:1.byId.1.cargo is empty, so the container should have been removed',
      '1:1.byId.1.colour is not a field of a placed container',
    ])
  })
})

describe('placed containers at any g and hold size (ticket 823, VS goldens)', () => {
  const PLANETS = [
    { g: 1n, system: 1n, planet: 1n },
    { g: 6n, system: 2n, planet: 1n },
    { g: 1_000_000n, system: 200_000n, planet: 5n },
  ]
  /** Cargo level 1e6 is the VS's third size; the kernel's hold counts end at level 361. */
  const LEVELS = [1, 99]

  it('keys the three planets by the (s,p) whose campaign index is g', () => {
    for (const { g, system, planet } of PLANETS) expect(campaignIndex(system, planet)).toBe(g)
  })

  it('moves a full hold into a crate and back into partial room without a unit duplicated', () => {
    for (const { system, planet } of PLANETS) {
      for (const level of LEVELS) {
        const key = `${system}:${planet}`
        const hold = fullHoldAt(level)
        const capacity = cargoCapacity(level)
        const drop = dropContainer(NO_PLACED_CONTAINERS, crateDrop(key, hold))
        if (!drop.isDropped) throw new Error('drop refused')
        const partial: Cargo = { ore: { '1': Math.ceil(capacity / 2) + 1 }, coreFragments: 0 }
        const pickup = pickupContainer(savedAndLoaded(drop.placed), {
          planetKey: key,
          playerId: OWNER,
          containerId: 1,
          hold: partial,
          capacity,
        })
        if (!pickup.isPickedUp) throw new Error('pickup refused')
        expect(cargoUnitsOf(pickup.hold)).toBe(capacity)
        expect(cargoUnitsOf(pickup.moved)).toBe(capacity - cargoUnitsOf(partial))
        expect(cargoUnitsOf(pickup.hold) + containedUnitsOf(pickup.placed)).toBe(
          capacity + cargoUnitsOf(partial),
        )
      }
    }
  })

  it.todo(
    'moves a full hold of cargo level 1e6 the same way, once hold counts are bignum (asked on #823)',
  )
})

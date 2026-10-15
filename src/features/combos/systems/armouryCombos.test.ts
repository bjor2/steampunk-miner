import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import {
  boreGunSlice,
  BORE_STATS,
  FIRE_EAST,
  PLAIN_RIG,
  standInPocket,
} from '../../../systems/authority/bore/boreFixtures'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { contentOf } from '../../../systems/registries/content'
import type { BoreGunStats } from '../../../systems/registries/boreGun'
import { ITEM_HOOK_REGISTRY } from '../../../systems/registries/itemHooks'
import { entriesOf } from '../../../systems/registries/seal'
import { slice as COMBOS_SLICE } from '../register'
import {
  SOUNDING_BORE_ID,
  SOUNDING_BORE_LINE,
  WINCH_BORE_ID,
  winchBoreReachOf,
} from './armouryCombos'
import { comboItemOf } from './comboCatalogue'

// The bore-gun combos' answers (ticket 320; TD lock 6180863028, GD ruling 6180873822 on #320):
// the winch bore lifts the grapple's reach to the owner's fresh bore's far end, the sounding bore
// asks for the bore line's cells; each only with the combo and both its parents owned.

const P1 = 'p1'
const FIRE_TICK = 10
/** Ten cells at one every 2 ticks: the line has opened by tick 30 and stands 30 more. */
const READ_TICK = 32
/** The grapple's own range at Mark 1, as the lane hands it to the hook. */
const GRAPPLE_RANGE = 4
const WINDOW_TICKS = 60
/** The 10-cell range cap, with a budget and energy that never stop a line short. */
const LONG_GUN: BoreGunStats = {
  ...BORE_STATS,
  rangeCells: 10,
  boreBudgetTicks: 100000,
  energyPerCellBp: 10000,
}

const WINCH_PARENTS = comboItemOf(WINCH_BORE_ID)?.parentItemIds ?? []
const SOUNDING_PARENTS = comboItemOf(SOUNDING_BORE_ID)?.parentItemIds ?? []

/** The vehicle-item rows these specs own, read off the full registration before it is swapped. */
const OWNABLE_ITEMS = contentOf('vehicle-item').filter((item) =>
  [WINCH_BORE_ID, SOUNDING_BORE_ID, ...WINCH_PARENTS, ...SOUNDING_PARENTS].includes(item.id),
)

/** The parents' rows, so a spec owns them with no lane slice registered. */
const PARENT_ROWS: SliceDefinition = {
  id: 'rows',
  register: (r) =>
    r.content(
      'vehicle-item',
      OWNABLE_ITEMS.filter((item) => !item.id.startsWith('combo.')),
    ),
}

interface Bored {
  state: AuthorityState
  events: readonly DomainEvent[]
}

/** The rig owning `owned` in its pocket, one bore fired east at tick 10, read at tick 32. */
function boredOwning(owned: readonly string[], slices: readonly SliceDefinition[]): Bored {
  return withRegistrations([...slices, PARENT_ROWS, boreGunSlice(LONG_GUN)], () => {
    const session = createScriptedSession()
    session.submit(0, setVehicleLoadoutCommand({}, owned))
    standInPocket(session, PLAIN_RIG, 1)
    session.submit(FIRE_TICK, FIRE_EAST)
    session.advanceTo(READ_TICK)
    return { state: session.state(), events: session.events() }
  })
}

function winchReachAt(owned: readonly string[], tick: number): number | null {
  const { state } = boredOwning(owned, [COMBOS_SLICE])
  const ctx = { tick, mark: 1, magnitude: GRAPPLE_RANGE, origin: PLAIN_RIG, candidates: [] }
  return withRegistrations([COMBOS_SLICE], () => winchBoreReachOf(state, P1, ctx))
}

function boreEndsOf(events: readonly DomainEvent[]) {
  return events.filter((event) => event.type === 'BoreEnded')
}

describe('combos: the winch bore', () => {
  it("lifts the grapple's reach to the fresh bore's far end, ten tiles off", () => {
    expect(winchReachAt([WINCH_BORE_ID, ...WINCH_PARENTS], READ_TICK)).toBe(10 - GRAPPLE_RANGE)
  })

  it('answers nothing once the shot is more than 60 ticks old', () => {
    const owned = [WINCH_BORE_ID, ...WINCH_PARENTS]
    expect(winchReachAt(owned, FIRE_TICK + WINDOW_TICKS)).toBe(10 - GRAPPLE_RANGE)
    expect(winchReachAt(owned, FIRE_TICK + WINDOW_TICKS + 1)).toBeNull()
  })

  it('resolves only with the combo and both parents owned', () => {
    expect(winchReachAt(WINCH_PARENTS, READ_TICK)).toBeNull()
    WINCH_PARENTS.forEach((parent) =>
      expect(
        winchReachAt([WINCH_BORE_ID, ...WINCH_PARENTS.filter((id) => id !== parent)], READ_TICK),
        parent,
      ).toBeNull(),
    )
  })

  it("is registered on the grapple winch's reach, adding no income", () => {
    withRegistrations([COMBOS_SLICE], () => {
      const hook = entriesOf(ITEM_HOOK_REGISTRY).find(
        (entry) => entry.id === 'combos.winch_bore_reach',
      )
      expect(hook).toMatchObject({
        hook: 'reach',
        laneId: 'mobility',
        parentItemId: 'power.grapple_winch',
      })
      expect(hook?.incomeItemId).toBeUndefined()
    })
  })
})

describe('combos: the sounding bore', () => {
  it("puts the shot's opened cells on its BoreEnded for an owner", () => {
    const { events } = boredOwning([SOUNDING_BORE_ID, ...SOUNDING_PARENTS], [COMBOS_SLICE])
    const [ended] = boreEndsOf(events)
    expect(ended?.type === 'BoreEnded' && ended.lineCells?.length).toBe(10)
  })

  it('resolves only with the combo and both parents owned', () => {
    withRegistrations([COMBOS_SLICE, PARENT_ROWS], () => {
      const owning = (owned: readonly string[]) => {
        const session = createScriptedSession()
        session.submit(0, setVehicleLoadoutCommand({}, owned))
        return SOUNDING_BORE_LINE.wantsLine(session.state(), P1)
      }
      expect(owning([SOUNDING_BORE_ID, ...SOUNDING_PARENTS])).toBe(true)
      expect(owning(SOUNDING_PARENTS)).toBe(false)
      SOUNDING_PARENTS.forEach((parent) =>
        expect(owning([SOUNDING_BORE_ID, ...SOUNDING_PARENTS.filter((id) => id !== parent)])).toBe(
          false,
        ),
      )
    })
  })

  it('leaves the shot, its events and the digest unchanged while the combo is not owned', () => {
    const withCombos = boredOwning(SOUNDING_PARENTS, [COMBOS_SLICE])
    const without = boredOwning(SOUNDING_PARENTS, [])
    expect(boreEndsOf(withCombos.events)).toEqual(boreEndsOf(without.events))
    expect(stateDigest(withCombos.state)).toBe(stateDigest(without.state))
  })
})

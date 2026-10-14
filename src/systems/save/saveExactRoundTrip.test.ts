import { describe, expect, it } from 'vitest'
import { MM_PER_METRE } from '../../constants/physics'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { CommandIntent } from '../authority/authorityCommand'
import { vehicleOf, type AuthorityState } from '../authority/authorityState'
import { strutReinforces } from '../authority/bore/boreStrut'
import { BORE_STATS, FIRE_EAST, PLAIN_RIG, standInPocket } from '../authority/bore/boreFixtures'
import { poseAt } from '../authority/collapse/collapseFixtures'
import type { DomainEvent } from '../authority/domainEvent'
import { isFeatureUnlocked } from '../authority/featureUnlocks'
import {
  continueScriptedSession,
  createScriptedSession,
  drill,
  FREEZE_ENEMIES,
  mineTile,
  PARAMS,
  poseAbove,
  surfaceOreTiles,
  type ScriptedSession,
} from '../authority/scriptedSession'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { stateDigest } from '../authority/stateDigest'
import { oreTypeAtTile } from '../authority/tileOre'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { stepPrice } from '../economy/upgradePrices'
import { toCanonical } from '../money'
import { artefactOptionsOfferedTo } from '../registries/artefactOptions'
import type { ShotShape } from '../registries/boreGun'
import { contentOf } from '../registries/content'
import { hasDiscovered, type DiscoveryFallback, type DiscoveryKey } from '../registries/discovery'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import { FACING } from '../vehicle/vehiclePose'
import { artefactCacheTile } from '../world/artefactCache'
import type { TilePoint } from '../world/tileGrid'
import { arrivedForDive, DIVE_START_TICK, diveTicks, divePathOf, playDive } from './p200DiveFixture'
import { readSaveSlot, saveSlotOf, type SaveSlotFile } from './saveSlot'

// The exact save round-trip (ticket 405, spec #401): the Vertical Scaler's decision 1 (money and
// prices as 40-digit decimal text, the exact-carry state saved) and the Horizontal Scaler's
// decision 2 (one-off pick offers reproduced, firsts and FeatureUnlocked saved). The 600 ticks
// after a planet-200 load are in `saveDeterminism.test.ts`.

/** As the shell writes it: JSON text. */
function savedTextOf(state: AuthorityState): string {
  return JSON.stringify(saveSlotOf(takeSnapshot(state), 1))
}

function loadedFrom(text: string): AuthorityState {
  const reading = readSaveSlot(JSON.parse(text))
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return reading.state
}

const roundTripped = (state: AuthorityState) => loadedFrom(savedTextOf(state))

/** Every number in a parsed JSON value, wherever it sits. */
function numbersIn(value: unknown): number[] {
  if (typeof value === 'number') return [value]
  if (value === null || typeof value !== 'object') return []
  return Object.values(value).flatMap(numbersIn)
}

/** `steps` played on from `state` and from its round trip, each as the events it answered. */
function playedBothWays(state: AuthorityState, steps: readonly [number, CommandIntent][]) {
  const play = (from: AuthorityState) => {
    const session = continueScriptedSession(from)
    steps.forEach(([tick, intent]) => session.submit(tick, intent))
    return { events: session.events(), state: session.state() }
  }
  return { unsaved: play(state), loaded: play(roundTripped(state)) }
}

/** `p1` 160 ticks into the planet-200 dive: mid-cut, a lining bill at planet-200 prices. */
function diveMidCut(): AuthorityState {
  const arrived = arrivedForDive()
  return playDive(arrived, diveTicks(divePathOf(arrived), DIVE_START_TICK, 160)).state
}

describe('save slot: money and prices as decimal text (ticket 405)', () => {
  const state = diveMidCut()
  const text = savedTextOf(state)

  it('writes every number the save restores as a safe integer, so no money or price is a JS number', () => {
    // The planet's generator params are only compared with this build's, never restored.
    const { world, ...restored } = JSON.parse(text) as SaveSlotFile
    const numbers = numbersIn({ ...restored, world: { ...world, params: null } })
    expect(numbers.length).toBeGreaterThan(0)
    expect(numbers.filter((value) => !Number.isSafeInteger(value))).toEqual([])
  })

  it('restores the wallet near 1e149, the lining bill and every hull to all their digits', () => {
    const loaded = loadedFrom(text)
    for (const id of Object.keys(state.players)) {
      const [saved, read] = [state.players[id], loaded.players[id]]
      expect(toCanonical(read.wallet)).toBe(toCanonical(saved.wallet))
      expect(toCanonical(read.vehicle.liningBill)).toBe(toCanonical(saved.vehicle.liningBill))
      expect(toCanonical(read.vehicle.hull)).toBe(toCanonical(saved.vehicle.hull))
    }
    expect(toCanonical(loaded.players.p1.vehicle.liningBill)).toMatch(/e\+1\d\d$/)
  })

  it("prices each track's next step the same after a load, to all 40 digits", () => {
    const loaded = loadedFrom(text)
    const nextPrices = (from: AuthorityState) =>
      UPGRADE_IDS.map((id) => {
        const step = vehicleOf(from, 'p1').levels[id] + 1
        return toCanonical(stepPrice(id, step, from.planet.index))
      })
    expect(nextPrices(loaded)).toEqual(nextPrices(state))
    expect(nextPrices(state).every((price) => /e\+\d{3}$/.test(price))).toBe(true)
  })
})

describe('save slot: the exact-carry state (ticket 405)', () => {
  it('restores the cut cursor, the part-cut ground and the drill, tip, tank and cargo', () => {
    const state = diveMidCut()
    const loaded = roundTripped(state)
    const [saved, read] = [vehicleOf(state, 'p1'), vehicleOf(loaded, 'p1')]
    expect(read.sweptCut).toEqual(saved.sweptCut)
    expect(read.sweptCut?.digSubSteps).toBeGreaterThan(0)
    expect(read.levels).toEqual(saved.levels)
    expect([read.energy, read.accountedTick, read.cargo]).toEqual([
      saved.energy,
      saved.accountedTick,
      saved.cargo,
    ])
    expect(loaded.world).toEqual(state.world)
    expect(stateDigest(loaded)).toBe(stateDigest(state))
  })
})

const FIRE_TICK = 10
/** The shot's two ground cells are open by fire + 4; it meets the hollow at fire + 6. */
const MID_BORE_TICK = FIRE_TICK + 3
const ENDED_TICK = FIRE_TICK + 30
const GROUNDING_STRUT: ShotShape = {
  lineOffsets: [],
  seamTurns: 0,
  liningGrade: null,
  extraEnergyPerCellBp: 0,
  groundTicks: 120,
  strutTicks: 600,
}

/** A gun whose every shot grounds its line and wedges a strut, the strut registered. */
const strutGun: SliceDefinition = {
  id: 'probe',
  register(r) {
    r.boreGun({
      id: 'probe.bore-gun',
      boreGunOf: () => BORE_STATS,
      shotShapeOf: () => GROUNDING_STRUT,
    })
    r.reinforcement({ id: 'probe.strut', reinforces: strutReinforces })
  },
}

/** The rig in its pocket with a hollow over the third and fourth cells east, fired due east. */
function shotIntoHollow(): ScriptedSession {
  const session = createScriptedSession()
  standInPocket(session, PLAIN_RIG, 0)
  for (const step of [3, 4, 3, 4]) {
    const centre = { x: (PLAIN_RIG.tx + step) * 1000 + 500, y: PLAIN_RIG.ty * 1000 + 500 }
    session.submit(0, {
      type: 'debug.carveCircle',
      payload: { ...centre, radius: 1300, amount: 255 },
    })
  }
  session.submit(FIRE_TICK, FIRE_EAST)
  return session
}

describe('save slot: the bore gun mid-shot (ticket 405)', () => {
  it('restores a shot still boring, and the clock plays it out the same after a load', () =>
    withRegistrations([strutGun], () => {
      const session = shotIntoHollow()
      session.advanceTo(MID_BORE_TICK)
      const state = session.state()
      const loaded = roundTripped(state)
      expect(state.bores?.length).toBe(1)
      expect(loaded.bores).toEqual(state.bores)
      const later = (from: AuthorityState) => {
        const run = continueScriptedSession(from)
        run.advanceTo(ENDED_TICK)
        return run
      }
      expect(later(loaded).events()).toEqual(later(state).events())
      expect(stateDigest(later(loaded).state())).toBe(stateDigest(later(state).state()))
    }))

  it('restores the strut it wedged and the line it grounded once it ended', () =>
    withRegistrations([strutGun], () => {
      const session = shotIntoHollow()
      session.advanceTo(ENDED_TICK)
      const state = session.state()
      const loaded = roundTripped(state)
      expect(Object.keys(state.struts ?? {})).toHaveLength(1)
      expect(state.groundedLines?.length).toBe(1)
      expect([loaded.struts, loaded.groundedLines]).toEqual([state.struts, state.groundedLines])
      expect(stateDigest(loaded)).toBe(stateDigest(state))
    }))
})

const cacheCentre = (tile: TilePoint) => ({
  x: tile.tx * MM_PER_METRE + MM_PER_METRE / 2,
  y: tile.ty * MM_PER_METRE + MM_PER_METRE / 2,
})

/** At rest on planet 1's cache owning every registered vehicle item, so twist cards show too. */
function atCacheOwningEverything(): ScriptedSession {
  const session = createScriptedSession()
  const owned = contentOf('vehicle-item').map((item) => item.id)
  const { x, y } = cacheCentre(artefactCacheTile(PARAMS))
  session.submit(1, FREEZE_ENEMIES)
  session.submit(1, { type: 'debug.setVehicleLoadout', payload: { slots: {}, owned } })
  session.submit(2, poseAt(x, y, 0, FACING.down))
  session.submit(3, { type: 'openArtefactCache', payload: {} })
  return session
}

const offeredIdsOf = (state: AuthorityState) =>
  artefactOptionsOfferedTo(state, 'p1').map((option) => option.id)

const openRowIdsOf = (state: AuthorityState) =>
  LOCKED_SCHEDULE.rows.filter((row) => isFeatureUnlocked(state, row.id)).map((row) => row.id)

const unlockedIn = (events: readonly DomainEvent[]) =>
  events.flatMap((event) => (event.type === 'FeatureUnlocked' ? [event.featureId] : []))

const choose = (optionId: string): CommandIntent => ({
  type: 'chooseArtefact',
  payload: { optionId },
})

// A cache's offer draws nothing at random: its tile comes from the world seed and the planet
// (`artefactCache.ts`) and its cards from the saved state, so a load offers the same cards.
describe('save slot: one-off picks, firsts and unlocks (ticket 405)', () => {
  it('offers the same cards at the open cache after a load, twists included, and takes the same pick', () => {
    const state = atCacheOwningEverything().state()
    const offered = offeredIdsOf(state)
    expect(offered.length).toBeGreaterThan(3)
    expect(offeredIdsOf(roundTripped(state))).toEqual(offered)
    const { unsaved, loaded } = playedBothWays(state, [[4, choose(offered[offered.length - 1])]])
    expect(unlockedIn(unsaved.events).length).toBeGreaterThan(0)
    expect(loaded.events).toEqual(unsaved.events)
    expect(stateDigest(loaded.state)).toBe(stateDigest(unsaved.state))
  })

  it('keeps the pick and the rows it opened after a load, and never logs them again', () => {
    const session = atCacheOwningEverything()
    const [first] = offeredIdsOf(session.state())
    const opened = unlockedIn(session.submit(4, choose(first)))
    const state = session.state()
    const loaded = roundTripped(state)
    expect(loaded.players.p1.artefact).toEqual(state.players.p1.artefact)
    expect(openRowIdsOf(loaded)).toEqual(openRowIdsOf(state))
    expect(openRowIdsOf(loaded)).toEqual(expect.arrayContaining(opened))
    const again: [number, CommandIntent][] = [
      [5, { type: 'openArtefactCache', payload: {} }],
      [6, choose(first)],
    ]
    const { unsaved, loaded: afterLoad } = playedBothWays(state, again)
    expect(afterLoad.events).toEqual(unsaved.events)
    expect(unlockedIn(afterLoad.events)).toEqual([])
    expect(afterLoad.events.map((event) => event.type)).toEqual([
      'CommandRejected',
      'CommandRejected',
    ])
  })

  it('keeps the ores the codex met after a load, and logs no first again for the same ore', () => {
    const [metFirst, sameOre] = twoTilesOfOneOre()
    const session = createScriptedSession()
    session.submit(1, FREEZE_ENEMIES)
    const oreKey = oreKeyAt(session.state(), metFirst)
    expect(hasDiscovered(session.state(), 'p1', oreKey, NO_FALLBACK)).toBe(false)
    mineTile(session, 10, metFirst)
    const state = session.state()
    const loaded = roundTripped(state)
    expect(hasDiscovered(state, 'p1', oreKey, NO_FALLBACK)).toBe(true)
    expect(hasDiscovered(loaded, 'p1', oreKey, NO_FALLBACK)).toBe(true)
    const { unsaved, loaded: afterLoad } = playedBothWays(state, [
      [100, poseAbove(sameOre, FACING.down)],
      [140, drill(sameOre, 40)],
    ])
    expect(afterLoad.events).toEqual(unsaved.events)
    expect(stateDigest(afterLoad.state)).toBe(stateDigest(unsaved.state))
  })
})

/** A fallback that never answers yes, so only the codex's saved section can. */
const NO_FALLBACK: DiscoveryFallback = {
  progress: {
    highestPlanetIndex: 1,
    collectedArtefactRowIds: new Set(),
    builtFacilityRowIds: new Set(),
    manualUnlockRowIds: new Set(),
  },
  unlockPlanetIndex: Number.MAX_SAFE_INTEGER,
}

/** Two planet-1 surface ore tiles of the same ore type. */
function twoTilesOfOneOre(): [TilePoint, TilePoint] {
  const state = createScriptedSession().state()
  const tiles = surfaceOreTiles(12)
  const idOf = (tile: TilePoint) => oreTypeAtTile(state, tile)?.id
  for (const [index, tile] of tiles.entries()) {
    const twin = tiles.slice(index + 1).find((other) => idOf(other) === idOf(tile))
    if (twin !== undefined) return [tile, twin]
  }
  throw new Error('no two surface ore tiles share an ore type')
}

function oreKeyAt(state: AuthorityState, tile: TilePoint): DiscoveryKey {
  const ore = oreTypeAtTile(state, tile)
  if (ore === null) throw new Error(`no ore at ${tile.tx},${tile.ty}`)
  return `ore:${ore.id}`
}

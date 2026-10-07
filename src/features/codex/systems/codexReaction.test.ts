import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../../../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../../../logging/runLog'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import {
  BLAST_TICK,
  blastAt,
  liveBlastSession,
  R24_MM,
  SOLID_SITE,
} from '../../../systems/authority/charges/liveBlastFixtures'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  mineTile,
  poseAbove,
  surfaceOreTiles,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import { hasDiscovered } from '../../../systems/registries/discovery'
import { magneticFieldHolding } from '../../../systems/registries/magneticGround'
import { planetParamsFor } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { readAuthorityState } from '../../../store/authorityLink'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import type { GateCheck } from '../../../systems/registries/gateChecks'
import { oreTypeOf, type OreType } from '../../../systems/registries/oreTypes'
import { RESOURCE_FAMILY } from '../../../systems/world/worldCell'
import { EMPTY_WORLD } from '../../../systems/world/worldState'
import { oreTier } from '../../../systems/economy/oreEconomy'
import { slice as CODEX } from '../register'
import { progressTo } from './codexSpecs'
import { CODEX_DISCOVERY_REACTION } from './codexReaction'
import { hasMinedOre } from './codexReads'

// The codex hears the authority's answers through its reaction (#207): the first touch of a type
// is contact, its first unit in the hold is a discovery, once per player per type.

const isCodexEvent = (event: DomainEvent) => event.type.startsWith('codex.')
const codexEventsOf = (events: readonly DomainEvent[]) => events.filter(isCodexEvent)

const STARTED = { planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] }
const START_STATE = createAuthorityState(STARTED)

/** The first two surface ore tiles holding the same ore type. */
function sameAndOtherOreTiles() {
  const tiles = surfaceOreTiles(12)
  const oreAt = (index: number) =>
    oreTypeAtTile({ ...START_STATE, world: EMPTY_WORLD }, tiles[index])
  const ids = tiles.map((_, index) => oreAt(index)?.id)
  const second = ids.findIndex((id, at) => at > 0 && id === ids[0])
  return { first: tiles[0], same: tiles[second], ore: oreAt(0) as OreType }
}

/**
 * Fixtures name their ores under the registrations the sessions run under: the codex alone, so the
 * kernel default names them (the ores slice's catalogue would rename them, #146).
 */
const TILES = withRegistrations([CODEX], sameAndOtherOreTiles)

/** The ore of the same tier in the other cell family: a type the tiles never hold. */
function otherFamilyOf(ore: OreType): OreType {
  const { metal, crystal } = RESOURCE_FAMILY
  return oreTypeOf({ tier: ore.tier, cellFamily: ore.cellFamily === metal ? crystal : metal })
}

/** Both blasts break on the blast tick, and both find crystal tier 3 (scanned on seed 83921). */
const P2_SITE = { tx: SOLID_SITE.tx + 4, ty: SOLID_SITE.ty - 20 }

/** Never on planet 1: the kernel fallback says "discovered once planet 1 is reached". */
const REACHED_PLANET = { progress: progressTo(13), unlockPlanetIndex: 1 }

const refuseEveryOre: GateCheck = {
  id: 'mining-gates.probe',
  check: () => ({ outcome: 'refused', gateKind: 'probe', required: 'rig', have: 'none' }),
}
const LOCKED_ORE: SliceDefinition = {
  id: 'mining-gates',
  register: (r) => r.gateCheck(refuseEveryOre),
}

describe('codex discovery reaction', () => {
  it("records a type's first drill touch and first unit in the hold, stamped with the command", () => {
    const events = withRegistrations([CODEX], () =>
      mineTile(createScriptedSession(), 1, TILES.first),
    )
    const key = `ore:${TILES.ore.id}`
    const facts = { oreId: TILES.ore.id, family: TILES.ore.family, tier: TILES.ore.tier, grade: 0 }
    const stamp = { playerId: 'p1', tick: 41, seq: 2 }
    expect(codexEventsOf(events)).toEqual([
      { ...stamp, type: 'codex.OreContacted', ...facts, via: 'drill' },
      { ...stamp, type: 'codex.EntryAdded', key, stage: 'contacted' },
      { ...stamp, type: 'codex.OreDiscovered', ...facts },
      { ...stamp, type: 'codex.EntryAdded', key, stage: 'mined' },
    ])
  })

  it('says nothing more for a type the player already mined', () => {
    const events = withRegistrations([CODEX], () => {
      const session = createScriptedSession()
      mineTile(session, 1, TILES.first)
      return mineTile(session, 100, TILES.same)
    })
    expect(events.map((event) => event.type)).toContain('CargoAdded')
    expect(codexEventsOf(events)).toEqual([])
  })

  it('answers the kernel discovery query from the section, not the planet reached', () => {
    const { before, after } = withRegistrations([CODEX], () => {
      const session = createScriptedSession()
      const untouched = session.state()
      mineTile(session, 1, TILES.first)
      return { before: untouched, after: session.state() }
    })
    const ask = (state: typeof after, oreId: string, slices = [CODEX]) =>
      withRegistrations(slices, () => hasDiscovered(state, 'p1', `ore:${oreId}`, REACHED_PLANET))
    const other = withRegistrations([CODEX], () => otherFamilyOf(TILES.ore))
    expect(ask(before, TILES.ore.id)).toBe(false)
    expect(ask(after, TILES.ore.id)).toBe(true)
    expect(ask(after, other.id)).toBe(false)
    expect(ask(before, TILES.ore.id, [])).toBe(true)
  })

  it('records a cell a gate refuses as contacted and never as mined', () => {
    const { events, state } = withRegistrations([CODEX, LOCKED_ORE], () => {
      const session = createScriptedSession()
      return { events: mineTile(session, 1, TILES.first), state: session.state() }
    })
    expect(codexEventsOf(events).map(({ type }) => type)).toEqual([
      'codex.OreContacted',
      'codex.EntryAdded',
    ])
    expect(codexEventsOf(events)[0]).toMatchObject({ via: 'gate', oreId: TILES.ore.id })
    expect(withRegistrations([CODEX], () => hasMinedOre(state, 'p1', TILES.ore.id))).toBe(false)
  })

  it('records a sampled cell as contacted by the tool that sampled it and never as mined (#243)', () => {
    const { events, state } = withRegistrations([CODEX], () =>
      CODEX_DISCOVERY_REACTION.react(START_STATE, START_STATE, [oreSampledOf(TILES.ore)]),
    )
    expect(events).toEqual([
      expect.objectContaining({ type: 'codex.OreContacted', oreId: TILES.ore.id, via: 'corer' }),
      { type: 'codex.EntryAdded', key: `ore:${TILES.ore.id}`, stage: 'contacted' },
    ])
    expect(withRegistrations([CODEX], () => hasMinedOre(state, 'p1', TILES.ore.id))).toBe(false)
  })

  it('says only the discovery when a sampled type later reaches the hold', () => {
    const events = withRegistrations([CODEX], () => {
      const sampled = CODEX_DISCOVERY_REACTION.react(START_STATE, START_STATE, [
        oreSampledOf(TILES.ore),
      ]).state
      return CODEX_DISCOVERY_REACTION.react(sampled, sampled, [cargoAddedOf(TILES.ore, 0)]).events
    })
    expect(events.map(({ type }) => type)).toEqual(['codex.OreDiscovered', 'codex.EntryAdded'])
  })

  it('gives each of two players mining the same types on the same tick their own discoveries', () => {
    const events = withRegistrations([CODEX], () => {
      const twoBlasts = liveBlastSession(
        [
          blastAt(SOLID_SITE, R24_MM / 8, { playerId: 'p1' }),
          blastAt(P2_SITE, R24_MM / 8, { playerId: 'p2' }),
        ],
        ['p1', 'p2'],
      )
      twoBlasts.advanceTo(30)
      return twoBlasts.events()
    })
    for (const playerId of ['p1', 'p2']) {
      const mined = new Set(oreIdsOf(events, 'CargoAdded', playerId))
      expect(oreIdsOf(events, 'codex.OreDiscovered', playerId)).toEqual([...mined])
    }
    const onBlastTick = events.filter(
      (event) => event.type === 'codex.OreDiscovered' && event.tick === BLAST_TICK,
    )
    expect(onBlastTick).toEqual([
      expect.objectContaining({ playerId: 'p1', oreId: 'kernel.crystal.t3' }),
      expect.objectContaining({ playerId: 'p2', oreId: 'kernel.crystal.t3' }),
    ])
  })

  it('keeps a rare preview skipped on planet 12 undiscovered after planet 13 is mined', () => {
    const ore = (planet: number, band: number, cellFamily: 1 | 2) =>
      withRegistrations([CODEX], () => oreTypeOf({ tier: oreTier(planet, band), cellFamily }))
    const { metal, crystal } = RESOURCE_FAMILY
    // Planet 12's band-5 crystal is a preview of planet 13's band 2; the player passed it by.
    const preview = ore(12, 5, crystal)
    const minedOnTwelve = [1, 2, 3, 4, 5].map((band) => ore(12, band, metal))
    const minedOnThirteen = [1, 2, 3].flatMap((band) => [
      ore(13, band, metal),
      ore(13, band, crystal),
    ])
    const mined = [...minedOnTwelve, ...minedOnThirteen].filter(({ id }) => id !== preview.id)
    const state = withRegistrations([CODEX], () => {
      const p13 = createAuthorityState({ ...STARTED, planetIndex: 13 })
      return CODEX_DISCOVERY_REACTION.react(p13, p13, mined.map(cargoAddedOf)).state
    })
    const ask = (oreId: string) =>
      withRegistrations([CODEX], () => hasDiscovered(state, 'p1', `ore:${oreId}`, REACHED_PLANET))
    expect(mined.every(({ id }) => ask(id))).toBe(true)
    expect(ask(preview.id)).toBe(false)
    expect(ask(ore(13, 2, metal).id)).toBe(true)
    expect(preview.tier).toBe(ore(13, 2, metal).tier)
  })
})

/** Planet 25 is the Lodestone act's first magnetic planet (#258); its fields come from planet-mix. */
const MAGNETIC_PLANET = 25
const FIELD_SEED = 83921
/** Either side of the top edge of the band-1 field round the ferrous vein at -20,831. */
const OUTSIDE_FIELD: TilePoint = { tx: -20, ty: 837 }
const INSIDE_FIELD: TilePoint = { tx: -20, ty: 836 }

/** A pose report with the vehicle's centre on `tile`: standing on the tile under it. */
const centredOn = (tile: TilePoint) => poseAbove({ tx: tile.tx, ty: tile.ty - 1 }, FACING.up)

/** Player `p1` on planet 25 with the loaded slices, enemies frozen. */
function onMagneticPlanet(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: MAGNETIC_PLANET } })
  session.submit(0, FREEZE_ENEMIES)
  return session
}

describe('codex: hazard:magnetic (ticket 290)', () => {
  let sink: ReturnType<typeof createMemorySink>

  beforeEach(() => {
    resetGameStore()
    sink = createMemorySink()
    installRunLog(createRunLog({ runId: 'run_codex_magnetic', sink, secondsSinceStart: () => 0 }))
  })

  afterEach(() => uninstallRunLog())

  it('stands its fixture tiles either side of a field edge', () => {
    const params = planetParamsFor(FIELD_SEED, MAGNETIC_PLANET)
    expect(magneticFieldHolding(params, OUTSIDE_FIELD)).toBeNull()
    expect(magneticFieldHolding(params, INSIDE_FIELD)).not.toBeNull()
  })

  it('hazard:magnetic is recorded on first entering a field', () => {
    const session = onMagneticPlanet()
    session.submit(12, centredOn(OUTSIDE_FIELD))
    session.submit(24, centredOn(INSIDE_FIELD))
    session.submit(36, centredOn(OUTSIDE_FIELD))
    session.submit(48, centredOn(INSIDE_FIELD))
    const events = session.events()
    const entries = events.filter((event) => event.type === 'MagneticFieldEntered')
    expect(entries).toEqual([
      expect.objectContaining({ tick: 24, planetIndex: MAGNETIC_PLANET }),
      expect.objectContaining({ tick: 48, planetIndex: MAGNETIC_PLANET }),
    ])
    expect(codexEventsOf(events)).toEqual([
      expect.objectContaining({
        tick: 24,
        type: 'codex.EntryAdded',
        key: 'hazard:magnetic',
        stage: 'contacted',
      }),
    ])
    expect(hasDiscovered(session.state(), 'p1', 'hazard:magnetic', REACHED_PLANET)).toBe(true)
  })

  it('a debug entry records `debug_command_applied` and no key', () => {
    const game = () => useGameStore.getState()
    game().setPlanetSeed(FIELD_SEED)
    game().setPlanet(MAGNETIC_PLANET)
    game().teleportToDepthTiles(24)
    // The body lands where the teleport put it, and its next pose report says so.
    game().reportPose(centredOn(INSIDE_FIELD).payload)
    const state = readAuthorityState()
    const playerId = game().playerId
    expect(state.players[playerId].vehicle.mode).toBe('active')
    expect(sink.events.map(({ event, data }) => ({ event, data }))).toContainEqual({
      event: 'debug_command_applied',
      data: { command: 'teleportToDepthTiles', args: { depthTiles: 24 } },
    })
    const lineNames = sink.events.map(({ event }) => event)
    expect(lineNames).not.toContain('magnetic_field_entered')
    expect(lineNames).not.toContain('codex.entry_added')
    expect(hasDiscovered(state, playerId, 'hazard:magnetic', REACHED_PLANET)).toBe(false)
  })
})

/** The ore ids of one player's events of one type, in order. */
function oreIdsOf(events: readonly DomainEvent[], type: string, playerId: string): string[] {
  return events
    .filter((event) => event.type === type && event.playerId === playerId)
    .map((event) => (event as { oreId: string }).oreId)
}

function cargoAddedOf(ore: OreType, seq: number): DomainEvent {
  return {
    playerId: 'p1',
    tick: 10,
    seq: seq + 1,
    type: 'CargoAdded',
    resourceTier: ore.tier,
    amount: 1,
    value: '1e+0',
    oreId: ore.id,
    depthTiles: 0,
    chunk: '0,0',
  }
}

/** The corer's plug of `ore`, resolved on the clock after its wind-up. */
function oreSampledOf(ore: OreType): DomainEvent {
  return {
    playerId: 'p1',
    tick: 8,
    type: 'OreSampled',
    tx: 30,
    ty: 279,
    oreId: ore.id,
    via: 'corer',
  }
}

import { describe, expect, it } from 'vitest'
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
  mineTile,
  surfaceOreTiles,
} from '../../../systems/authority/scriptedSession'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import { hasDiscovered } from '../../../systems/registries/discovery'
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

const TILES = sameAndOtherOreTiles()

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
    const other = otherFamilyOf(TILES.ore)
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
      oreTypeOf({ tier: oreTier(planet, band), cellFamily })
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

import { describe, expect, it } from 'vitest'
import {
  createAuthorityState,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import {
  createScriptedSession,
  mineTile,
  surfaceOreTiles,
} from '../../../systems/authority/scriptedSession'
import {
  readSnapshot,
  takeSnapshot,
  type SessionSnapshot,
} from '../../../systems/authority/sessionSnapshot'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import { hasDiscovered } from '../../../systems/registries/discovery'
import { kindLookProvider } from '../../../systems/registries/kindLook'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { progressTo } from './codexSpecs'
import { CODEX_DISCOVERY_REACTION } from './codexReaction'
import { codexOf } from './codexReads'
import type { IdDiscoveries } from './codexSection'
import {
  cargoAddedOf,
  drillDamageAt,
  drillGatedAt,
  oreSampledAt,
  powerUpUsedAt,
  speciesIdAt,
  tileDestroyedAt,
  withMaterialContact,
} from './materialFixtures'

// The species look's seen-record (ticket 546, the TD's contact rule 6243331970 as the GD amended
// it 6243342631): `material:<species id>` is written once per player per species when a cell of it
// was really touched, and never for a cell ahead, beside or behind a gate, a scan or a held item.
// Run under the loaded slices, so the roster writes each patch's kind slot.

const START = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
const P1 = planetParamsOf(START.planet)!

/** Planet 1 (seed 83921) has no surface border of two species, so these sit 21 rows down. */
const BORDER = {
  cell: { tx: 42, ty: 275 },
  ahead: { tx: 42, ty: 274 },
  beside: { tx: 43, ty: 275 },
}

/** No reach: the kernel fallback would say "discovered" on any planet. */
const NEVER_REACHED = { progress: progressTo(0), unlockPlanetIndex: Number.POSITIVE_INFINITY }

/** Surface ore cells of planet 1: one species twice, and another species of the same ore type. */
function surfaceSpeciesTiles() {
  const tiles = surfaceOreTiles(40, P1)
  const [first] = tiles
  const speciesOf = (tile: TilePoint) => speciesIdAt(START, tile)
  const oreOf = (tile: TilePoint) => oreTypeAtTile(START, tile)?.id
  const same = tiles.find((tile) => tile !== first && speciesOf(tile) === speciesOf(first))
  const twin = tiles.find(
    (tile) => oreOf(tile) === oreOf(first) && speciesOf(tile) !== speciesOf(first),
  )
  return { first, same: same!, twin: twin! }
}

const SURFACE = surfaceSpeciesTiles()

const isMaterialEntry = (event: DomainEvent) =>
  event.type === 'codex.EntryAdded' && event.key.startsWith('material:')

const materialEntriesOf = (events: readonly DomainEvent[]) => events.filter(isMaterialEntry)

function materialsOf(state: AuthorityState, playerId = 'p1'): readonly string[] {
  return (codexOf(state, playerId)?.material as IdDiscoveries | undefined)?.contacted ?? []
}

function hasMet(state: AuthorityState, speciesId: string, playerId = 'p1'): boolean {
  return hasDiscovered(state, playerId, `material:${speciesId}`, NEVER_REACHED)
}

const entryOf = (speciesId: string) => ({
  type: 'codex.EntryAdded',
  key: `material:${speciesId}`,
  stage: 'contacted',
})

const heardOn = (state: AuthorityState, heard: readonly DomainEvent[]) =>
  CODEX_DISCOVERY_REACTION.react(state, state, heard)

const BORDER_SPECIES = speciesIdAt(START, BORDER.cell)!
const BORDER_ORE = oreTypeAtTile(START, BORDER.cell)!.id

describe('codex: material:<species id> (ticket 546)', () => {
  it('stands its fixture cells on a species border and two species of one ore type', () => {
    expect(BORDER_SPECIES).not.toBeNull()
    for (const near of [BORDER.ahead, BORDER.beside]) {
      expect(speciesIdAt(START, near)).not.toBeNull()
      expect(speciesIdAt(START, near)).not.toBe(BORDER_SPECIES)
    }
    expect(speciesIdAt(START, SURFACE.same)).toBe(speciesIdAt(START, SURFACE.first))
    expect(oreTypeAtTile(START, SURFACE.twin)?.id).toBe(oreTypeAtTile(START, SURFACE.first)?.id)
  })

  it('holds no material key in a fresh save', () => {
    const fresh = createScriptedSession().state()
    expect(materialsOf(fresh)).toEqual([])
    expect(codexOf(fresh, 'p1')).toEqual({})
  })

  it('records the species of the first cell the drill mines once, with one entry', () => {
    const session = createScriptedSession()
    const events = mineTile(session, 1, SURFACE.first)
    const speciesId = speciesIdAt(START, SURFACE.first)!
    expect(materialEntriesOf(events)).toEqual([expect.objectContaining(entryOf(speciesId))])
    expect(materialsOf(session.state())).toEqual([speciesId])
  })

  it('says nothing for a second touch of a species already recorded', () => {
    const session = createScriptedSession()
    mineTile(session, 1, SURFACE.first)
    const recorded = materialsOf(session.state())
    const events = mineTile(session, 100, SURFACE.same)
    expect(events.map(({ type }) => type)).toContain('CargoAdded')
    expect(materialEntriesOf(events)).toEqual([])
    expect(materialsOf(session.state())).toEqual(recorded)
  })

  it('records only the species touched of two that share an ore type', () => {
    const session = createScriptedSession()
    mineTile(session, 1, SURFACE.first)
    const oreId = oreTypeAtTile(START, SURFACE.first)!.id
    expect(hasDiscovered(session.state(), 'p1', `ore:${oreId}`, NEVER_REACHED)).toBe(true)
    expect(hasMet(session.state(), speciesIdAt(START, SURFACE.first)!)).toBe(true)
    expect(hasMet(session.state(), speciesIdAt(START, SURFACE.twin)!)).toBe(false)
  })

  it.each([
    ['a drill touch', [drillDamageAt(BORDER.cell)]],
    ['a gate stop', [drillGatedAt(BORDER.cell, BORDER_ORE)]],
    ['a unit in the hold', [tileDestroyedAt(BORDER.cell), cargoAddedOf(BORDER_ORE)]],
    ['a tool sample', [oreSampledAt(BORDER.cell, BORDER_ORE, 'corer')]],
  ])('records the touched cell’s species alone for %s', (_route, heard) => {
    const { state, events } = heardOn(START, heard)
    expect(materialEntriesOf(events as DomainEvent[])).toEqual([entryOf(BORDER_SPECIES)])
    expect(materialsOf(state)).toEqual([BORDER_SPECIES])
  })

  it('records a gate stop’s own cell only, with no unlock, ore first or other event', () => {
    // Its ore type already mined by a unit no cell names, so the stop meets only the species.
    const mined = heardOn(START, [cargoAddedOf(BORDER_ORE)]).state
    const { state, events } = heardOn(mined, [drillGatedAt(BORDER.cell, BORDER_ORE)])
    expect(events).toEqual([entryOf(BORDER_SPECIES)])
    expect(materialsOf(state)).toEqual([BORDER_SPECIES])
    expect(hasMet(state, speciesIdAt(START, BORDER.ahead)!)).toBe(false)
    expect(hasMet(state, speciesIdAt(START, BORDER.beside)!)).toBe(false)
  })

  it('records nothing for the cells ahead of, beside or behind a touched cell', () => {
    const { state } = heardOn(START, [drillDamageAt(BORDER.cell)])
    expect(hasMet(state, BORDER_SPECIES)).toBe(true)
    expect(hasMet(state, speciesIdAt(START, BORDER.ahead)!)).toBe(false)
    expect(hasMet(state, speciesIdAt(START, BORDER.beside)!)).toBe(false)
  })

  it.each([
    'power.void_sounder',
    'power.galvanic_probe',
    'power.slurry_siphon',
    'power.echo_sounder',
  ])('records nothing for a reading of %s over a species cell', (itemId) => {
    const { state, events } = heardOn(START, [powerUpUsedAt(BORDER.cell, itemId)])
    expect(events).toEqual([])
    expect(materialsOf(state)).toEqual([])
  })

  it.each([
    ['a blast’s unit', [tileDestroyedAt(BORDER.cell, 'blast'), cargoAddedOf(BORDER_ORE)]],
    ['a bore’s loose cell', [tileDestroyedAt(BORDER.cell, 'bore')]],
    ['an assay lens reading, #454’s route', [oreSampledAt(BORDER.cell, BORDER_ORE, 'lens')]],
  ])('records no species for %s', (_route, heard) => {
    const { state, events } = heardOn(START, heard)
    expect(materialEntriesOf(events as DomainEvent[])).toEqual([])
    expect(materialsOf(state)).toEqual([])
  })

  it('records nothing on a planet whose cells bind no species, every ore event as before', () => {
    const p8 = createAuthorityState({ planetIndex: 8, planetSeed: 83921, playerIds: ['p1'] })
    const tile = surfaceOreTiles(1, planetParamsOf(p8.planet)!)[0]
    const heard = [drillDamageAt(tile)]
    const on = heardOn(p8, heard)
    expect(materialsOf(on.state)).toEqual([])
    expect(on.events.length).toBeGreaterThan(0)
    expect(on).toEqual(withMaterialContact(false, () => heardOn(p8, heard)))
  })

  it('leaves the ore record and its events as they were with the switch off', () => {
    const mined = (isOn: boolean) =>
      withMaterialContact(isOn, () => {
        const session = createScriptedSession()
        const events = mineTile(session, 1, SURFACE.first)
        return { events, ore: codexOf(session.state(), 'p1')?.ore }
      })
    const on = mined(true)
    const off = mined(false)
    expect(on.events.filter((event) => !isMaterialEntry(event))).toEqual(off.events)
    expect(on.ore).toEqual(off.ore)
  })

  it('writes no material key with the switch off', () => {
    const state = withMaterialContact(false, () => {
      const session = createScriptedSession()
      mineTile(session, 1, SURFACE.first)
      return session.state()
    })
    expect(materialsOf(state)).toEqual([])
  })

  it('keeps one player’s species from the other player', () => {
    const session = createScriptedSession(['p1', 'p2'])
    mineTile(session, 1, SURFACE.first, 'p1')
    const speciesId = speciesIdAt(START, SURFACE.first)!
    expect(hasMet(session.state(), speciesId, 'p1')).toBe(true)
    expect(hasMet(session.state(), speciesId, 'p2')).toBe(false)
  })

  it('keeps the record through a snapshot round trip', () => {
    const session = createScriptedSession()
    mineTile(session, 1, SURFACE.first)
    const state = session.state()
    const restored = readSnapshot(
      JSON.parse(JSON.stringify(takeSnapshot(state))) as SessionSnapshot,
    )
    expect(restored.problems).toEqual([])
    if (!('state' in restored)) return
    expect(materialsOf(restored.state)).toEqual(materialsOf(state))
    expect(stateDigest(restored.state)).toBe(stateDigest(state))
  })

  it('reveals only the touched species through the kind look provider', () => {
    const provider = kindLookProvider()!
    const speciesIds = provider.kindLooksOf(P1).flatMap((look) => (look ? [look.speciesId] : []))
    const seenIn = (state: AuthorityState) =>
      speciesIds.filter((id) => provider.hasSeenKind(state, 'p1', id))
    const session = createScriptedSession()
    expect(seenIn(session.state())).toEqual([])
    mineTile(session, 1, SURFACE.first)
    expect(seenIn(session.state())).toEqual([speciesIdAt(START, SURFACE.first)])
  })
})

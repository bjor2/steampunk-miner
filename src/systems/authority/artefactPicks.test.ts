import { describe, expect, it } from 'vitest'
import { MM_PER_METRE } from '../../constants/physics'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { ARTEFACT_IDS, ARTEFACT_OPTIONS } from '../artefacts/artefactOptions'
import { artefactOptionsOfferedTo, type ArtefactOptionEntry } from '../registries/artefactOptions'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import { selectArtefactChoiceModel } from '../views/artefactChoiceModel'
import { FACING } from '../vehicle/vehiclePose'
import { artefactCacheTile } from '../world/artefactCache'
import { planetParamsFor } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { poseAt } from './collapse/collapseFixtures'
import type { DomainEvent } from './domainEvent'
import { isFeatureUnlocked } from './featureUnlocks'
import { createScriptedSession, FREEZE_ENEMIES, WORLD_SEED } from './scriptedSession'

// K2 #324 (the GD lock on #206, decisions 3 and 5): slice options join the cache's one pick, and
// any pick opens the cache's schedule rows. Fake slices register through withRegistrations.

const open = { type: 'openArtefactCache', payload: {} } as const
const choose = (optionId: string) => ({ type: 'chooseArtefact', payload: { optionId } }) as const
const setPlanet = (planetIndex: number) =>
  ({ type: 'debug.setPlanet', payload: { planetIndex } }) as const

const TWIST_ID = 'twists.deep_striker'

/** One more card, offered while `isOffered` says so; it borrows Ore Whisper's text and effects. */
function twistOption(isOffered: boolean, overrides: Partial<ArtefactOptionEntry> = {}) {
  return {
    ...ARTEFACT_OPTIONS[0],
    id: TWIST_ID,
    name: 'Deep Striker',
    iconId: 'icon-twist-deep-striker',
    isOfferedTo: () => isOffered,
    ...overrides,
  } satisfies ArtefactOptionEntry
}

function twistSlice(isOffered: boolean, overrides: Partial<ArtefactOptionEntry> = {}) {
  const option = twistOption(isOffered, overrides)
  return { id: 'twists', register: (r) => r.artefactOption(option) } satisfies SliceDefinition
}

function cacheTileOn(planetIndex: number): TilePoint {
  return artefactCacheTile(planetParamsFor(WORLD_SEED, planetIndex))
}

/** At rest on the cache of `planetIndex`, undocked, enemies frozen. */
function sessionAtCacheOf(planetIndex: number) {
  const session = createScriptedSession()
  const tile = cacheTileOn(planetIndex)
  const centre = (index: number) => index * MM_PER_METRE + MM_PER_METRE / 2
  if (planetIndex !== 1) session.submit(1, setPlanet(planetIndex))
  session.submit(2, FREEZE_ENEMIES)
  session.submit(3, poseAt(centre(tile.tx), centre(tile.ty), 0, FACING.down))
  return session
}

const unlockedIdsOf = (events: readonly DomainEvent[]) =>
  events.flatMap((event) => (event.type === 'FeatureUnlocked' ? [event.featureId] : []))

const rejectionOf = (events: readonly DomainEvent[]) =>
  events[0].type === 'CommandRejected' ? events[0].reason : null

/** Every schedule row open after taking `optionId` at the planet's cache: the cumulative ruler. */
function rulerAfterPicking(optionId: string, planetIndex = 1) {
  const session = sessionAtCacheOf(planetIndex)
  session.submit(4, open)
  const events = session.submit(5, choose(optionId))
  const openRows = LOCKED_SCHEDULE.rows.filter((row) => isFeatureUnlocked(session.state(), row.id))
  return { logged: unlockedIdsOf(events), open: openRows.map((row) => row.id) }
}

describe('the artefact-option registry', () => {
  it('offers the same three cards in the same order with nothing registered', () => {
    withRegistrations([], () => {
      const session = sessionAtCacheOf(1)
      expect(artefactOptionsOfferedTo(session.state(), 'p1').map((option) => option.id)).toEqual(
        ARTEFACT_IDS,
      )
      const cards = selectArtefactChoiceModel(session.state(), 'p1').cards
      expect(cards.map((card) => card.optionId)).toEqual(ARTEFACT_IDS)
    })
  })

  it('adds a registered option after the three only while it is offered to the player', () => {
    const offeredIds = (isOffered: boolean) =>
      withRegistrations([twistSlice(isOffered)], () =>
        selectArtefactChoiceModel(sessionAtCacheOf(1).state(), 'p1').cards.map(
          (card) => card.optionId,
        ),
      )
    expect(offeredIds(true)).toEqual([...ARTEFACT_IDS, TWIST_ID])
    expect(offeredIds(false)).toEqual(ARTEFACT_IDS)
  })

  it('holds an offered option as the one pick, and the cache is inert after it', () => {
    withRegistrations([twistSlice(true)], () => {
      const session = sessionAtCacheOf(1)
      session.submit(4, open)
      session.submit(5, choose(TWIST_ID))
      expect(session.state().players.p1.artefact).toEqual({
        id: TWIST_ID,
        fromPlanet: 1,
        breathingRoomCharges: 0,
      })
      expect(rejectionOf(session.submit(6, choose('artefact.ore_whisper')))).toBe(
        'artefact_unavailable',
      )
    })
  })

  it('refuses a registered option the cache does not offer the player now', () => {
    withRegistrations([twistSlice(false)], () => {
      const session = sessionAtCacheOf(1)
      expect(rejectionOf(session.submit(4, choose(TWIST_ID)))).toBe('artefact_unavailable')
      expect(session.state().players.p1.artefact).toBeNull()
    })
  })

  it('refuses at the seal a registered option that only bumps a vertical stat', () => {
    const drillBump = twistSlice(true, {
      gateClauses: ['new_rule'],
      effects: [{ kind: 'scalar', stat: 'drillPower', factor: '1.1' }],
    })
    expect(() => withRegistrations([drillBump], () => null)).toThrow(/vertical upgrade/)
  })

  it('refuses at the seal a registered option that takes a kernel id', () => {
    const artefact: SliceDefinition = {
      id: 'artefact',
      register: (r) => r.artefactOption(twistOption(true, { id: ARTEFACT_IDS[0] })),
    }
    expect(() => withRegistrations([artefact], () => null)).toThrow(/kernel artefact option/)
  })
})

describe('a pick opens the cache rows', () => {
  it('opens the planet 1 cache rows with the pick, logged after artefact_chosen', () => {
    const session = sessionAtCacheOf(1)
    session.submit(4, open)
    const events = session.submit(5, choose('artefact.assay_beacon'))
    expect(events.map((event) => event.type)).toEqual([
      'ArtefactChosen',
      ...unlockedIdsOf(events).map(() => 'FeatureUnlocked'),
    ])
    expect(unlockedIdsOf(events)).toEqual([
      'artefacts',
      'ore_whisper',
      'breathing_room',
      'assay_beacon',
    ])
  })

  it('leaves the cumulative ruler identical for every card choice', () => {
    withRegistrations([twistSlice(true)], () => {
      const rulers = [...ARTEFACT_IDS, TWIST_ID].map((optionId) => rulerAfterPicking(optionId))
      rulers.forEach((ruler) => expect(ruler).toEqual(rulers[0]))
    })
  })

  it('opens no row from a cache on a planet with no artefact row', () => {
    const ruler = rulerAfterPicking('artefact.ore_whisper', 2)
    expect(ruler.logged).toEqual([])
    expect(ruler.open).not.toContain('artefacts')
  })

  it('keeps the rows open on the next planet without logging them again', () => {
    const session = sessionAtCacheOf(1)
    session.submit(4, choose('artefact.breathing_room'))
    const events = session.submit(5, setPlanet(2))
    expect(unlockedIdsOf(events)).toEqual([])
    expect(isFeatureUnlocked(session.state(), 'artefacts')).toBe(true)
  })
})

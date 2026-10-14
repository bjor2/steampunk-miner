import { describe, expect, it } from 'vitest'
import { MM_PER_METRE } from '../../../constants/physics'
import { ARTEFACT_IDS } from '../../../systems/artefacts/artefactOptions'
import { poseAt } from '../../../systems/authority/collapse/collapseFixtures'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { isFeatureUnlocked } from '../../../systems/authority/featureUnlocks'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  WORLD_SEED,
} from '../../../systems/authority/scriptedSession'
import { artefactOptionsOfferedTo } from '../../../systems/registries/artefactOptions'
import { contentOf } from '../../../systems/registries/content'
import {
  describeItem,
  type ItemRef,
  type StatLine,
} from '../../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { artefactItemOf } from '../../../systems/registries/kernelItems'
import { LOCKED_SCHEDULE } from '../../../systems/unlocks/unlockSchedule'
import { selectArtefactChoiceModel } from '../../../systems/views/artefactChoiceModel'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { artefactCacheTile } from '../../../systems/world/artefactCache'
import { planetParamsFor } from '../../../systems/world/planetParams'
import { TWISTS } from './twistCatalogue'

// Ticket 329 (206c; GD lock on #206, decisions 3 to 5): the twists are a fourth cache card once
// their base item is owned, taken as the run's one pick, and the pick opens the cache's rows the
// same way whichever card was taken.

const open = { type: 'openArtefactCache', payload: {} } as const
const choose = (optionId: string) => ({ type: 'chooseArtefact', payload: { optionId } }) as const
const TWIST_IDS = TWISTS.map((twist) => twist.optionId)
const BASE_ITEM_IDS = TWISTS.map((twist) => twist.baseItemId)
const DEEP_STRIKER = 'artefact.seismic_ping'

/** At rest on planet 1's cache, undocked, enemies frozen, owning `owned`. */
function sessionAtCacheOwning(owned: readonly string[]) {
  const session = createScriptedSession()
  const tile = artefactCacheTile(planetParamsFor(WORLD_SEED, 1))
  const centre = (index: number) => index * MM_PER_METRE + MM_PER_METRE / 2
  session.submit(1, setVehicleLoadoutCommand({}, owned))
  session.submit(2, FREEZE_ENEMIES)
  session.submit(3, poseAt(centre(tile.tx), centre(tile.ty), 0, FACING.down))
  return session
}

const cardIdsOf = (owned: readonly string[]) =>
  selectArtefactChoiceModel(sessionAtCacheOwning(owned).state(), 'p1').cards.map(
    (card) => card.optionId,
  )

const rejectionOf = (events: readonly DomainEvent[]) =>
  events[0].type === 'CommandRejected' ? events[0].reason : null

/** The schedule rows logged by the pick and every row open after it: the cumulative ruler. */
function rulerAfterPicking(optionId: string) {
  const session = sessionAtCacheOwning(BASE_ITEM_IDS)
  session.submit(4, open)
  const events = session.submit(5, choose(optionId))
  const logged = events.flatMap((event) =>
    event.type === 'FeatureUnlocked' ? [event.featureId] : [],
  )
  const openRows = LOCKED_SCHEDULE.rows.filter((row) => isFeatureUnlocked(session.state(), row.id))
  return { logged, open: openRows.map((row) => row.id) }
}

/** The item names a vision row lists: "Artefact set I: Seismic ping, Second wind". */
function visionRowNames(): string[] {
  return LOCKED_SCHEDULE.rows
    .filter((row) => row.status === 'vision')
    .flatMap((row) => (row.name.split(':')[1] ?? row.name).split(','))
    .map((name) => name.trim().toLowerCase())
}

describe('artefact twist cards', () => {
  it('offers only the three base artefacts while no base item is owned', () => {
    expect(cardIdsOf([])).toEqual(ARTEFACT_IDS)
  })

  it('offers a twist as a fourth card once its base item is owned', () => {
    expect(cardIdsOf(['power.echo_sounder'])).toEqual([...ARTEFACT_IDS, DEEP_STRIKER])
  })

  it('offers each twist whose base item is owned, after the three, by id', () => {
    expect(cardIdsOf(BASE_ITEM_IDS)).toEqual([...ARTEFACT_IDS, ...[...TWIST_IDS].sort()])
  })

  it('offers nothing to a player who already holds the run artefact', () => {
    const session = sessionAtCacheOwning(BASE_ITEM_IDS)
    session.submit(4, choose(DEEP_STRIKER))
    expect(artefactOptionsOfferedTo(session.state(), 'p1').map((option) => option.id)).toEqual(
      ARTEFACT_IDS,
    )
  })

  it('never offers a vision row id, and every base item is a shipped vehicle item', () => {
    const rowIds = new Set(LOCKED_SCHEDULE.rows.map((row) => row.id))
    const offered = artefactOptionsOfferedTo(sessionAtCacheOwning(BASE_ITEM_IDS).state(), 'p1')
    const shipped = new Set(contentOf('vehicle-item').map((item) => item.id))
    expect(offered.filter((option) => rowIds.has(option.id))).toEqual([])
    expect(offered.filter((option) => option.id.startsWith('artefact_set_'))).toEqual([])
    expect(BASE_ITEM_IDS.filter((itemId) => !shipped.has(itemId))).toEqual([])
  })

  it('names no twist after a vision row', () => {
    const names = new Set(visionRowNames())
    expect(TWISTS.filter((twist) => names.has(twist.name.toLowerCase()))).toEqual([])
  })

  it('keeps every flavour line short, digit-free and clear of "rig"', () => {
    for (const twist of TWISTS) {
      expect(twist.description.length, twist.optionId).toBeLessThanOrEqual(80)
      expect(twist.description, twist.optionId).not.toMatch(/\d|\brig\b/i)
      expect(twist.summary, twist.optionId).not.toMatch(/\brig\b/i)
    }
  })
})

/** What a card shows on planet 1 for the player owning every base item, at `level`. */
function cardOf(ref: ItemRef, level: number) {
  const view = itemSnapshotViewOf(sessionAtCacheOwning(BASE_ITEM_IDS).state(), 'p1')
  return describeItem(ref, { playerId: 'p1', planetIndex: 1, level, view })
}

/** Each line as `label = now`. */
const readingsOf = (lines: readonly StatLine[] = []) =>
  lines.map((line) => `${line.label} = ${line.now}`)

describe('a twist item card', () => {
  it.each(TWISTS.map((twist) => [twist.name, twist] as const))(
    "shows %s's flavour and its base item's lines as bought, named for the base item",
    (_name, twist) => {
      const card = cardOf(artefactItemOf(twist.optionId), 0)
      const base = cardOf({ kind: 'vehicle-item', id: twist.baseItemId }, 1)
      const baseName = contentOf('power-up').find(
        (entry) => entry.itemId === twist.baseItemId,
      )?.name
      expect(card?.flavour).toBe(twist.description)
      expect(card?.statLines.length).toBeGreaterThan(0)
      expect(readingsOf(base?.statLines).map((reading) => `${baseName}: ${reading}`)).toEqual(
        expect.arrayContaining(readingsOf(card?.statLines)),
      )
    },
  )
})

describe('a twist pick', () => {
  it('holds the twist as the run artefact and leaves the cache inert after it', () => {
    const session = sessionAtCacheOwning(BASE_ITEM_IDS)
    session.submit(4, open)
    session.submit(5, choose(DEEP_STRIKER))
    expect(session.state().players.p1.artefact).toEqual({
      id: DEEP_STRIKER,
      fromPlanet: 1,
      breathingRoomCharges: 0,
    })
    expect(rejectionOf(session.submit(6, choose('artefact.ore_whisper')))).toBe(
      'artefact_unavailable',
    )
    expect(rejectionOf(session.submit(7, choose('artefact.grapple_anchor')))).toBe(
      'artefact_unavailable',
    )
  })

  it('refuses a twist whose base item is not owned', () => {
    const session = sessionAtCacheOwning([])
    session.submit(4, open)
    expect(rejectionOf(session.submit(5, choose(DEEP_STRIKER)))).toBe('artefact_unavailable')
    expect(session.state().players.p1.artefact).toBeNull()
  })

  it('leaves the cumulative ruler identical for every card choice, twists included', () => {
    const rulers = [...ARTEFACT_IDS, ...TWIST_IDS].map(rulerAfterPicking)
    rulers.forEach((ruler) => expect(ruler).toEqual(rulers[0]))
    expect(rulers[0].logged).not.toEqual([])
  })

  it('opens no schedule row named for a twist', () => {
    const { logged, open: openRows } = rulerAfterPicking(DEEP_STRIKER)
    const twistWords = TWIST_IDS.flatMap((id) => id.split('.'))
    expect([...logged, ...openRows].filter((rowId) => twistWords.includes(rowId))).toEqual([])
  })
})

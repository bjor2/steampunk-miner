import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { contentOf } from '../../systems/registries/content'
import { describeItem } from '../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../systems/registries/itemSnapshotView'
import { LOCKED_SCHEDULE } from '../../systems/unlocks/unlockSchedule'
import { oreFamilies } from '../ores'
import { lastMarkOf, type MarkLadder } from '../tech-tree'
import { AETHERIC_PROJECTIONS, AETHERIC_RUN_EVENTS } from './logging'
import { AETHERIC_REFUSALS } from './systems/aethericEvents'
import { AETHERIC_FORK_NODES } from './systems/aethericFork'
import { AETHERIC_TECH_NODES } from './systems/aethericNodes'
import { ARC_COIL_ID, arcCoilMarkLadder } from './systems/arcCoilItem'
import { CONDENSER_ID, condenserMarkLadder } from './systems/condenserItem'
import { GOVERNOR_ID, governorMarkLadder } from './systems/governorItem'
import { LANTERN_ID, lanternMarkLadder } from './systems/lanternItem'
import { WHISTLE_ID, whistleMarkLadder } from './systems/whistleItem'

// The GD lock on #245: an aetheric item names no frozen, magnetic or hollow feature and no ore
// family 3-12, which come with their acts, and claims no row of the locked schedule, vision or
// not: the lane ships no `stats.json` row. Read off everything the lane shows or logs: its nodes,
// its items' cards at every Mark, its power-up entries and its events, refusals and log lines.

const VISION_FEATURE_WORDS = /\b(frozen|magnetic|hollow)\b/i

const AETHERIC_LADDERS: Readonly<Record<string, MarkLadder>> = {
  [WHISTLE_ID]: whistleMarkLadder(),
  [LANTERN_ID]: lanternMarkLadder(),
  [ARC_COIL_ID]: arcCoilMarkLadder(),
  [GOVERNOR_ID]: governorMarkLadder(),
  [CONDENSER_ID]: condenserMarkLadder(),
}

const AETHERIC_ITEM_IDS = Object.keys(AETHERIC_LADDERS)

const view = itemSnapshotViewOf(
  createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] }),
  'p1',
)

/** Ore families 3-12 come with their acts; only the first two may be named this early. */
function laterFamilyNames(): string[] {
  return oreFamilies()
    .slice(2)
    .map((family) => family.name.toLowerCase())
}

/** Each vision row's id and the names it lists, lower case. */
function visionRowWords(): string[] {
  return LOCKED_SCHEDULE.rows
    .filter((row) => row.status === 'vision')
    .flatMap((row) => [row.id, ...(row.name.split(':')[1] ?? row.name).split(',')])
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length > 0)
}

/** Every card of the item from Mark 1 to its last, as plain text, on the lane's first planet. */
function cardTextsOf(itemId: string): string[] {
  const lastMark = lastMarkOf(AETHERIC_LADDERS[itemId])
  return Array.from({ length: lastMark }, (_, at) => at + 1).map((level) =>
    JSON.stringify(
      describeItem(
        { kind: 'vehicle-item', id: itemId },
        { playerId: 'p1', planetIndex: 15, level, view },
      ),
    ),
  )
}

/** All the text the lane shows or logs: nodes, cards, power-ups, events and refusals. */
function aethericTexts(): string[] {
  return [
    ...[...AETHERIC_TECH_NODES, ...AETHERIC_FORK_NODES].map((node) => JSON.stringify(node)),
    ...AETHERIC_ITEM_IDS.flatMap(cardTextsOf),
    ...contentOf('power-up')
      .filter((powerUp) => AETHERIC_ITEM_IDS.includes(powerUp.itemId))
      .map((powerUp) => JSON.stringify(powerUp)),
    ...Object.keys(AETHERIC_PROJECTIONS),
    JSON.stringify(AETHERIC_RUN_EVENTS),
    ...AETHERIC_REFUSALS,
  ].map((text) => text.toLowerCase())
}

describe('aetheric cards and vision rows', () => {
  it('cards every shipped aetheric item at every Mark', () => {
    const blank = AETHERIC_ITEM_IDS.flatMap(cardTextsOf).filter((card) => card === 'null')
    expect(blank).toEqual([])
  })

  it('names no frozen, magnetic or hollow feature on any aetheric card or effect', () => {
    expect(aethericTexts().filter((text) => VISION_FEATURE_WORDS.test(text))).toEqual([])
  })

  it('names no ore family past the first two on any aetheric card or effect', () => {
    const families = laterFamilyNames()
    expect(families).toHaveLength(10)
    const named = aethericTexts().flatMap((text) => families.filter((name) => text.includes(name)))
    expect(named).toEqual([])
  })

  it('claims no schedule row and names no vision row on any aetheric card or effect', () => {
    const words = visionRowWords()
    const lane = contentOf('tech-node').filter((node) => node.lane === 'aetheric')
    expect(lane.filter((node) => node.scheduleRowId !== undefined)).toEqual([])
    const named = aethericTexts().flatMap((text) => words.filter((word) => text.includes(word)))
    expect(named).toEqual([])
  })
})

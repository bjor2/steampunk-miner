/**
 * The sensing fork items' card entries (ticket 410, the K7 `itemDescriptionEntries` seam), with
 * Content's copy from the ticket: the flavour line and one line of words per card line, each
 * `{reading}` filled from `SENSING_FORK_BALANCE` and the branch's Mark ladder when the card is
 * drawn, never written into the copy. The charges, the recharge and the Mark line read the Mark
 * the card's level names and show the next Mark's until the item is Mastered; the rest are fixed.
 * Both items are reveal only (#203), so neither card has a yield or price line.
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { isMasteredAt, markStepOf } from '../../tech-tree'
import {
  DIVINER_ROD,
  forkLadderOf,
  isSensingForkItem,
  SCOUT_PINGER,
  SENSING_FORK_BALANCE,
  type SensingForkItemId,
} from './sensingFork'

const FIRST_MARK = 1

/** Tenths of a second: a stepped recharge reads 4.5 s, not 4.47 s. */
const TENTHS_PER_SECOND = 10

type Readings = Readonly<Record<string, string>>

interface ForkCardLine {
  label: string
  /** The text after the label, holding `{<reading>}` where each number goes. */
  template: string
  isMarkStepped: boolean
}

interface ForkCard {
  itemId: SensingForkItemId
  flavour: string
  lines: readonly ForkCardLine[]
  readingsAt(mark: number): Readings
}

const CHARGES_LINE: ForkCardLine = {
  label: 'Charges',
  template: '{charges}, then {cooldown} to recharge',
  isMarkStepped: true,
}

const FORK_NOTE_LINE: ForkCardLine = {
  label: 'Sensing fork',
  template: "pick Scout or Diviner. The other branch's item won't fire.",
  isMarkStepped: false,
}

const FORK_CARDS: readonly ForkCard[] = [
  {
    itemId: SCOUT_PINGER,
    flavour: 'A brass pinger that shouts into the rock and maps whatever shouts back.',
    lines: [
      {
        label: 'Ping',
        template:
          'marks lava, ore or open cave in every {blockTiles}×{blockTiles} block within {radiusTiles} cells; never which cell, or what tier',
        isMarkStepped: false,
      },
      { label: 'Lasts', template: 'marks stay until you dock', isMarkStepped: false },
      CHARGES_LINE,
      { label: 'Radius', template: '+{radiusBonus} cells', isMarkStepped: true },
      FORK_NOTE_LINE,
    ],
    readingsAt: scoutReadingsAt,
  },
  {
    itemId: DIVINER_ROD,
    flavour: 'A tuned rod that reads the rock dead ahead, cell by cell.',
    lines: [
      {
        label: 'Cone',
        template:
          'reveals every cell {lengthTiles} cells ahead of the drill in a narrow cone, with gate badges',
        isMarkStepped: false,
      },
      { label: 'Lasts', template: '{revealTime}', isMarkStepped: false },
      {
        label: 'Warns',
        template: 'shows roof collapses and enemies in the cone while the Diviner is your branch',
        isMarkStepped: false,
      },
      CHARGES_LINE,
      { label: 'Length', template: '+{lengthBonus} cells', isMarkStepped: true },
      FORK_NOTE_LINE,
    ],
    readingsAt: divinerReadingsAt,
  },
]

export const SENSING_FORK_ITEM_CARDS: readonly ItemDescriptionEntry[] = FORK_CARDS.map(forkCardOf)

function forkCardOf(card: ForkCard): ItemDescriptionEntry {
  return {
    id: `sensing.${card.itemId.slice('power.'.length)}`,
    matches: { kind: 'vehicle-item', id: card.itemId },
    flavour: card.flavour,
    statLines: card.lines.map((line) => lineSpecOf(card, line)),
  }
}

function lineSpecOf(card: ForkCard, line: ForkCardLine): DescribedStatLineSpec {
  return {
    label: line.label,
    kind: 'linearInt',
    value: (_ref: ItemRef, ctx: ItemCtx) => markOfLevel(ctx.level),
    textOf: (level: number) => fillTemplate(line.template, card.readingsAt(markOfLevel(level))),
    nextLevel: line.isMarkStepped ? nextMarkOf : hasNoNextLevel,
  }
}

function scoutReadingsAt(mark: number): Readings {
  const { blockTiles, radiusTiles } = SENSING_FORK_BALANCE.scout
  return {
    ...chargeReadingsAt(SCOUT_PINGER, mark),
    blockTiles: `${blockTiles}`,
    radiusTiles: `${radiusTiles}`,
    radiusBonus: `${magnitudeAt(SCOUT_PINGER, mark) - radiusTiles}`,
  }
}

function divinerReadingsAt(mark: number): Readings {
  const { lengthTiles, revealTicks } = SENSING_FORK_BALANCE.diviner
  return {
    ...chargeReadingsAt(DIVINER_ROD, mark),
    lengthTiles: `${lengthTiles}`,
    revealTime: secondsTextOf(revealTicks),
    lengthBonus: `${magnitudeAt(DIVINER_ROD, mark) - lengthTiles}`,
  }
}

function chargeReadingsAt(itemId: SensingForkItemId, mark: number): Readings {
  const { charges, cooldown } = markStepOf(forkLadderOf(itemId), mark).stats
  return { charges: `${charges ?? 0}`, cooldown: secondsTextOf(cooldown ?? 0) }
}

function magnitudeAt(itemId: SensingForkItemId, mark: number): number {
  return markStepOf(forkLadderOf(itemId), mark).stats.magnitude ?? 0
}

function fillTemplate(template: string, readings: Readings): string {
  return template.replace(/\{(\w+)\}/g, (_placeholder, name: string) => readings[name])
}

/** The Mark a card's level names: Mark 1 before any Mark is researched. */
function markOfLevel(level: number): number {
  return Math.max(FIRST_MARK, level)
}

/** 300 ticks reads "5 s"; 270 reads "4.5 s". */
function secondsTextOf(ticks: number): string {
  const tenths = Math.round((ticks * TENTHS_PER_SECOND) / TICKS_PER_SECOND)
  return `${tenths / TENTHS_PER_SECOND} s`
}

function nextMarkOf(ref: ItemRef, ctx: ItemCtx): number | null {
  const mark = markOfLevel(ctx.level)
  if (!isSensingForkItem(ref.id) || isMasteredAt(forkLadderOf(ref.id), mark)) return null
  return mark + 1
}

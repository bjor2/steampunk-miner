import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../../logging/runLog'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { resetGameStore, useGameStore } from '../../store/gameStore'
import {
  readRefineryBayModel,
  readSellBayModel,
  readUpgradeBayModel,
} from '../../store/screenReads'
import { formatAmount, formatPercent } from '../../systems/displayAmount'
import {
  div,
  floor,
  fromCanonical,
  fromSafeInteger,
  mul,
  sub,
  toCanonical,
  type Money,
} from '../../systems/money'
import type {
  ItemCtx,
  ItemDescriberProvider,
  ItemDescription,
  ItemRef,
  StatLine,
} from '../../systems/registries/itemDescriber'
import {
  itemDescriptionEntryOf,
  type ItemDescriptionEntry,
} from '../../systems/registries/itemDescriptionEntries'
import { withSection, type SaveSection } from '../../systems/registries/saveSections'
import { selectArtefactChoiceModel } from '../../systems/views/artefactChoiceModel'
import { itemCardOf, type ItemCardModel } from '../../systems/views/itemCardModel'
import { UI_ID_TEMPLATES } from '../../systems/views/screenIds'
import { readAuthorityState } from '../../store/authorityLink'
import { ArtefactChoiceView } from '../artefact/ArtefactChoiceView'
import { RefineryBayView } from '../platform/RefineryBayView'
import { SellBayView } from '../platform/SellBayView'
import { UpgradeBayView } from '../platform/UpgradeBayView'
import { ItemCard } from './ItemCard'
import { ItemTooltip } from './ItemTooltip'

// K7 (#199): the kernel's one item card on the shop row, the platform card and the tooltip, with a
// fake describer standing in for the descriptions slice (#164). Specs assert texts and data-*
// hooks, never markup shape (docs/TESTING_INSTRUCTIONS.md section 3).

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  resetGameStore()
})

afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()

const DRILL_BUY = UI_ID_TEMPLATES.workshopUpgradeBuy('drill_power')

/** Every StatLine field, as the Vertical Scaler's line shape carries them (acceptance 9). */
const FULL_LINE: StatLine = {
  label: 'Drill power',
  kind: 'saturating',
  now: '57',
  next: '70',
  delta: '13',
  deltaPct: formatPercent(fromCanonical('0.228')),
  major: { levelsTo: 3, value: '1.20e6' },
  cap: { value: '92', headroomPct: formatPercent(fromCanonical('0.125')) },
}

/** The full card's own words for FULL_LINE (#159), which the compact element shortens. */
const FULL_TEXTS = [
  'Drill power 57 → 70',
  '+13 (+22.8%)',
  'Next major in 3: 1.20e6',
  'Cap 92, 12.5% to go',
]

function fakeDescriptionOf(ref: ItemRef): ItemDescription {
  return {
    flavour: `A fake ledger line for ${ref.id}.`,
    statLines: [FULL_LINE],
    unlock: 'Available from planet 8',
    gateNote: 'Lets the drill take crystal ore',
  }
}

function sliceWithDescriber(describe: ItemDescriberProvider['describe']): SliceDefinition {
  return { id: 'fake', register: (r) => r.itemDescriber({ id: 'fake.describer', describe }) }
}

const FAKE_DESCRIBER = sliceWithDescriber(fakeDescriptionOf)

function renderDescribed(read: () => ReactElement): string {
  return withRegistrations([FAKE_DESCRIBER], () => renderToString(read()))
}

function upgradeBay(focusedId: string): ReactElement {
  return createElement(UpgradeBayView, { model: readUpgradeBayModel(), focusedId })
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/<!-- -->/g, '')
    .replace(/&#x27;/g, "'")
}

describe('item card: empty fast path', () => {
  // The baseline is the empty set, not the loaded one: the descriptions slice (#164) registers the
  // describer, and its rows' contract is the card's (GD and TD locks on #164).
  it('draws exactly today’s screens while no describer is registered', () => {
    const withNone = withRegistrations([], () => renderToString(upgradeBay(DRILL_BUY)))
    const withEntriesOnly = withRegistrations([MARK_SLICE], () =>
      renderToString(upgradeBay(DRILL_BUY)),
    )
    expect(withEntriesOnly).toBe(withNone)
    expect(withNone).not.toContain('data-item-card')
    expect(withNone).toContain(`data-testid="${DRILL_BUY}"`)
  })

  it('falls back to the kernel artefact summaries while no describer is registered', () => {
    const html = withRegistrations([], () => renderToString(artefactCards()))
    expect(textOf(html)).toContain('ore within 16 m glows at its rim')
    expect(html).not.toContain('data-item-card')
  })
})

describe('item card: shop row', () => {
  beforeEach(() => {
    game().giveMoney('1e6')
    game().teleportToDock('upgrade')
  })

  // The Upgrade bay's rows left the item card for the Outfitter's sheet cards (ticket 687: gain
  // text, no stat tables); the store's tap still opens before it buys.
  it('buys nothing on the first tap and buys once on the second', () => {
    game().tapItemCard(DRILL_BUY)
    const afterFirst = drillLevel()
    game().tapItemCard(DRILL_BUY)
    expect([afterFirst, drillLevel()]).toEqual([0, 1])
    expect(game().focusedControlId).toBe(DRILL_BUY)
  })

  it('opens another entry on a tap instead of buying the focused one', () => {
    game().tapItemCard(DRILL_BUY)
    game().tapItemCard(UI_ID_TEMPLATES.workshopUpgradeBuy('hull'))
    expect(drillLevel()).toBe(0)
    expect(game().focusedControlId).toBe(UI_ID_TEMPLATES.workshopUpgradeBuy('hull'))
  })
})

// Pass #427 (spec #422): the dock draws its cards on the shared element, the name and the first
// stat line on it and the rest of the card in its brass tooltip, in the compact caveat words.
describe('item card: platform card', () => {
  it('draws the next refinery slot on the shared element, the rest of its card in the tooltip', () => {
    game().setPlanet(3)
    game().teleportToDock('refinery')
    const html = renderDescribed(() =>
      createElement(RefineryBayView, { model: readRefineryBayModel(), focusedId: '' }),
    )
    expect(textOf(shownElementOf(html, 'dock.refinery.slot-buy'))).toContain(
      'Drill power 57 → 70 +13 (+22.8%)',
    )
    const tooltip = textOf(tooltipPlateOf(html, 'dock.refinery.slot-buy'))
    expect(tooltip).toContain('A fake ledger line for refinery_slot.')
    expect(tooltip).toContain('Major in 3: 1.20e6, cap 92 (12.5% to go)')
    expect(tooltip).toContain('Available from planet 8')
    expect(tooltip).toContain('Lets the drill take crystal ore')
  })

  it('prints every stat line field in the #159 words on the full card', () => {
    game().setPlanet(3)
    game().teleportToDock('refinery')
    const text = textOf(
      renderDescribed(() =>
        createElement(ItemCard, { variant: 'full', card: readRefineryBayModel().slotCard }),
      ),
    )
    FULL_TEXTS.forEach((part) => expect(text).toContain(part))
  })

  it('shows an artefact’s flavour and lines in place of its kernel summary', () => {
    const text = textOf(renderDescribed(artefactCards))
    expect(text).toContain('A fake ledger line for artefact.ore_whisper.')
    expect(text).not.toContain('ore within 16 m glows at its rim')
  })
})

describe('item card: tooltip', () => {
  it('carries the service’s card in the brass tooltip over Recharge, hidden until it opens', () => {
    game().teleportToDock('sell')
    const html = renderDescribed(() =>
      createElement(SellBayView, { model: readSellBayModel(), focusedId: '' }),
    )
    expect(textOf(shownElementOf(html, 'dock.recharge'))).toContain(
      'Drill power 57 → 70 +13 (+22.8%)',
    )
    const tooltip = tooltipPlateOf(html, 'dock.recharge')
    expect(tooltip).toContain('hidden')
    expect(textOf(tooltip)).toContain('A fake ledger line for recharge.')
    expect(textOf(tooltip)).toContain('Major in 3: 1.20e6, cap 92 (12.5% to go)')
  })

  it('adds no card tooltip while no describer is registered', () => {
    game().teleportToDock('sell')
    const html = withRegistrations([], () =>
      renderToString(createElement(SellBayView, { model: readSellBayModel(), focusedId: '' })),
    )
    expect(html).not.toContain('data-tooltip="dock.recharge"')
    expect(html).not.toContain('data-tooltip="dock.quick-service"')
  })
})

describe('item card: a slice entry for a generated item', () => {
  it('describes a grade-3 Mark on the shop row, the platform card and the tooltip', () => {
    const texts = withRegistrations([MARK_SLICE, ENTRY_DESCRIBER], () => {
      const card = markCard()
      return [
        renderToString(compactCard(card, MARK_BUY.id)),
        renderToString(createElement(ItemCard, { variant: 'full', card })),
        renderToString(createElement(ItemTooltip, { card, children: 'Mark' })),
      ].map(textOf)
    })
    texts.forEach((text) => {
      expect(text).toContain('Drill Mark 3: the temper of the third grade.')
      expect(text).toContain('Cooldown 9 → 8 -1')
    })
  })
})

describe('item card: unlock line and trip cap', () => {
  it('reads the trip cap from the snapshot view and shows it on all three surfaces', () => {
    const texts = withRegistrations([TRIP_SLICE], () => {
      const counter = { incomeItemValue: fromCanonical('62.9'), tripCap: fromSafeInteger(100) }
      const state = withSection(readAuthorityState(), game().playerId, TRIP_SECTION, counter)
      const card = itemCardOf(state, game().playerId, { ...DRAIN_SUBJECT, buy: MARK_BUY })
      return [
        renderToString(compactCard(card, MARK_BUY.id)),
        renderToString(createElement(ItemCard, { variant: 'full', card })),
        renderToString(createElement(ItemTooltip, { card, children: 'Drain' })),
      ].map(textOf)
    })
    texts.forEach((text) => expect(text).toContain('Trip cap 62% used'))
    expect(readAuthorityState().players[game().playerId].slices).toBeUndefined()
  })
})

function drillLevel(): number {
  return readUpgradeBayModel().tracks.find((row) => row.upgradeId === 'drill_power')!.level
}

function artefactCards(): ReactElement {
  const model = selectArtefactChoiceModel(readAuthorityState(), game().playerId)
  return createElement(ArtefactChoiceView, { model, focusedId: 'artefact-leave' })
}

/** The shared element `textId` up to its tooltip plate: what shows before the tooltip opens. */
function shownElementOf(html: string, textId: string): string {
  const start = html.indexOf(`data-ui-text="${textId}"`)
  expect(start, `${textId} is drawn on the shared element`).toBeGreaterThanOrEqual(0)
  return html.slice(start, html.indexOf('role="tooltip"', start))
}

/** The brass tooltip plate of the shared element `textId`. */
function tooltipPlateOf(html: string, textId: string): string {
  const plate = new RegExp(`<div role="tooltip"[^>]*data-tooltip="${textId}"[^>]*>.*?</div>`, 's')
  const found = plate.exec(html)?.[0]
  expect(found, `${textId} has a tooltip`).toBeDefined()
  return found ?? ''
}

/** A focused compact card: what a tapped shop row shows. */
function compactCard(card: ItemCardModel, buyId: string): ReactElement {
  const buy = { ...MARK_BUY, id: buyId }
  return createElement(ItemCard, {
    variant: 'compact',
    card,
    buy,
    focusedId: buyId,
    children: 'today',
  })
}

const MARK_BUY = {
  id: 'fake-mark-buy',
  label: 'Buy',
  action: { kind: 'closeSettings' as const },
  reason: null,
}

const MARK_REF: ItemRef = { kind: 'module', id: 'mark_drill', grade: 3 }

function markCard(): ItemCardModel {
  const subject = { item: MARK_REF, iconId: 'icon-mark', name: 'Drill Mark 3', cost: null }
  return itemCardOf(readAuthorityState(), game().playerId, { ...subject, level: 0, buy: MARK_BUY })
}

const GRADE_TEXTS = ['first', 'second', 'third']

/** A fake slice's Mark: a cooldown that drops one second a level from ten minus its grade. */
const MARK_ENTRY: ItemDescriptionEntry = {
  id: 'fake-marks.mark',
  matches: { kind: 'module', idPrefix: 'mark_' },
  flavour: (ref) =>
    `Drill Mark ${ref.grade}: the temper of the ${GRADE_TEXTS[ref.grade! - 1]} grade.`,
  statLines: [
    {
      label: 'Cooldown',
      kind: 'linearInt',
      value: (ref, ctx) => 12 - ref.grade! - ctx.level,
    },
  ],
}

const MARK_SLICE: SliceDefinition = {
  id: 'fake-marks',
  register: (r) => r.itemDescriptionEntries([MARK_ENTRY]),
}

/** A stand-in for the descriptions slice: one voice over every entry's raw values. */
const ENTRY_DESCRIBER = sliceWithDescriber((ref, ctx) => {
  const entry = itemDescriptionEntryOf(ref)
  if (entry === null) return null
  const flavour = typeof entry.flavour === 'string' ? entry.flavour : entry.flavour(ref)
  return { flavour, statLines: entry.statLines.map((spec) => lineOfSpec(spec, ref, ctx)) }
})

function lineOfSpec(
  spec: ItemDescriptionEntry['statLines'][number],
  ref: ItemRef,
  ctx: ItemCtx,
): StatLine {
  const now = asMoney(spec.value(ref, ctx))
  const next = asMoney(spec.value(ref, { ...ctx, level: ctx.level + 1 }))
  return {
    label: spec.label,
    kind: spec.kind,
    now: formatAmount(now),
    next: formatAmount(next),
    delta: formatAmount(sub(next, now)),
  }
}

function asMoney(value: number | Money): Money {
  return typeof value === 'number' ? fromSafeInteger(value) : value
}

interface TripCounter {
  incomeItemValue: Money
  tripCap: Money
}

const TRIP_SECTION: SaveSection<TripCounter> = {
  id: 'fake-drain.trip',
  version: 1,
  scope: 'player',
  initial: { incomeItemValue: fromSafeInteger(0), tripCap: fromSafeInteger(1) },
  problems: () => [],
  toPortable: (value) => ({
    incomeItemValue: toCanonical(value.incomeItemValue),
    tripCap: toCanonical(value.tripCap),
  }),
  ofPortable: (body) => body as TripCounter,
}

/** Systems' trip-cap line on #164: `floor(100 x incomeItemValue / tripCap)` percent used. */
function tripCapLineOf(ctx: ItemCtx): string {
  const trip = ctx.view.section(TRIP_SECTION)
  const used = floor(div(mul(trip.incomeItemValue, fromSafeInteger(100)), trip.tripCap))
  return `Trip cap ${formatAmount(used)}% used`
}

const TRIP_SLICE: SliceDefinition = {
  id: 'fake-drain',
  register: (r) => {
    r.saveSection(TRIP_SECTION)
    r.itemDescriber({
      id: 'fake-drain.describer',
      describe: (_ref, ctx) => ({
        flavour: 'A drain.',
        statLines: [FULL_LINE],
        unlock: tripCapLineOf(ctx),
      }),
    })
  },
}

const DRAIN_SUBJECT = {
  item: { kind: 'module', id: 'fake_drain' } satisfies ItemRef,
  iconId: 'icon-drain',
  name: 'Mineral drain',
  cost: null,
  level: 0,
}

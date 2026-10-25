/**
 * The bore width's rows in the balance and session reports (#223 `reportRows`; the VS pacing guard
 * and Systems' row on #662 Part B, ticket 749): per planet, the rig's width level when it arrived,
 * what it spent on width there, and the width cells it broke past the bare 1.2 m bore, in all and
 * a metre of the depth it reached. Read off the run's `vehicle_item_purchased`, fork and `drill_cut`
 * lines, never written into the log. The Tester judges the guard on P1-P5 from them: off-curve
 * width spend at most 6% and money a minute within 5% of #551.
 */
import type { ReportRow, ReportRowSource } from '../../logging/registries/reportRows'
import type { RunEvent } from '../../logging/runEvent'
import { formatAmount } from '../../systems/displayAmount'
import { add, fromCanonical, ZERO_MONEY, type Money } from '../../systems/money'
import { SIDE_CUTTERS_ID } from './systems/cuttersAndBoom'
import { WIDE_BRANCH, WIDE_WIDTH_LEVELS } from './systems/drillGearFork'
import { SIDE_CUTTER_MARKS, SIDE_CUTTERS_MARK } from './systems/sideCutterMarks'

export const WIDTH_REPORT_ROWS_ID = 'drill-gear.width'

const LANE = 'drill-gear'
const HUNDREDTHS = 100

export const widthReportRows: ReportRowSource = { id: WIDTH_REPORT_ROWS_ID, rowsOf: widthRowsOf }

function widthRowsOf(events: readonly RunEvent[], _worldSeed: number, planet: number): ReportRow[] {
  const onPlanet = events.filter((event) => event.planet === planet)
  const widthCells = widthCellsOf(onPlanet)
  return [
    { label: 'width level at arrival', value: String(widthLevelBefore(events, planet)) },
    { label: 'width spend', value: formatAmount(widthSpendOf(onPlanet)) },
    { label: 'width cells', value: String(widthCells) },
    { label: 'width cells a metre', value: perMetreTextOf(widthCells, deepestTilesOf(onPlanet)) },
  ]
}

/** The width level the rig owned before its first line on `planet`. */
function widthLevelBefore(events: readonly RunEvent[], planet: number): number {
  const arrival = events.findIndex((event) => event.planet === planet)
  const before = arrival === -1 ? events : events.slice(0, arrival)
  return markLevelOf(before) + wideLevelOf(before)
}

/** The widest width Mark bought: the side cutters Mark 1, each sold Mark its own number. */
function markLevelOf(events: readonly RunEvent[]): number {
  const marks = purchasedItemIdsOf(events).map(widthMarkOfItem)
  return Math.max(0, ...marks)
}

function widthMarkOfItem(itemId: string): number {
  if (itemId === SIDE_CUTTERS_ID) return SIDE_CUTTERS_MARK
  return SIDE_CUTTER_MARKS.find((mark) => mark.itemId === itemId)?.mark ?? 0
}

/** Wide's level while the lane's last chosen branch is Wide. */
function wideLevelOf(events: readonly RunEvent[]): number {
  const branches = events.flatMap(laneBranchOf)
  return branches[branches.length - 1] === WIDE_BRANCH ? WIDE_WIDTH_LEVELS : 0
}

/** The drill-gear branch a fork line chose or switched to; none for any other line. */
function laneBranchOf(event: RunEvent): string[] {
  const data = event.data as { lane?: string; branch?: string; to?: string }
  if (data.lane !== LANE) return []
  if (event.event === 'tech-tree.fork_chosen' && data.branch !== undefined) return [data.branch]
  if (event.event === 'tech-tree.fork_rechosen' && data.to !== undefined) return [data.to]
  return []
}

/** What the lines spent on width parts: the width Marks and the side cutters themselves. */
function widthSpendOf(events: readonly RunEvent[]): Money {
  return events
    .filter(isItemPurchase)
    .filter((event) => widthMarkOfItem(event.data.itemId) > 0)
    .reduce((sum, event) => add(sum, fromCanonical(event.data.price)), ZERO_MONEY)
}

function purchasedItemIdsOf(events: readonly RunEvent[]): string[] {
  return events.filter(isItemPurchase).map((event) => event.data.itemId)
}

function isItemPurchase(event: RunEvent): event is RunEvent<'vehicle_item_purchased'> {
  return event.event === 'vehicle_item_purchased'
}

function widthCellsOf(events: readonly RunEvent[]): number {
  return events.filter(isDrillCut).reduce((sum, event) => sum + (event.data.widthCells ?? 0), 0)
}

function isDrillCut(event: RunEvent): event is RunEvent<'drill_cut'> {
  return event.event === 'drill_cut'
}

function deepestTilesOf(events: readonly RunEvent[]): number {
  return Math.max(0, ...events.filter(isDrillCut).map((event) => event.depthTiles))
}

/** Cells over metres to two places, whole numbers only; none with no depth reached. */
function perMetreTextOf(cells: number, metres: number): string {
  if (metres === 0) return '0.00'
  const hundredths = Math.floor((cells * HUNDREDTHS) / metres)
  const fraction = String(hundredths % HUNDREDTHS).padStart(2, '0')
  return `${Math.floor(hundredths / HUNDREDTHS)}.${fraction}`
}

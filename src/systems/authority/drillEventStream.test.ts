import { describe, expect, it } from 'vitest'
import { DRILL_STAMP_RADIUS_MM } from '../../constants/balance'
import { MM_PER_METRE } from '../../constants/physics'
import type { DomainEvent } from './domainEvent'
import {
  BARE_BIT,
  cellKey,
  CLEARING_RIG,
  cutAtBothCadences,
  cutStream,
  positionAt,
  STREAM_GEARS,
  STREAM_TICKS,
  type CutStream,
  type StreamRun,
  type StreamTrack,
} from './drillEventStreamFixtures'
import { drillGatedOf, refusingGateAt } from './gatedBiteFixtures'

// The event stream at a pose report every tick against every 12 ticks (#514 Done-when 6, the TD's
// "Event-stream test" and the Horizontal Scaler's bar (b); on the report capsule of ticket 537, the
// GD 6241320435 and HS 6241316938), one fixed per-tick pose track replayed through the authority,
// level, tilted and turning, with the bare bit and each fake drill gear on its own reach (side
// cells, the reach boom, the twin bit pushed onto its diagonal), on a rig that clears every sample
// its stamp reaches inside a tick; every tick runs with the exact carry on, where interval 1 is
// live and the capsule cuts, every 12 ticks as the game ships:
// - slow track (0.5 m/s, 100 mm a report at 12 ticks): every cell the 12-tick reports cut, each
//   once, in the same order, any extra cell inside the stamp's and the gear's reach of the track
//   (the capsule finishes the rim cell under the bit's own stamp at the start, which the 12-tick
//   disc leaves part-cut: an extra inside the paid reach, the HS's acceptable kind), and no event
//   kind a 12-tick report does not answer;
// - fast track (3 m/s): every cell the 12-tick reports cut, each once, and any extra cell inside
//   the stamp's and the gear's reach of the track;
// - a gated cell on the track answers `DrillGated` once at either cadence (#519), and every cut
//   cell, its cargo and the codex's ore-first lines are credited to the cutting player;
// - a gear cell the track's last report lists is cut on that tick (HS finding 1 on #537: on the
//   capsule's running bite the gear's cells cut on every tick, never lost when the disc removed
//   nothing in the tick).
// The swept cut (flag on) keeps its 12-tick reports (#514 Q6), so it has no second stream to
// match. Rigs whose cells take several ticks are the lane `drillEventStream.lane.test.ts`.

const TRACKS: readonly StreamTrack[] = ['straight', 'tilted', 'turn']
const SLOW_MPS = 0.5
const FAST_MPS = 3
/** The bit's stamp, the gear's two cells and the cell a stamp edge reaches into. */
const PAID_REACH_MM = DRILL_STAMP_RADIUS_MM + 3 * MM_PER_METRE

function runOf(track: StreamTrack, speedMps: number, gear = BARE_BIT): StreamRun {
  return { track, speedMps, levels: CLEARING_RIG, gear }
}

function typesOf(events: readonly DomainEvent[]): Set<string> {
  return new Set(events.map((event) => event.type))
}

/**
 * Bar (b) on one row: every cell the 12-tick reports cut is cut once at every tick, and any extra
 * cell lies inside the paid reach of the track.
 */
function expectEveryTickWithinBar(run: StreamRun, everyTick: CutStream, every12: CutStream): void {
  const cutAtOne = new Set(everyTick.cells)
  const twelve = new Set(every12.cells)
  expect(every12.cells.filter((cell) => !cutAtOne.has(cell))).toEqual([])
  expect(cutAtOne.size).toBe(everyTick.cells.length)
  const extra = everyTick.cells.filter((cell) => !twelve.has(cell))
  expect(extra.filter((cell) => !isWithinPaidReach(run, cell))).toEqual([])
}

/** The cells both cadences cut, in the order every tick cut them. */
function commonCellsOf(everyTick: CutStream, every12: CutStream): string[] {
  const twelve = new Set(every12.cells)
  return everyTick.cells.filter((cell) => twelve.has(cell))
}

/** Whether the cell's centre lies within the paid reach of the body at some tick of the track. */
function isWithinPaidReach(run: StreamRun, key: string): boolean {
  return isWithinReach(run, key, PAID_REACH_MM)
}

/** Whether the cell's centre lies under the bit's stamp at some tick of the track: not a gear cell. */
function isWithinBitReach(run: StreamRun, key: string): boolean {
  return isWithinReach(run, key, DRILL_STAMP_RADIUS_MM)
}

function isWithinReach(run: StreamRun, key: string, reachMm: number): boolean {
  const [tx, ty] = key.split(',').map((part) => Number.parseInt(part, 10))
  const centre = { x: (tx + 0.5) * MM_PER_METRE, y: (ty + 0.5) * MM_PER_METRE }
  for (let tick = 0; tick <= STREAM_TICKS; tick++) {
    const at = positionAt(run, tick)
    if (Math.hypot(at.x - centre.x, at.y - centre.y) <= reachMm) return true
  }
  return false
}

/** The cut, cargo and ore-first lines of a stream, each with its cell and the player it credits. */
function creditedLinesOf(events: readonly DomainEvent[]): string[] {
  return events
    .filter((event) => /TileDestroyed|CargoAdded|codex\.Ore/.test(event.type))
    .map((event) => `${event.type} ${'tx' in event ? cellKey(event) : ''} ${playerOf(event)}`)
}

/** Gates answer for ore cells (#142), so the gated cell is the first ore cell the track cut. */
function firstOreCellOf(events: readonly DomainEvent[]): string {
  const ore = events.find((event) => event.type === 'TileDestroyed' && event.kind === 'ore')
  if (ore === undefined || !('tx' in ore)) throw new Error('the track cut no ore cell')
  return cellKey(ore)
}

function playerOf(event: DomainEvent): string {
  return ('playerId' in event ? event.playerId : undefined) ?? 'tick'
}

describe('the drill event stream at a report every tick and every 12 ticks (#514)', () => {
  for (const track of TRACKS) {
    for (const gear of STREAM_GEARS) {
      it(`cuts every 12-tick cell once in the same order, extras inside the paid reach, no new event kind, slow ${track} track, ${gear.name}`, () => {
        const run = runOf(track, SLOW_MPS, gear)
        const { everyTick, every12 } = cutAtBothCadences(run)
        expect(every12.cells.length).toBeGreaterThan(5)
        expectEveryTickWithinBar(run, everyTick, every12)
        expect(commonCellsOf(everyTick, every12)).toEqual(every12.cells)
        expect(
          [...typesOf(everyTick.events)].filter((t) => !typesOf(every12.events).has(t)),
        ).toEqual([])
      })

      it(`cuts every 12-tick cell once, extras inside the paid reach, fast ${track} track, ${gear.name}`, () => {
        const run = runOf(track, FAST_MPS, gear)
        const { everyTick, every12 } = cutAtBothCadences(run)
        expectEveryTickWithinBar(run, everyTick, every12)
      })
    }
  }

  it('answers DrillGated once for a gated ore cell on the track at either cadence', () => {
    const run = runOf('straight', SLOW_MPS)
    const gatedCell = firstOreCellOf(cutAtBothCadences(run).every12.events)
    const [tx, ty] = gatedCell.split(',').map((part) => Number.parseInt(part, 10))
    const gated = cutAtBothCadences({ ...run, slices: [refusingGateAt([{ tx, ty }])] })
    const gatedAt = (events: readonly DomainEvent[]) =>
      drillGatedOf(events).filter((event) => 'tx' in event && cellKey(event) === gatedCell)
    expect(gatedAt(gated.everyTick.events)).toHaveLength(1)
    expect(gatedAt(gated.every12.events)).toHaveLength(1)
    expect(gated.everyTick.cells).not.toContain(gatedCell)
  })

  it('cuts the gear cell the track’s last report lists on that tick, fast straight track, side cells', () => {
    const run = runOf('straight', FAST_MPS, STREAM_GEARS[1])
    const { everyTick, every12 } = cutAtBothCadences(run)
    const besideBit = (cell: string) => !isWithinBitReach(run, cell)
    const lastSideCells = everyTick.lastReportCells.filter(besideBit)
    expect(lastSideCells.length).toBeGreaterThan(0)
    expect(lastSideCells.filter((cell) => !every12.cells.includes(cell))).toEqual([])
    expect(everyTick.cells.filter((cell) => cell === lastSideCells[0])).toHaveLength(1)
  })

  it('credits the cut, the cargo and the ore-first lines to the cutting player in the same order', () => {
    const run = runOf('straight', SLOW_MPS)
    const everyTick = creditedLinesOf(cutStream(run, 1).events)
    const every12 = creditedLinesOf(cutStream(run, 12).events)
    expect(everyTick.some((line) => line.startsWith('CargoAdded'))).toBe(true)
    expect(everyTick).toEqual(every12)
    expect(everyTick.every((line) => line.endsWith(' p1'))).toBe(true)
  })
})

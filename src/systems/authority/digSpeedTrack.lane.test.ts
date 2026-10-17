import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { KnownRedMarker } from '../../constants/knownRed'
import { findingClosedOnIn } from '../../logging/knownRed'
import * as groundEdit from '../world/groundEdit'
import { LAW_WORK_PER_DRILL_TICK } from '../vehicle/cutCarry'
import type { TilePoint } from '../world/tileGrid'
import {
  addCarveRemoval,
  NO_CARVE_REMOVAL,
  walkingWithRemoval,
  type CarveRemoval,
} from './carveRemovalFixtures'
import { trackTicksOf, type Track, type TrackSection, type TrackTilt } from './digSpeedTrackFrame'
import {
  cutTrack,
  drillPowerFor,
  stretchOf,
  type TrackPath,
  type TrackRun,
} from './digSpeedTrackFixtures'
import {
  isHeatAtLaw,
  isUnderRatchet,
  isUnderTankFloor,
  isWithinLawShare,
  lawChargeBarsOf,
  lawChargeTextOf,
  sweptVerdictOf,
  type LawChargeBars,
} from './lawChargeBars'
import { geometryMissesOf, lawReadingOf, thousandthsOf, type LawReading } from './lawWorkFixtures'

// The dig-speed STOP of #514 (Done-when 3) on a fixed pose track at 3, 8, 25, 44, 240 and 3600
// m/s, flat and tilted, level and down (VS 6226431087 and 6226528512, the TD's v2 ruling
// 6226459471; 3 and 8 m/s are Step 0 of the carve-geometry ticket, TD on #537 6228947744 section
// 3, GD 6228937772): the live loop holds the body to 18 m/s, so these rows replay the same poses
// through the authority (`digSpeedTrackFixtures.ts`) on the swept cut, a report every tick and
// 12-tick reports, each from a fresh rig whose law speed is the track's on the same ground. Law
// work and cells per metre are read over a fixed stretch past the swept cut's 60 m lead, the
// charge per unit of law work over all it cut. At 3600 m/s the body crosses the track in two
// ticks and a flag-off report stamps its pose only, never the span between (the parked bore-bar
// wiring, TD v2 Q5), so that row reads what the report path does there.
// - Gated, bar 4 (1a), on A6's bars (#535, `lawChargeBars.ts`; the reference VS ruled on #535,
//   6230602042, recorded by the GD 6230602177, as the TD's paired-run list 6230607050 reads it): a
//   report every tick, charged on the law work it removed (`drill.exactCarry`, switched on for the
//   report paths as A6's lanes switch it on), within 1% of the analytic law value and under the
//   tank floor and the ratchet, heat at least the law's less one drill tick; a row under 100
//   quanta is quantized and logged. Swept's own charge pays 0.62 to 1.74 times the law by its
//   geometry (#540), so the ratio to swept is logged beside it, amber outside 5%, never gated.
// - Gated, the ratchet until #537 lands: on law work per metre (1b) and cells per metre (3), a
//   report every tick misses its band against swept by no more than 12-tick reports do.
// - Known red under #537, never a pass (VS 6236441275 condition 1, the GD 6236443694): a report
//   every tick reads 0.77 to 0.95 of swept's law work per metre at 3 to 44 m/s (lower at 240 and
//   3600 m/s, where a report stamps its pose only), under the 1.000 floor #537 lands; each row
//   outside the geometry bands is printed as known red, and the marker fails as expired once #537
//   closes and fails while every row is inside the bands, so it is deleted when A7 lands.
// - Logged: Step 0's reading, a report every tick over swept on law work per metre at 3, 8, 25 and
//   44 m/s (at least 0.99 on every row: the carve is not the cause and A7 is not built; any lower
//   row: one capsule round of A7 after A6), with the report carve's removal per metre over the
//   stretch: attempted before the clamp, applied, and the formula's unrounded continuum; bar 2,
//   law work per yielded cell over swept's (VS 6228841725). A lane: it runs only when named, prints
//   the table and writes balance-report/dig-speed-track.ndjson.

const SPEEDS_MPS = [3, 8, 25, 44, 240, 3600]
const TILTS: readonly TrackTilt[] = ['flat', 'tilted']
const SECTIONS: readonly TrackSection[] = ['level', 'down']
const PATHS: readonly TrackPath[] = ['swept', 'every tick', 'every 12']
const REPORT_EVERY = 12
const STEP_ZERO = { speedsMps: [3, 8, 25, 44], floor: 0.99 }
const REPORT_FOLDER = new URL('../../../balance-report/', import.meta.url)
const TICKETS_FOLDER = new URL('../../../docs/metrics/tickets/', import.meta.url)
/**
 * The carve-geometry deviation #514 ships with (VS 6236441275 condition 1): local to this lane, as
 * `physics/exactCarry.lane.test.ts` holds #541's; the repo's one exported marker is
 * `CAMPAIGN_PACING_KNOWN_RED` (ticket 419).
 */
const CARVE_GEOMETRY_KNOWN_RED: KnownRedMarker = {
  finding: 537,
  reason:
    'a report every tick cuts 0.77 to 0.95 of the swept cut law work per metre at 3 to 44 m/s (0.28 to 0.65 at 240 m/s, nothing past its pose at 3600 m/s), the same carve as 12-tick reports; the 1.000 floor and cells per metre within 5% are #537 landing bars',
}
const discCarve = groundEdit.carveDisc

/** The report carve's removal per metre of the stretch, full cells; null on the swept cut. */
interface RemovalColumns {
  attemptedCellsPerMetre: number | null
  appliedCellsPerMetre: number
  continuumCellsPerMetre: number | null
}

interface TrackReading extends LawReading, RemovalColumns {
  speedMps: number
  tilt: TrackTilt
  section: TrackSection
  path: TrackPath
  drillPower: number
  metres: number
}

const readings: TrackReading[] = []
/** Each report path's charge against the analytic law value, by track and path. */
const chargeBars = new Map<string, LawChargeBars>()

afterAll(() => {
  console.log(formatTable(readings))
  console.log(stepZeroLinesOf(readings).join('\n'))
  writeReadings(readings)
})

function tracksOf(): Track[] {
  return SPEEDS_MPS.flatMap((speedMps) =>
    TILTS.flatMap((tilt) => SECTIONS.map((section) => ({ speedMps, tilt, section }))),
  )
}

function nameOf(track: Track): string {
  return `${track.speedMps} m/s ${track.tilt} ${track.section}`
}

/** The paths the track lasts: the 12-tick cadence only where it sends a report. */
function pathsOf(track: Track): TrackPath[] {
  return PATHS.filter((path) => path !== 'every 12' || hasTwelveTickReport(track))
}

function hasTwelveTickReport(track: Track): boolean {
  return trackTicksOf(track) >= REPORT_EVERY
}

/** The bars per unit of law work read over all the track cut; per metre, over its stretch. */
function readTrack(track: Track, path: TrackPath): TrackReading {
  const drillPower = drillPowerFor(track)
  const { run, removal } =
    path === 'swept'
      ? { run: cutTrack(track, path, drillPower), removal: null }
      : cutRecordingRemoval(track, path, drillPower)
  const perMetre = lawReadingOf({ ...run, ...run.stretch })
  chargeBars.set(`${nameOf(track)} ${path}`, lawChargeBarsOf(chargeReadOf(run)))
  return {
    ...track,
    path,
    drillPower,
    metres: thousandthsOf(run.metres),
    ...lawReadingOf(run),
    lawWorkPerMetre: perMetre.lawWorkPerMetre,
    cellsPerMetre: perMetre.cellsPerMetre,
    oneCellShare: perMetre.oneCellShare,
    ...removalColumnsOf(run, removal),
  }
}

/** What the run removed, in density sub-steps, and what it charged, as A6's bars read them. */
function chargeReadOf(run: TrackRun) {
  return {
    lawWork: run.law.ticks * LAW_WORK_PER_DRILL_TICK,
    energy: run.drillEnergy,
    heatTicks: run.heatTicks,
  }
}

/** Cuts the track with every disc carve's removal on the stretch summed. */
function cutRecordingRemoval(track: Track, path: TrackPath, drillPower: number) {
  let removal = NO_CARVE_REMOVAL
  const spy = spyOnDiscCarves(stretchCellsOf(track), (carved) => {
    removal = addCarveRemoval(removal, carved)
  })
  try {
    return { run: cutTrack(track, path, drillPower), removal }
  } finally {
    spy.mockRestore()
  }
}

/** Every disc carve walks its stamp with its removal on `isCounted` cells handed to `record`. */
function spyOnDiscCarves(
  isCounted: (tile: TilePoint) => boolean,
  record: (removal: CarveRemoval) => void,
) {
  return vi
    .spyOn(groundEdit, 'carveDisc')
    .mockImplementation((world, params, disc, window, drillTicksOf, walk) =>
      discCarve(
        world,
        params,
        disc,
        window,
        drillTicksOf,
        walkingWithRemoval(walk ?? groundEdit.walkStampInRows, isCounted, record),
      ),
    )
}

function stretchCellsOf(track: Track): (tile: TilePoint) => boolean {
  const keys = new Set(stretchOf(track).tiles.map(keyOf))
  return (tile) => keys.has(keyOf(tile))
}

function keyOf(tile: TilePoint): string {
  return `${tile.tx},${tile.ty}`
}

/**
 * The removal columns over the stretch; the recorder must see what the ground lost there, or a
 * carve went round the disc carve and the columns would not add up.
 */
function removalColumnsOf(run: TrackRun, removal: CarveRemoval | null): RemovalColumns {
  const { metres, law } = run.stretch
  const appliedCellsPerMetre = thousandthsOf(law.cellsRemoved / metres)
  if (removal === null) {
    return { attemptedCellsPerMetre: null, appliedCellsPerMetre, continuumCellsPerMetre: null }
  }
  if (thousandthsOf(removal.applied / metres) !== appliedCellsPerMetre) {
    throw new Error(`the disc carves applied ${removal.applied} of ${law.cellsRemoved} cells`)
  }
  return {
    attemptedCellsPerMetre: thousandthsOf(removal.attempted / metres),
    appliedCellsPerMetre,
    continuumCellsPerMetre: thousandthsOf(removal.continuum / metres),
  }
}

/** Step 0: the lowest report-every-tick over swept law work per metre at each speed, and the verdict. */
function stepZeroLinesOf(rows: readonly TrackReading[]): string[] {
  const lowest = STEP_ZERO.speedsMps.map((speedMps) => lowestStepZeroRatioAt(rows, speedMps))
  const isCarveCleared = lowest.every((ratio) => ratio >= STEP_ZERO.floor)
  return [
    ...lowest.map((ratio, i) => `Step 0, ${STEP_ZERO.speedsMps[i]} m/s: lowest ${ratio}`),
    `Step 0 (#537): ${isCarveCleared ? 'every row at least 0.99' : 'a row below 0.99'}`,
  ]
}

function lowestStepZeroRatioAt(rows: readonly TrackReading[], speedMps: number): number {
  const ratios = tracksOf()
    .filter((track) => track.speedMps === speedMps)
    .map((track) => lawWorkRatioOf(rows, track))
  return thousandthsOf(Math.min(...ratios))
}

function lawWorkRatioOf(rows: readonly TrackReading[], track: Track): number {
  const reading = (path: TrackPath) => rows.find((row) => isReadingOf(row, track, path))
  const [everyTick, swept] = [reading('every tick'), reading('swept')]
  if (everyTick === undefined || swept === undefined) return NaN
  return everyTick.lawWorkPerMetre / swept.lawWorkPerMetre
}

function isReadingOf(row: TrackReading, track: Track, path: TrackPath): boolean {
  return nameOf(row) === nameOf(track) && row.path === path
}

function formatTable(rows: readonly TrackReading[]): string {
  const columns = Object.keys(rows[0] ?? {}) as (keyof TrackReading)[]
  const lines = rows.map((row) => columns.map((column) => row[column]).join(' | '))
  return [columns.join(' | '), ...lines].join('\n')
}

function writeReadings(rows: readonly TrackReading[]): void {
  mkdirSync(REPORT_FOLDER, { recursive: true })
  const lines = rows.map((row) => JSON.stringify({ ticket: 514, ...row }))
  writeFileSync(new URL('dig-speed-track.ndjson', REPORT_FOLDER), `${lines.join('\n')}\n`)
}

function readingOf(track: Track, path: TrackPath): TrackReading {
  const found = readings.find((row) => isReadingOf(row, track, path))
  if (found === undefined) throw new Error(`no ${nameOf(track)} ${path} track was cut`)
  return found
}

function chargeBarsOf(track: Track, path: TrackPath): LawChargeBars {
  const found = chargeBars.get(`${nameOf(track)} ${path}`)
  if (found === undefined) throw new Error(`no ${nameOf(track)} ${path} track was cut`)
  return found
}

/** A report every tick over swept, per unit of law work and per metre: logged beside the bars. */
function sweptRatiosOf(track: Track) {
  const everyTick = readingOf(track, 'every tick')
  const swept = readingOf(track, 'swept')
  const ratioOf = (column: keyof LawReading) => thousandthsOf(everyTick[column] / swept[column])
  return {
    lawWorkPerMetre: ratioOf('lawWorkPerMetre'),
    lawTicksPerCellOverSwept: ratioOf('lawTicksPerCell'),
    cellsPerMetre: ratioOf('cellsPerMetre'),
    energyPerLawTick: ratioOf('energyPerLawTick'),
    heatPerLawTick: ratioOf('heatPerLawTick'),
    quantization: swept.oneCellShare,
  }
}

function sweptRatioTextOf(track: Track): string {
  const ratios = sweptRatiosOf(track)
  const verdict = `energy ${sweptVerdictOf(ratios.energyPerLawTick)}, heat ${sweptVerdictOf(ratios.heatPerLawTick)}`
  return `/ swept (logged, ${verdict}): ${JSON.stringify(ratios)}`
}

/** Each cadence's carve-geometry misses against the swept cut, to the thousandth every bar reads. */
function geometryMissesAtBothCadences(track: Track) {
  const swept = readingOf(track, 'swept')
  const missesAt = (path: TrackPath) => {
    const misses = geometryMissesOf(readingOf(track, path), swept)
    return {
      lawWorkPerMetre: thousandthsOf(misses.lawWorkPerMetre),
      cellsPerMetre: thousandthsOf(misses.cellsPerMetre),
    }
  }
  const misses = { everyTick: missesAt('every tick'), every12: missesAt('every 12') }
  console.log(`${nameOf(track)} geometry misses: ${JSON.stringify(misses)}`)
  return misses
}

/** Each track a report every tick cuts outside the carve-geometry bands against swept. */
function geometryProblemsOf(): string[] {
  return tracksOf()
    .map((track) => ({
      track,
      misses: geometryMissesOf(readingOf(track, 'every tick'), readingOf(track, 'swept')),
    }))
    .filter(({ misses }) => misses.lawWorkPerMetre > 0 || misses.cellsPerMetre > 0)
    .map(({ track }) => `${nameOf(track)}: ${JSON.stringify(sweptRatiosOf(track))}`)
}

/**
 * The known-red verdict on the carve geometry (`logging/knownRed.ts`'s rule, local to this lane):
 * every row outside the bands is held as known red under #537 and printed; every row inside them
 * fails until the marker is deleted; a closed #537 fails as expired.
 */
function carveKnownRedVerdictOf(problems: readonly string[]): {
  failures: string[]
  knownRed: string[]
} {
  const { finding } = CARVE_GEOMETRY_KNOWN_RED
  const closedOn = findingClosedOnIn(readTicketFile(finding))
  if (closedOn !== null) {
    const expired = `known-red marker for #${finding} expired: the finding closed on ${closedOn}; delete the marker (the carve must meet its bars) or file a new finding`
    return { failures: [expired, ...problems], knownRed: [] }
  }
  if (problems.length === 0) {
    const green = `a report every tick meets the carve-geometry bars on every track but is still marked known-red for #${finding}: delete the marker`
    return { failures: [green], knownRed: [] }
  }
  return {
    failures: [],
    knownRed: problems.map((problem) => `known-red (#${finding}): ${problem}`),
  }
}

/** The finding's metrics file as text (the loop writes it when it closes a ticket), or null if none. */
function readTicketFile(finding: number): string | null {
  const url = new URL(`${finding}.json`, TICKETS_FOLDER)
  return existsSync(url) ? readFileSync(url, 'utf8') : null
}

describe('dig speed of a report every tick on a fixed track, 3 to 3600 m/s (#514 STOP)', () => {
  for (const track of tracksOf()) {
    it(`cuts the ${nameOf(track)} track on every path with no rejection`, () => {
      const cut = pathsOf(track).map((path) => readTrack(track, path))
      readings.push(...cut)
      expect(cut.every((reading) => reading.metres > 0)).toBe(true)
    })

    it(`charges and heats a report every tick at the analytic law value, ${nameOf(track)} (bar 4)`, () => {
      const bars = chargeBarsOf(track, 'every tick')
      const message = `${nameOf(track)} / law: ${lawChargeTextOf(bars)}`
      console.log(`${message}\n${nameOf(track)} ${sweptRatioTextOf(track)}`)
      if (!bars.isMeasurable) return
      expect(isWithinLawShare(bars.energyRatio), message).toBe(true)
      expect(isUnderTankFloor(bars.energyRatio), message).toBe(true)
      expect(isUnderRatchet(bars.energyRatio), message).toBe(true)
      expect(isHeatAtLaw(bars), message).toBe(true)
    })

    if (!hasTwelveTickReport(track)) continue
    it(`misses the carve-geometry bars by no more than 12-tick reports, ${nameOf(track)}`, () => {
      const { everyTick, every12 } = geometryMissesAtBothCadences(track)
      expect(everyTick.lawWorkPerMetre).toBeLessThanOrEqual(every12.lawWorkPerMetre)
      expect(everyTick.cellsPerMetre).toBeLessThanOrEqual(every12.cellsPerMetre)
    })
  }

  it('holds the carve geometry of a report every tick as known red under #537, never a pass', () => {
    const verdict = carveKnownRedVerdictOf(geometryProblemsOf())
    console.log(verdict.knownRed.join('\n'))
    expect(verdict.failures).toEqual([])
  })
})

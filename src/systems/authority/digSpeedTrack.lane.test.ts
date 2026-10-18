import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it, vi } from 'vitest'
import * as groundEdit from '../world/groundEdit'
import { LAW_WORK_PER_DRILL_TICK } from '../vehicle/cutCarry'
import type { TilePoint } from '../world/tileGrid'
import {
  addCarveRemoval,
  NO_CARVE_REMOVAL,
  walkingWithRemoval,
  type CarveRemoval,
} from './carveRemovalFixtures'
import { carveGeometryVerdictOf } from './carveGeometryKnownRed'
import { trackTicksOf, type Track, type TrackSection, type TrackTilt } from './digSpeedTrackFrame'
import {
  cutTrack,
  drillPowerFor,
  hardestCellTicksFor,
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
import {
  CARVE_GEOMETRY_BARS,
  geometryMissesAgainst,
  geometryMissesOf,
  lawReadingOf,
  inCellTimesOf,
  thousandthsOf,
  type GeometryMisses,
  type LawReading,
} from './lawWorkFixtures'

// The dig-speed STOP of #514 (Done-when 3) on a fixed pose track at 3, 5, 8, 25, 44, 240 and 3600
// m/s, flat and tilted, level and down (VS 6226431087 and 6226528512, the TD's v2 ruling
// 6226459471; 3 and 8 m/s are Step 0 of the carve-geometry ticket, TD on #537 6228947744 section
// 3, GD 6228937772; 5 m/s is #537's floor rig): the live loop holds the body to 18 m/s, so these
// rows replay the same poses through the authority (`digSpeedTrackFixtures.ts`) on the swept cut,
// a report every tick (the report capsule of ticket 537, as it ships at interval 1), the same
// report every tick with the capsule off (protocol 86's bare disc, logged beside it) and 12-tick
// reports (main's bare disc: a 12-tick report never carves a capsule), each from a fresh rig
// whose law speed is the track's on the same ground. Law work and cells per metre are read over a
// fixed stretch past the swept cut's 60 m lead, the charge per unit of law work over all it cut.
// At 3600 m/s the body crosses the track in two ticks and a flag-off report stamps its pose only,
// never the span between (the parked bore-bar wiring, TD v2 Q5), so that row reads what the
// report path does there.
// - Gated, #537's hard landing bars (the GD's ruling after the prototype round 6241320435, VS
//   6241318671), on the rows at 3, 8, 25 and 44 m/s: against the 5 m/s rig on the same track, law
//   work per metre at least 1.000 (bar 1, the floor: work is never cheaper at speed; each rig's
//   law work read in its own hardest-cell times, `inCellTimesOf`) and cells per metre within 5%
//   (bar 3). Three named deviations are held as known red under #545, the paid-cell rule on the
//   report path (`carveGeometryKnownRed.ts`: the floor at 3 m/s flat level, cells per metre at 25
//   and 44 m/s tilted down), printed with the finding and never called a pass; any other red bar
//   fails, as does a named row that turns green or a closed #545.
// - Printed, not gated (GD ruling 1; VS: "print them, don't gate them, and don't re-reference
//   them"): parity against swept as shipped, law work per metre within 5% (bar 2), and the Step 0
//   re-read at least 0.99 of swept (bar 4), amber per row; swept clears every crossed cell in
//   full (`paidCellClear.ts`), which no disc or capsule reproduces without a paid-cell rule. This
//   lane's stretch is 45 m; the 250 m window of bar 2 is the loop lane's. The rows at 240 and
//   3600 m/s are logged: their steps exceed the capsule's cap, so they cut the bare disc as before
//   and stay the parked #441 and #439 wiring.
// - Gated, bar 4 (1a), on A6's bars (#535, `lawChargeBars.ts`; the reference VS ruled on #535,
//   6230602042, recorded by the GD 6230602177, as the TD's paired-run list 6230607050 reads it): a
//   report every tick, charged on the law work it removed (`drill.exactCarry`, switched on for the
//   report paths as A6's lanes switch it on), within 1% of the analytic law value and under the
//   tank floor and the ratchet, heat at least the law's less one drill tick; a row under 100
//   quanta is quantized and logged. Swept's own charge pays 0.62 to 1.74 times the law by its
//   geometry (#540), so the ratio to swept is logged beside it, amber outside 5%, never gated.
// - Gated, #514's ratchet (GD 6228851107 and 6228937772): on law work per metre and cells per
//   metre, a report every tick misses the swept bands by no more than main's 12-tick reports do
//   (`every 12`).
// - Logged: the Step 0 reading, a report every tick over swept on law work per metre at 3, 8, 25
//   and 44 m/s, and the capsule's own move, every tick over every tick with the capsule off; the
//   report carve's removal per metre over the stretch: attempted before the clamp, applied, and
//   the formula's unrounded continuum; bar 2 of #514, law work per yielded cell over swept's (VS
//   6228841725). A lane: it runs only when named, prints the table and writes
//   balance-report/dig-speed-track.ndjson.

const SPEEDS_MPS = [3, 5, 8, 25, 44, 240, 3600]
const TILTS: readonly TrackTilt[] = ['flat', 'tilted']
const SECTIONS: readonly TrackSection[] = ['level', 'down']
const PATHS: readonly TrackPath[] = ['swept', 'every tick', 'every tick, disc', 'every 12']
const REPORT_EVERY = 12
/** The rows #537's landing bars gate, and the rig they read the floor against. */
const LANDING_SPEEDS_MPS = [3, 8, 25, 44]
const FLOOR_RIG_MPS = 5
const STEP_ZERO = { speedsMps: LANDING_SPEEDS_MPS, floor: CARVE_GEOMETRY_BARS.parity.lawWorkFloor }
const REPORT_FOLDER = new URL('../../../balance-report/', import.meta.url)
const TICKETS_FOLDER = new URL('../../../docs/metrics/tickets/', import.meta.url)
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
  /** The rig's law time for a cell of the track's hardest band, ticks: the floor's unit. */
  hardestCellTicks: number
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

function landingTracksOf(): Track[] {
  return tracksOf().filter((track) => LANDING_SPEEDS_MPS.includes(track.speedMps))
}

function nameOf(track: Track): string {
  return `${track.speedMps} m/s ${track.tilt} ${track.section}`
}

/** The paths the track lasts: the 12-tick cadences only where it sends a report. */
function pathsOf(track: Track): TrackPath[] {
  return PATHS.filter((path) => !isTwelveTickPath(path) || hasTwelveTickReport(track))
}

function isTwelveTickPath(path: TrackPath): boolean {
  return path === 'every 12'
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
    hardestCellTicks: thousandthsOf(hardestCellTicksFor(track, drillPower)),
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

/** Step 0: the lowest report-every-tick over swept law work per metre at each speed, printed, not gated. */
function stepZeroLinesOf(rows: readonly TrackReading[]): string[] {
  const lowest = STEP_ZERO.speedsMps.map((speedMps) => lowestStepZeroRatioAt(rows, speedMps))
  const isCarveCleared = lowest.every((ratio) => ratio >= STEP_ZERO.floor)
  return [
    ...lowest.map((ratio, i) => `Step 0, ${STEP_ZERO.speedsMps[i]} m/s: lowest ${ratio}`),
    `Step 0 re-read (#537 bar 4, printed, not a gate): ${isCarveCleared ? 'every row at least 0.99' : 'a row below 0.99 (amber)'}`,
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

/**
 * The 5 m/s rig's report every tick on the same track, its law work in its own cell times:
 * #537's floor reference, read against the row in its cell times (`inCellTimes`).
 */
function floorReadingOf(track: Track): TrackReading {
  return inCellTimes(readingOf({ ...track, speedMps: FLOOR_RIG_MPS }, 'every tick'))
}

function inCellTimes(reading: TrackReading): TrackReading {
  return { ...reading, ...inCellTimesOf(reading, reading.hardestCellTicks) }
}

/** A report every tick over `reference`, per unit of law work and per metre. */
function ratiosOf(track: Track, reference: TrackReading) {
  return ratiosBetween(readingOf(track, 'every tick'), reference)
}

function ratiosBetween(reading: TrackReading, reference: TrackReading) {
  const ratioOf = (column: keyof LawReading) => thousandthsOf(reading[column] / reference[column])
  return {
    lawWorkPerMetre: ratioOf('lawWorkPerMetre'),
    lawTicksPerCellOverReference: ratioOf('lawTicksPerCell'),
    cellsPerMetre: ratioOf('cellsPerMetre'),
    energyPerLawTick: ratioOf('energyPerLawTick'),
    heatPerLawTick: ratioOf('heatPerLawTick'),
    quantization: reference.oneCellShare,
  }
}

function sweptRatioTextOf(track: Track): string {
  const ratios = ratiosOf(track, readingOf(track, 'swept'))
  const verdict = `energy ${sweptVerdictOf(ratios.energyPerLawTick)}, heat ${sweptVerdictOf(ratios.heatPerLawTick)}`
  return `/ swept (logged, ${verdict}): ${JSON.stringify(ratios)}`
}

/** The capsule's own move on the row: a report every tick over the same report with the capsule off. */
function capsuleMoveTextOf(track: Track): string {
  const ratios = ratiosOf(track, readingOf(track, 'every tick, disc'))
  return `capsule / disc (logged): law work per metre ${ratios.lawWorkPerMetre}, cells per metre ${ratios.cellsPerMetre}`
}

/**
 * The carve-geometry misses against the swept cut of a report every tick as it ships and of main's
 * 12-tick disc (the ratchet's reference), to the thousandth.
 */
function geometryMissesAtBothCadences(track: Track) {
  const swept = readingOf(track, 'swept')
  const missesAt = (path: TrackPath) =>
    thousandthsMissesOf(geometryMissesOf(readingOf(track, path), swept))
  const misses = { everyTick: missesAt('every tick'), every12: missesAt('every 12') }
  console.log(`${nameOf(track)} geometry misses: ${JSON.stringify(misses)}`)
  return misses
}

function thousandthsMissesOf(misses: GeometryMisses): GeometryMisses {
  return {
    lawWorkPerMetre: thousandthsOf(misses.lawWorkPerMetre),
    cellsPerMetre: thousandthsOf(misses.cellsPerMetre),
  }
}

/** #537's bars on one row: the floor against the 5 m/s rig (gated), parity against swept (printed). */
function landingBarMissesOf(track: Track) {
  const everyTick = readingOf(track, 'every tick')
  const floor = thousandthsMissesOf(
    geometryMissesAgainst(inCellTimes(everyTick), floorReadingOf(track), CARVE_GEOMETRY_BARS.floor),
  )
  const parity = thousandthsMissesOf(
    geometryMissesAgainst(everyTick, readingOf(track, 'swept'), CARVE_GEOMETRY_BARS.parity),
  )
  return { floor, parity }
}

function landingBarTextOf(track: Track): string {
  const floor = ratiosBetween(inCellTimes(readingOf(track, 'every tick')), floorReadingOf(track))
  const swept = ratiosOf(track, readingOf(track, 'swept'))
  const { parity } = landingBarMissesOf(track)
  const parityVerdict = parity.lawWorkPerMetre === 0 ? 'inside' : 'amber'
  return (
    `${nameOf(track)} / 5 m/s rig (gated): law work per metre ${floor.lawWorkPerMetre}, cells per metre ${floor.cellsPerMetre}` +
    `; / swept (printed, ${parityVerdict}): law work per metre ${swept.lawWorkPerMetre}, cells per metre ${swept.cellsPerMetre}` +
    `; misses ${JSON.stringify(landingBarMissesOf(track))}`
  )
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
      console.log(
        `${message}\n${nameOf(track)} ${sweptRatioTextOf(track)}\n${nameOf(track)} ${capsuleMoveTextOf(track)}`,
      )
      if (!bars.isMeasurable) return
      expect(isWithinLawShare(bars.energyRatio), message).toBe(true)
      expect(isUnderTankFloor(bars.energyRatio), message).toBe(true)
      expect(isUnderRatchet(bars.energyRatio), message).toBe(true)
      expect(isHeatAtLaw(bars), message).toBe(true)
    })

    if (!hasTwelveTickReport(track)) continue
    it(`misses the carve-geometry bars by no more than main's 12-tick reports, ${nameOf(track)}`, () => {
      const { everyTick, every12 } = geometryMissesAtBothCadences(track)
      expect(everyTick.lawWorkPerMetre).toBeLessThanOrEqual(every12.lawWorkPerMetre)
      expect(everyTick.cellsPerMetre).toBeLessThanOrEqual(every12.cellsPerMetre)
    })
  }

  for (const track of landingTracksOf()) {
    it(`does at least the 5 m/s rig's law work per metre, within 5% of its cells per metre, or is a named deviation under #545, ${nameOf(track)} (#537 bars 1 and 3)`, () => {
      const message = landingBarTextOf(track)
      const { floor } = landingBarMissesOf(track)
      const verdict = carveGeometryVerdictOf(nameOf(track), floor, readTicketFile)
      console.log([message, ...verdict.knownRed].join('\n'))
      expect(verdict.failures, message).toEqual([])
    })
  }
})

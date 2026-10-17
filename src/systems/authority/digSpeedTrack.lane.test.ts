import { mkdirSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { trackTicksOf, type Track, type TrackSection, type TrackTilt } from './digSpeedTrackFrame'
import { cutTrack, drillPowerFor, type TrackPath } from './digSpeedTrackFixtures'
import { barVerdictsOf, lawReadingOf, thousandthsOf, type LawReading } from './lawWorkFixtures'

// The dig-speed STOP of #514 (Done-when 3) at the Vertical Scaler's speeds, 25, 44, 240 and 3600
// m/s, flat and tilted, level and down (VS 6226431087 and 6226528512, the TD's v2 ruling
// 6226459471): the live loop holds the body to 18 m/s, so these rows replay a fixed pose track
// through the authority (`digSpeedTrackFixtures.ts`), each path cutting the same track on the same
// ground from a fresh rig whose law speed is the track's; law work per metre and cells per metre are read over a fixed
// stretch of the track, past the swept cut's 60 m lead, the bars per unit of law work over all it
// cut. The bars are the loop lane's (`physics/digSpeedStop.lane.test.ts`):
// the flag-off report every tick against the swept cut, law work read from the ground. The 12-tick
// cadence is logged where the track lasts a report. At 3600 m/s the body crosses the track in two
// ticks and a flag-off report stamps its pose only, never the span between (the parked bore-bar
// wiring, TD v2 Q5), so that row reads what the report path does there. A lane: it runs only when
// named, prints the table and writes balance-report/dig-speed-track.ndjson.

const SPEEDS_MPS = [25, 44, 240, 3600]
const TILTS: readonly TrackTilt[] = ['flat', 'tilted']
const SECTIONS: readonly TrackSection[] = ['level', 'down']
const PATHS: readonly TrackPath[] = ['swept', 'every tick', 'every 12']
const REPORT_EVERY = 12
const REPORT_FOLDER = new URL('../../../balance-report/', import.meta.url)

interface TrackReading extends LawReading {
  speedMps: number
  tilt: TrackTilt
  section: TrackSection
  path: TrackPath
  drillPower: number
  metres: number
}

const readings: TrackReading[] = []

afterAll(() => {
  console.log(formatTable(readings))
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
  return PATHS.filter((path) => path !== 'every 12' || trackTicksOf(track) >= REPORT_EVERY)
}

/** The bars per unit of law work read over all the track cut; per metre, over its stretch. */
function readTrack(track: Track, path: TrackPath): TrackReading {
  const drillPower = drillPowerFor(track)
  const run = cutTrack(track, path, drillPower)
  const perMetre = lawReadingOf({ ...run, ...run.stretch })
  return {
    ...track,
    path,
    drillPower,
    metres: thousandthsOf(run.metres),
    ...lawReadingOf(run),
    lawWorkPerMetre: perMetre.lawWorkPerMetre,
    cellsPerMetre: perMetre.cellsPerMetre,
    oneCellShare: perMetre.oneCellShare,
  }
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
  const found = readings.find((row) => nameOf(row) === nameOf(track) && row.path === path)
  if (found === undefined) throw new Error(`no ${nameOf(track)} ${path} track was cut`)
  return found
}

function verdictsOf(track: Track) {
  const everyTick = readingOf(track, 'every tick')
  const swept = readingOf(track, 'swept')
  const ratios = {
    lawWorkPerMetre: thousandthsOf(everyTick.lawWorkPerMetre / swept.lawWorkPerMetre),
    lawTicksPerCellOverD: thousandthsOf(everyTick.lawTicksPerCell / everyTick.ownLawTicksPerCell),
    cellsPerMetre: thousandthsOf(everyTick.cellsPerMetre / swept.cellsPerMetre),
    energyPerLawTick: thousandthsOf(everyTick.energyPerLawTick / swept.energyPerLawTick),
    heatPerLawTick: thousandthsOf(everyTick.heatPerLawTick / swept.heatPerLawTick),
    quantization: swept.oneCellShare,
  }
  return { verdicts: barVerdictsOf(everyTick, swept), message: JSON.stringify(ratios) }
}

describe('dig speed of a report every tick on a fixed track, 25 to 3600 m/s (#514 STOP)', () => {
  for (const track of tracksOf()) {
    it(`cuts the ${nameOf(track)} track on every path with no rejection`, () => {
      const cut = pathsOf(track).map((path) => readTrack(track, path))
      readings.push(...cut)
      expect(cut.every((reading) => reading.metres > 0)).toBe(true)
    })

    it(`holds the four bars against the swept cut, ${nameOf(track)}`, () => {
      const { verdicts, message } = verdictsOf(track)
      expect(verdicts, message).toEqual({
        lawWorkPerMetre: true,
        digTimePerCell: true,
        cellsPerMetre: true,
        energyPerLawWork: true,
        heatPerLawWork: true,
      })
    })
  }
})

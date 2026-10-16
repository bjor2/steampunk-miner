import { describe, expect, it } from 'vitest'
import { POSE_REPORT_INTERVAL_TICKS } from '../constants/balance'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../constants/physics'
import type { AuthorityCommand, CommandIntent } from '../systems/authority/authorityCommand'
import { startLevels } from '../systems/economy/vehicleStats'
import { expandCommandLog } from './commandLog'
import {
  cutEventsOf,
  HOUR_TICKS,
  playLoggedHour,
  sendCommand,
  stopCut,
  type LoggedHour,
  type LogBytes,
} from './drillHourLog'
import { recordedTrackLines } from './fixtures/poseTracks/recordedPoseTracks'
import { bandOneCellsPerSecond } from './planetOneDrillPace'

// The log budget (#123), as the TD set it on #514 for a pose report every tick while the drill
// bites (ticket 522, replacing ticket 420's single 6 MB continuous line), three separate lines:
// - drilling rate: at most 8 KB a second of commands while drilling (the Vertical Scaler's ceiling);
// - a typical hour, the pacing bot's P1-P2 duty (46% drilling, 46% travelling, 8% at rest, 3 seeds
//   on main): at most 6 MB of events and commands;
// - an hour of continuous drilling: at most 8 MB of events and commands.
// MB and KB are 10^6 and 10^3 bytes. Each is held by the swept path (a `drillStep` every tick, a pose
// at 5 Hz) at 1x, 10x and 100x the planet 1 band-1 speed, and by the report-every-tick path, whose
// poses are the recorded stored-1 drilling track (the real vehicle loop's per-tick jitter) re-stamped
// a tick apart. Ticket 420's flatness line stays: the swept path's bytes do not grow with dig speed.

const KB = 1000
const MB = 1000 * KB
const DRILLING_COMMAND_BYTES_PER_SECOND = 8 * KB
const TYPICAL_HOUR_BYTES = 6 * MB
const CONTINUOUS_HOUR_BYTES = 8 * MB
const HOUR_SECONDS = HOUR_TICKS / TICKS_PER_SECOND
const BAND_ONE_SPEED = bandOneCellsPerSecond(startLevels())
const BAND_ONE_METRES_PER_TICK = BAND_ONE_SPEED / TICKS_PER_SECOND
const DOWN = { x: 0, y: -1 } as const
const START = { x: 30_500, y: 261_500 }

/** The bot's P1-P2 duty (the TD's measurement on #514), as ticks of a 100 s trip. */
const TRIP_TICKS = 100 * TICKS_PER_SECOND
const DRILLING_TICKS_OF_TRIP = 46 * TICKS_PER_SECOND
const TRAVEL_TICKS_OF_TRIP = 46 * TICKS_PER_SECOND

type LoggedHourBytes = LogBytes & { cells: number }

const RECORDED_POSES = expandCommandLog(recordedTrackLines('stored-1-interval-1-down')).filter(
  (command): command is AuthorityCommand<'reportPose'> => command.type === 'reportPose',
)
const FIRST_DRILLING = RECORDED_POSES.findIndex((pose) => pose.payload.drilling)
const TRAVEL_POSES = RECORDED_POSES.slice(0, FIRST_DRILLING).map(intentOf)
const DRILLING_POSES = RECORDED_POSES.slice(FIRST_DRILLING)
  .filter((pose) => pose.payload.drilling)
  .map(intentOf)

function intentOf({ type, payload }: AuthorityCommand<'reportPose'>): CommandIntent {
  return { type, payload }
}

/** An hour of swept drilling at `speed` times band 1's start speed. */
function drillSweptForAnHour(speed: number): Promise<LoggedHourBytes> {
  const metresPerTick = speed * BAND_ONE_METRES_PER_TICK
  let yMm = START.y
  return playLoggedHour((hour) => {
    yMm -= Math.round(metresPerTick * MM_PER_METRE)
    if (hour.tick % POSE_REPORT_INTERVAL_TICKS === 0) sendCommand(hour, sweptPoseOf(yMm), [])
    const payload = { x: START.x, y: yMm, facing: 2, drive: DOWN }
    sendCommand(hour, { type: 'drillStep', payload }, cutEventsOf(hour, metresPerTick))
  })
}

function sweptPoseOf(yMm: number): CommandIntent {
  return {
    type: 'reportPose',
    payload: {
      ...{ x: START.x, y: yMm, vx: 0, vy: -1500, upx: 0, upy: 1024, facing: 2 },
      ...{ driving: false, thrusting: false, drilling: true },
      ...{ thrustTicks: 0, driveTicks: 0, drillTicks: POSE_REPORT_INTERVAL_TICKS },
      drive: DOWN,
    },
  }
}

/** An hour of drilling at band 1's start speed with a pose report every tick. */
function drillReportingEveryTickForAnHour(): Promise<LoggedHourBytes> {
  let reports = 0
  return playLoggedHour((hour) => sendDrillingReport(hour, reports++))
}

/** The `index`th drilling report, with the cut it makes; the recorded track loops. */
function sendDrillingReport(hour: LoggedHour, index: number): void {
  const pose = DRILLING_POSES[index % DRILLING_POSES.length]
  sendCommand(hour, pose, cutEventsOf(hour, BAND_ONE_METRES_PER_TICK))
}

/** A typical hour: trips of drilling (a report every tick), travel (every 12) and rest. */
function playATypicalHour(): Promise<LoggedHourBytes> {
  const counts = { drilling: 0, travel: 0 }
  return playLoggedHour((hour) => {
    const tickOfTrip = hour.tick % TRIP_TICKS
    if (tickOfTrip < DRILLING_TICKS_OF_TRIP) return sendDrillingReport(hour, counts.drilling++)
    if (tickOfTrip === DRILLING_TICKS_OF_TRIP) stopCut(hour)
    if (tickOfTrip < DRILLING_TICKS_OF_TRIP + TRAVEL_TICKS_OF_TRIP) {
      sendTravelReportOnItsTick(hour, counts)
    }
    recordOtherEventsOnTheSecond(hour)
  })
}

function sendTravelReportOnItsTick(hour: LoggedHour, counts: { travel: number }): void {
  if (hour.tick % POSE_REPORT_INTERVAL_TICKS !== 0) return
  sendCommand(hour, TRAVEL_POSES[counts.travel++ % TRAVEL_POSES.length], [])
}

/**
 * A line a second off the drill, the stand-in for the bot's other events (165 B/s off the drill in
 * the TD's measurement on #514, its upgrade purchases left out as a player buys far fewer).
 */
function recordOtherEventsOnTheSecond(hour: LoggedHour): void {
  if (hour.tick % TICKS_PER_SECOND !== 0) return
  const stamp = { playerId: 'p1', planet: 1, depthTiles: 40, tick: hour.tick }
  hour.runLog.record(stamp, 'state_digest', { digest: '9f3c61d2a8b04e17', scope: 'periodic' })
}

function megabytes(bytes: number): string {
  return (bytes / MB).toFixed(2)
}

function totalOf({ events, commands }: LogBytes): number {
  return events + commands
}

const SPEEDS = [1, 10, 100]
let sweptHours: Promise<LoggedHourBytes[]> | null = null
let everyTickHour: Promise<LoggedHourBytes> | null = null
let typicalHour: Promise<LoggedHourBytes> | null = null

/** The swept hours, drilled once and shared by the specs. */
function drillSweptAtEverySpeed() {
  sweptHours ??= SPEEDS.reduce(
    async (done, speed) => [...(await done), await drillSweptForAnHour(speed)],
    Promise.resolve([] as LoggedHourBytes[]),
  )
  return sweptHours
}

/** Every continuous drilling hour, labelled: the swept ones, then the report-every-tick one. */
async function continuousHours(): Promise<[string, LoggedHourBytes][]> {
  everyTickHour ??= drillReportingEveryTickForAnHour()
  const swept = await drillSweptAtEverySpeed()
  return [
    ...swept.map((hour, index) => [`swept ${SPEEDS[index]}x`, hour] as [string, LoggedHourBytes]),
    ['report every tick', await everyTickHour],
  ]
}

describe('run log bytes flat in dig speed (ticket 420)', () => {
  it('writes events and commands within 5% of each other at 1x, 10x and 100x the band-1 speed', async () => {
    const hours = await drillSweptAtEverySpeed()
    const totals = hours.map(totalOf)
    for (const [index, hour] of hours.entries()) {
      console.log(
        `${SPEEDS[index]}x: ${megabytes(hour.events)} MB events, ${megabytes(hour.commands)} MB ` +
          `commands, ${hour.cells} cells, ${(totals[index] / hour.cells).toFixed(1)} bytes a cell`,
      )
    }
    expect(hours[2].cells).toBeGreaterThan(hours[0].cells * 90)
    expect(Math.max(...totals) / Math.min(...totals)).toBeLessThanOrEqual(1.05)
  }, 600_000)
})

describe('run log budget with a pose report every tick while drilling (ticket 522)', () => {
  it('writes at most 8 KB of commands a second while drilling', async () => {
    for (const [label, hour] of await continuousHours()) {
      const perSecond = hour.commands / HOUR_SECONDS
      console.log(`${label}: ${(perSecond / KB).toFixed(2)} KB/s of commands while drilling`)
      expect(perSecond).toBeLessThanOrEqual(DRILLING_COMMAND_BYTES_PER_SECOND)
    }
  }, 600_000)

  it("writes at most 6 MB in a typical hour at the pacing bot's P1-P2 duty", async () => {
    typicalHour ??= playATypicalHour()
    const hour = await typicalHour
    console.log(
      `typical hour: ${megabytes(totalOf(hour))} MB (${megabytes(hour.events)} events, ` +
        `${megabytes(hour.commands)} commands)`,
    )
    expect(totalOf(hour)).toBeLessThanOrEqual(TYPICAL_HOUR_BYTES)
  }, 600_000)

  it('writes at most 8 MB in an hour of continuous drilling', async () => {
    for (const [label, hour] of await continuousHours()) {
      console.log(`${label}: ${megabytes(totalOf(hour))} MB in a continuous drilling hour`)
      expect(totalOf(hour)).toBeLessThanOrEqual(CONTINUOUS_HOUR_BYTES)
    }
  }, 600_000)
})

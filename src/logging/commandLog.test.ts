import { describe, expect, it } from 'vitest'
import type { AuthorityCommand, CommandPayloads } from '../systems/authority/authorityCommand'
import type { DriveSigns } from '../systems/vehicle/driveSigns'
import {
  createCommandLogWriter,
  expandCommandLog,
  loggedCommandsOf,
  type LoggedCommand,
} from './commandLog'
import { recordedTrackLines } from './fixtures/poseTracks/recordedPoseTracks'
import { formatNdjsonLine } from './ndjson'

let nextSeq = 0

function poseOf(playerId: string, tick: number, drive: DriveSigns): AuthorityCommand {
  return {
    playerId,
    tick,
    seq: nextSeq++,
    type: 'reportPose',
    payload: {
      ...{ x: 1200, y: -3400, vx: 0, vy: -250, upx: 0, upy: 1024, facing: 1 },
      ...{ driving: drive.x !== 0, thrusting: drive.y > 0, drilling: drive.y < 0 },
      ...{ thrustTicks: 0, driveTicks: 12, drillTicks: 0 },
      drive,
    },
  }
}

function rescueOf(playerId: string, tick: number): AuthorityCommand {
  return { playerId, tick, seq: nextSeq++, type: 'requestRescue', payload: {} }
}

const DOWN = { x: 0, y: -1 } as const
const RIGHT = { x: 1, y: 0 } as const

function loggedDrivesOf(commands: readonly AuthorityCommand[]): (DriveSigns | undefined)[] {
  return loggedCommandsOf(commands).flatMap((command) =>
    command.type === 'reportPose' ? [command.payload.drive] : [],
  )
}

describe('command log: pose drive (ticket 342)', () => {
  it('writes drive on a pose line only when it changed since the player last logged one', () => {
    const commands = [poseOf('p1', 12, DOWN), poseOf('p1', 24, DOWN), poseOf('p1', 36, RIGHT)]
    expect(loggedDrivesOf(commands)).toEqual([DOWN, undefined, RIGHT])
  })

  it("keeps each player's drive apart", () => {
    const commands = [poseOf('p1', 12, DOWN), poseOf('p2', 12, DOWN), poseOf('p2', 24, DOWN)]
    expect(loggedDrivesOf(commands)).toEqual([DOWN, DOWN, undefined])
  })

  it('writes drive again on the first report after a rescue', () => {
    const commands = [poseOf('p1', 12, DOWN), rescueOf('p1', 20), poseOf('p1', 24, DOWN)]
    expect(loggedDrivesOf(commands)).toEqual([DOWN, DOWN])
  })

  it('expands the logged commands back to exactly the submitted ones', () => {
    const commands = [
      poseOf('p1', 12, DOWN),
      poseOf('p2', 12, RIGHT),
      poseOf('p1', 24, DOWN),
      rescueOf('p1', 30),
      poseOf('p1', 36, DOWN),
      poseOf('p2', 36, RIGHT),
      poseOf('p1', 48, RIGHT),
    ]
    expect(expandCommandLog(loggedCommandsOf(commands))).toEqual(commands)
  })

  it('round-trips through NDJSON text, as the file is written and read back', () => {
    const commands = [poseOf('p1', 12, DOWN), poseOf('p1', 24, DOWN), poseOf('p1', 36, RIGHT)]
    const text = loggedCommandsOf(commands).map(formatNdjsonLine).join('')
    const read = text
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as AuthorityCommand)
    expect(expandCommandLog(read)).toEqual(commands)
  })

  it('writes the same lines one command at a time as for the whole list', () => {
    const commands = [
      poseOf('p1', 12, DOWN),
      ...drillTilesDown(5, 20),
      poseOf('p1', 24, DOWN),
      rescueOf('p1', 30),
    ]
    const writer = createCommandLogWriter()
    const lines = [...commands.flatMap(writer.writeCommand), ...writer.flush()]
    expect(lines).toEqual(loggedCommandsOf(commands))
  })

  it('leaves the submitted command untouched', () => {
    const commands = [poseOf('p1', 12, DOWN), poseOf('p1', 24, DOWN), ...drillTilesDown(3, 30)]
    const before = structuredClone(commands)
    loggedCommandsOf(commands)
    expect(commands).toEqual(before)
  })

  it('writes the recorded per-tick drilling reports in under a fifth of their schema 6 bytes (ticket 522)', () => {
    const schemaSix = recordedTrackLines('stored-1-interval-1-down')
    const poseBytesOf = (lines: readonly LoggedCommand[]) =>
      lines
        .filter((line) => line.type === 'reportPose')
        .map(formatNdjsonLine)
        .join('').length
    const before = poseBytesOf(schemaSix)
    const after = poseBytesOf(loggedCommandsOf(expandCommandLog(schemaSix)))
    console.log(
      `stored-1 track: ${(before / 3097).toFixed(1)} -> ${(after / 3097).toFixed(1)} B a report`,
    )
    expect(after).toBeLessThan(before / 5)
  })

  it('refuses a pose line with fields left out and nothing to carry forward', () => {
    const [first, second] = loggedCommandsOf([poseOf('p1', 12, DOWN), poseOf('p1', 24, DOWN)])
    expect(() => expandCommandLog([second])).toThrow(/no earlier one to carry forward/)
    expect(() => expandCommandLog([first, rescueOf('p1', 20), second])).toThrow(/has no x, y/)
  })
})

/** `count` drill commands down one column, 60 ticks each, as the pacing bot bores. */
function drillTilesDown(count: number, fromTick: number): AuthorityCommand[] {
  return Array.from({ length: count }, (_, index) => ({
    playerId: 'p1',
    tick: fromTick + 60 * index,
    seq: nextSeq++,
    type: 'drillTile',
    payload: { tx: 4, ty: 270 - index, ticks: 60 },
  }))
}

/** A swept drill step a tick from `fromY`, `stepMm` further down each tick. */
function drillStepsDown(
  count: number,
  fromTick: number,
  stepMm: number,
  fromY = 261_500,
): AuthorityCommand[] {
  return Array.from({ length: count }, (_, index) => ({
    playerId: 'p1',
    tick: fromTick + index,
    seq: nextSeq++,
    type: 'drillStep',
    payload: { x: 30_500, y: fromY - stepMm * index, facing: 2, drive: DOWN },
  }))
}

function poseWith(tick: number, changes: Partial<CommandPayloads['reportPose']>): AuthorityCommand {
  const pose = poseOf('p1', tick, DOWN) as AuthorityCommand<'reportPose'>
  return { ...pose, payload: { ...pose.payload, ...changes } }
}

describe('command log: compact lines (ticket 420)', () => {
  it("leaves out every pose field equal to the player's previous report", () => {
    const moved = poseWith(24, { y: -3500, driveTicks: 4 })
    const lines = loggedCommandsOf([poseOf('p1', 12, DOWN), poseOf('p1', 18, DOWN), moved])
    expect(lines.map((line) => line.payload)).toEqual([
      poseOf('p1', 12, DOWN).payload,
      {},
      { y: -3500, driveTicks: 4 },
    ])
  })

  it('writes a run of drill tiles down a column as one line with its count and step', () => {
    const commands = drillTilesDown(5, 100)
    const [line, ...rest] = loggedCommandsOf(commands)
    expect(rest).toEqual([])
    expect(line).toEqual({
      ...commands[0],
      run: { count: 5, tick: 60, payload: { tx: 0, ty: -1 } },
    })
    expect(expandCommandLog([line])).toEqual(commands)
  })

  it('writes swept drill steps of a constant step as one line, and starts a new run where it changes', () => {
    const steady = drillStepsDown(120, 10, 400)
    const faster = drillStepsDown(30, 130, 800, 261_500 - 400 * 119 - 800)
    const lines = loggedCommandsOf([...steady, ...faster])
    expect(lines.map((line) => ('run' in line ? line.run.count : 1))).toEqual([120, 30])
    expect(expandCommandLog(lines)).toEqual([...steady, ...faster])
  })

  it("ends a run at any command but the player's pose, and keeps a lone drill command as it was", () => {
    const [first, second] = drillTilesDown(2, 100)
    const rescue = rescueOf('p1', 130)
    const commands = [first, rescue, second]
    expect(loggedCommandsOf(commands)).toEqual([first, rescue, second])
    expect(expandCommandLog(loggedCommandsOf(commands))).toEqual(commands)
  })

  it("keeps a run going across the player's pose reports, which follow its line and expand back in order", () => {
    const drills = drillTilesDown(4, 100)
    const commands = drills
      .flatMap((drill) => [poseOf('p1', drill.tick, DOWN), drill])
      .map((command) => ({ ...command, seq: nextSeq++ }))
    const lines = loggedCommandsOf(commands)
    expect(lines.map((line) => line.type)).toEqual([
      'reportPose',
      'drillTile',
      'reportPose',
      'reportPose',
      'reportPose',
    ])
    expect(lines[1]).toMatchObject({ run: { count: 4, poses: 3 } })
    expect(expandCommandLog(lines)).toEqual(commands)
  })

  it('expands a mixed log of poses, runs and rescues back to exactly the submitted commands', () => {
    const commands = [
      poseOf('p1', 12, DOWN),
      ...drillTilesDown(7, 20),
      poseOf('p1', 440, RIGHT),
      ...drillStepsDown(50, 441, 125),
      rescueOf('p1', 500),
      poseOf('p1', 512, RIGHT),
      poseOf('p2', 512, DOWN),
      ...drillTilesDown(1, 520),
    ]
    const text = loggedCommandsOf(commands).map(formatNdjsonLine).join('')
    const read = text
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as LoggedCommand)
    expect(expandCommandLog(read)).toEqual(commands)
  })
})

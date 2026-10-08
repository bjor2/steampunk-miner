import { describe, expect, it } from 'vitest'
import type { AuthorityCommand } from '../systems/authority/authorityCommand'
import type { DriveSigns } from '../systems/vehicle/driveSigns'
import { createCommandLogWriter, expandCommandLog, loggedCommandsOf } from './commandLog'
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

describe('command log (ticket 342)', () => {
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
    const commands = [poseOf('p1', 12, DOWN), poseOf('p1', 24, DOWN), rescueOf('p1', 30)]
    const writer = createCommandLogWriter()
    expect(commands.map(writer.toLoggedCommand)).toEqual(loggedCommandsOf(commands))
  })

  it('leaves the submitted command untouched', () => {
    const commands = [poseOf('p1', 12, DOWN), poseOf('p1', 24, DOWN)]
    const before = structuredClone(commands)
    loggedCommandsOf(commands)
    expect(commands).toEqual(before)
  })

  it('refuses a pose line with no drive and nothing to carry forward', () => {
    const [first, second] = loggedCommandsOf([poseOf('p1', 12, DOWN), poseOf('p1', 24, DOWN)])
    expect(() => expandCommandLog([second])).toThrow(/no drive/)
    expect(() => expandCommandLog([first, rescueOf('p1', 20), second])).toThrow(/no drive/)
  })
})

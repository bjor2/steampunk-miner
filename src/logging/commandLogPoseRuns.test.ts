import { describe, expect, it } from 'vitest'
import type { AuthorityCommand, CommandPayloads } from '../systems/authority/authorityCommand'
import { expandCommandLog, loggedCommandsOf, type LoggedCommand } from './commandLog'
import { RECORDED_POSE_TRACKS, recordedTrackLines } from './fixtures/poseTracks/recordedPoseTracks'
import { formatNdjsonLine } from './ndjson'

type PosePayload = CommandPayloads['reportPose']

const DRILLING: PosePayload = {
  ...{ x: 30_500, y: 261_500, vx: 40, vy: -1500, upx: 0, upy: 1024, facing: 2 },
  ...{ driving: false, thrusting: false, drilling: true },
  ...{ thrustTicks: 0, driveTicks: 0, drillTicks: 1 },
  drive: { x: 0, y: -1 },
}

/** `count` reports a tick apart from `fromTick`, sinking with a jittering speed, seqs from `fromSeq`. */
function drillingPoses(count: number, fromTick = 100, fromSeq = 10): AuthorityCommand[] {
  return Array.from({ length: count }, (_, index) => ({
    playerId: 'p1',
    tick: fromTick + index,
    seq: fromSeq + index,
    type: 'reportPose',
    payload: {
      ...DRILLING,
      y: DRILLING.y - 25 * index - (index % 3),
      vx: DRILLING.vx + ((index * 37) % 11),
      vy: DRILLING.vy - ((index * 53) % 400),
    },
  }))
}

function withPayload(command: AuthorityCommand, changes: Partial<PosePayload>): AuthorityCommand {
  const pose = command as AuthorityCommand<'reportPose'>
  return { ...pose, payload: { ...pose.payload, ...changes } }
}

function textOf(lines: readonly LoggedCommand[]): string {
  return lines.map(formatNdjsonLine).join('')
}

function linesOfText(text: string): LoggedCommand[] {
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as LoggedCommand)
}

/** A logged line's run of later reports, or 0 for a line of one report. */
function poseRunLengthOf(line: LoggedCommand): number {
  return 'poseRun' in line ? (line.poseRun?.length ?? 0) : 0
}

/** The track's commands every tick inside `[from, to)` and every 12th tick outside it, reseqd. */
function thinnedOutside(
  commands: readonly AuthorityCommand[],
  from: number,
  to: number,
): AuthorityCommand[] {
  const kept = commands.filter(
    (command) => (command.tick >= from && command.tick < to) || command.tick % 12 === 1,
  )
  return kept.map((command, index) => ({ ...command, seq: index + 1 }))
}

describe('command log: pose runs (ticket 522)', () => {
  it('writes reports a tick and a seq apart that only move as one line with a residual each', () => {
    const poses = drillingPoses(60)
    const lines = loggedCommandsOf(poses)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ tick: 100, seq: 10, payload: DRILLING })
    expect(poseRunLengthOf(lines[0])).toBe(59)
    expect(expandCommandLog(lines)).toEqual(poses)
  })

  it('stores each later report as four integers: position residual and velocity change', () => {
    const [line] = loggedCommandsOf(drillingPoses(4))
    const residuals = 'poseRun' in line ? line.poseRun : undefined
    expect(residuals).toHaveLength(3)
    for (const residual of residuals ?? []) {
      expect(residual).toHaveLength(4)
      expect(residual.every(Number.isSafeInteger)).toBe(true)
    }
  })

  it('ends the run at a report where another field changes and writes that report on its own line', () => {
    const poses = drillingPoses(30).map((pose, index) =>
      index < 12 ? pose : withPayload(pose, { upx: -3 }),
    )
    const lines = loggedCommandsOf(poses)
    expect(lines.map(poseRunLengthOf)).toEqual([11, 17])
    expect(lines[1]).toMatchObject({ tick: 112, payload: { upx: -3 } })
    expect(expandCommandLog(lines)).toEqual(poses)
  })

  it('ends the run at a tick or a seq gap, so reports 12 ticks apart stay a line each', () => {
    const poses = drillingPoses(6).map((pose, index) => ({ ...pose, tick: 100 + 12 * index }))
    const seqGap = drillingPoses(4).map((pose, index) => ({ ...pose, seq: 10 + 2 * index }))
    expect(loggedCommandsOf(poses).map(poseRunLengthOf)).toEqual([0, 0, 0, 0, 0, 0])
    expect(loggedCommandsOf(seqGap).map(poseRunLengthOf)).toEqual([0, 0, 0, 0])
    expect(expandCommandLog(loggedCommandsOf(poses))).toEqual(poses)
  })

  it('ends the run at any other command and at a rescue, and writes the next report in full after it', () => {
    const poses = drillingPoses(20)
    const rescue: AuthorityCommand = {
      ...{ playerId: 'p1', tick: 110, seq: 20, type: 'requestRescue' },
      payload: {},
    }
    const commands = [...poses.slice(0, 10), rescue, ...drillingPoses(10, 111, 21)]
    const lines = loggedCommandsOf(commands)
    expect(lines.map((line) => line.type)).toEqual(['reportPose', 'requestRescue', 'reportPose'])
    expect(lines[2].payload).toEqual(DRILLING)
    expect(expandCommandLog(lines)).toEqual(commands)
  })

  it('keeps a report with motion that is not a safe integer, and the one after it, out of runs', () => {
    const poses = drillingPoses(3)
    poses[1] = withPayload(poses[1], { y: 261_475.5 })
    const lines = loggedCommandsOf(poses)
    expect(lines.map(poseRunLengthOf)).toEqual([0, 0, 0])
    expect(expandCommandLog(linesOfText(textOf(lines)))).toEqual(poses)
  })

  it("keeps each player's runs apart: another player's report ends the run", () => {
    const own = drillingPoses(3)
    const other = { ...own[1], playerId: 'p2', seq: 99 }
    const commands = [own[0], own[1], other, own[2]]
    expect(loggedCommandsOf(commands).map(poseRunLengthOf)).toEqual([1, 0, 0])
    expect(expandCommandLog(loggedCommandsOf(commands))).toEqual(commands)
  })
})

describe('command log: recorded pose tracks (ticket 522)', () => {
  it.each(RECORDED_POSE_TRACKS)(
    'reads the schema 6 file of %s unchanged and round-trips it through pose runs exactly',
    (track) => {
      const commands = expandCommandLog(recordedTrackLines(track))
      const read = linesOfText(textOf(loggedCommandsOf(commands)))
      expect(expandCommandLog(read)).toEqual(commands)
      expect(textOf(loggedCommandsOf(expandCommandLog(read)))).toBe(textOf(read))
    },
  )

  it('holds 3097 reports on the stored-1 track, nearly all written inside runs', () => {
    const commands = expandCommandLog(recordedTrackLines('stored-1-interval-1-down'))
    const poseLines = loggedCommandsOf(commands).filter((line) => line.type === 'reportPose')
    const inRuns = poseLines.reduce((sum, line) => sum + poseRunLengthOf(line), 0)
    expect(commands.filter((command) => command.type === 'reportPose')).toHaveLength(3097)
    expect(poseLines.length + inRuns).toBe(3097)
    expect(inRuns / 3097).toBeGreaterThan(0.9)
  })

  it('writes the interval-12 track as the schema 6 writer did, since no two reports are a tick apart', () => {
    const lines = recordedTrackLines('stored-1-interval-12-down')
    expect(loggedCommandsOf(expandCommandLog(lines))).toEqual(lines)
  })

  it('round-trips a track that switches between a report every tick and every 12 ticks', () => {
    const commands = expandCommandLog(recordedTrackLines('stored-1-interval-1-down')).filter(
      (command) => command.type === 'reportPose',
    )
    const mixed = thinnedOutside(commands, 1200, 2400)
    const lines = loggedCommandsOf(mixed)
    expect(lines.some((line) => poseRunLengthOf(line) > 100)).toBe(true)
    expect(
      lines.filter((line) => line.tick < 1200).every((line) => poseRunLengthOf(line) === 0),
    ).toBe(true)
    expect(expandCommandLog(linesOfText(textOf(lines)))).toEqual(mixed)
  })
})

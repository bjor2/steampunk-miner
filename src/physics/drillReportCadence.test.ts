import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { DEV_FLAGS } from '../constants/devFlags'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { loggedCommandsOf } from '../logging/commandLog'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { takeSessionSnapshot } from '../store/gameStore'
import type { AuthorityCommand } from '../systems/authority/authorityCommand'
import { buildIntent } from '../systems/input/buildIntent'
import { createRig } from './cutFollowFixtures'

// The flag-off drill at a pose report every tick while it bites (#514 scope 4 and Done-when 4):
// the scheduler reads the fixed tick, never the frame clock, so the same dig played under render
// frames at 30, 60 and 144 a second sends the same commands, ends on the same authority digest
// and leaves the body in the same place; the authority refuses none of its reports; and its
// `commands.ndjson`, run-coded as the run log writes it (#522), stays under the Vertical Scaler's
// 8 KB a second while drilling (TD 6224892444 on #514).

const FRAME_RATES = [30, 60, 144]
const DRILLING_SECONDS = 8
const COMMAND_BYTES_PER_SECOND_MAX = 8 * 1024
const RIG = { drill_power: 50, drill_tip: 600, engine: 5000 }

let sink: MemorySink

beforeAll(async () => {
  await RAPIER.init()
})

afterEach(() => uninstallRunLog())

/** Off the pad, 4 s down and 4 s west, flag off at the shipped cadence, under `framesPerSecond`. */
function digAt(framesPerSecond: number) {
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  const rig = createRig(RAPIER, RIG, framesPerSecond, DEV_FLAGS)
  const ticksOf = (seconds: number) => Math.round(seconds / PHYSICS_TIMESTEP)
  rig.hold(buildIntent(['aim_left']), ticksOf(2))
  const offPad = sink.commands.length
  rig.hold(buildIntent(['aim_down']), ticksOf(DRILLING_SECONDS / 2))
  const [last] = rig.hold(buildIntent(['aim_left']), ticksOf(DRILLING_SECONDS / 2)).slice(-1)
  return {
    drillingBytes: commandLogBytesOf(sink.commands.slice(offPad)),
    commands: JSON.stringify(sink.commands),
    reports: sink.commands.filter((command) => command.type === 'reportPose').length,
    digest: takeSessionSnapshot().digest,
    position: last.position,
    rejected: sink.events.filter((event) => event.event === 'command_rejected'),
  }
}

function commandLogBytesOf(commands: readonly AuthorityCommand[]): number {
  return loggedCommandsOf(commands).reduce((sum, line) => sum + JSON.stringify(line).length + 1, 0)
}

describe('the flag-off drill at a report every tick (#514)', () => {
  it('sends the same commands, digest and position at 30, 60 and 144 frames a second', () => {
    const [first, ...others] = FRAME_RATES.map(digAt)
    expect(first.reports).toBeGreaterThan(300)
    for (const other of others) {
      expect(other.commands).toBe(first.commands)
      expect(other.digest).toBe(first.digest)
      expect(other.position).toEqual(first.position)
    }
  })

  it('has none of its reports refused', () => {
    expect(digAt(60).rejected).toEqual([])
  })

  it('logs at most 8 KB of commands a second while drilling', () => {
    const bytesPerSecond = digAt(60).drillingBytes / DRILLING_SECONDS
    console.log(`commands.ndjson while drilling: ${(bytesPerSecond / 1024).toFixed(2)} KB/s`)
    expect(bytesPerSecond).toBeLessThanOrEqual(COMMAND_BYTES_PER_SECOND_MAX)
  })
})

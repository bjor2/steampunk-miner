import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { readAuthorityState } from '../store/authorityLink'
import { resetGameStore } from '../store/gameStore'
import { NO_DRIVE } from '../systems/vehicle/driveSigns'
import { FACING, type VehiclePose } from '../systems/vehicle/vehiclePose'
import { createDebugApi } from './debugApi'

// The dynamite scenario API (ticket 860): a scenario mounts a rack, places a charge through the
// scripted fast-forward as play would, and the fuse blows it, logging the place, the detonation
// and the blast's disc record.

const FUSE_TICKS = 120

/** The vehicle as it rests in the teleport's pocket, its drill turned down onto the floor. */
function facingThePocketFloor(tick: number) {
  const { players } = readAuthorityState()
  const { x, y, upx, upy } = Object.values(players)[0].vehicle.pose as VehiclePose
  const payload = {
    ...{ x, y, upx, upy, vx: 0, vy: 0, facing: FACING.down, drive: NO_DRIVE },
    ...{ driving: false, thrusting: false, drilling: false },
    ...{ thrustTicks: 0, driveTicks: 0, drillTicks: 0 },
  }
  return { tick, type: 'reportPose', payload } as const
}

let sink: MemorySink

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

describe('debug api: place and detonate a charge (ticket 860)', () => {
  it('places a size-1 charge underground and detonates it on its fuse, logging its disc record', () => {
    const debug = createDebugApi()
    expect(debug.setCharges(2, 0, 1)).toEqual({ ok: true })
    expect(debug.teleportToDepthTiles(30)).toEqual({ ok: true })
    const at = readAuthorityState().tick + 1
    const plant = { tick: at, type: 'plantCharge', payload: { size: 1 } } as const
    expect(debug.fastForward(FUSE_TICKS + 5, [facingThePocketFloor(at), plant]).ok).toBe(true)
    const names = sink.events.map((event) => event.event)
    expect(names).toEqual(expect.arrayContaining(['charge_planted', 'charge_detonated', 'blast']))
    const blast = sink.events.find((event) => event.event === 'blast')
    expect(blast?.data).toMatchObject({
      size: 1,
      chargeType: 1,
      radiusLevel: 0,
      baseR2: '400',
      groundR2: '400',
      blastSeq: 0,
      casingLaid: false,
    })
    expect(readAuthorityState().blastSeq).toBe(1)
  })
})

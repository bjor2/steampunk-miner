import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { CommandIntent } from '../authority/authorityCommand'
import { createScriptedSession, FREEZE_ENEMIES } from '../authority/scriptedSession'
import { stateDigest } from '../authority/stateDigest'
import { FACING } from '../vehicle/vehiclePose'
import type { HeatPauseWindow } from './heatPauses'

// The heatPause seam through the authority (ticket 233, the GD lock on #204 Q2): a slice's flask
// window vents the gauge and halves heat gain at the kernel floor while the vehicle drills band 5
// of planet 8. Fake slices register through withRegistrations, so no real slice is imported.

/** Band-5 rock straight above planet 8's core, as in heatRun.test.ts. */
const BAND_5 = { x: 500, y: 40500 }
const REPORT_EVERY = 12
const FLASK: HeatPauseWindow = { fromTick: 300, untilTick: 480, ventBp: 6000, gainBp: 0 }
const LAST_TICK = 600

function flaskSlice(windows: readonly HeatPauseWindow[]): SliceDefinition {
  return {
    id: 'flask-probe',
    register: (r) => r.heatPause({ id: 'flask-probe.flask', pausesOf: () => windows }),
  }
}

function drillReport(drillTicks: number): CommandIntent {
  return {
    type: 'reportPose',
    payload: {
      ...BAND_5,
      vx: 0,
      vy: 0,
      upx: 0,
      upy: 1024,
      facing: FACING.down,
      driving: false,
      thrusting: false,
      drilling: drillTicks > 0,
      thrustTicks: 0,
      driveTicks: 0,
      drillTicks,
    },
  }
}

/** The gauge after each report while drilling band 5 from 40 points, with `slices` registered. */
function gaugeByTickWith(slices: readonly SliceDefinition[]) {
  return withRegistrations(slices, () => {
    const session = createScriptedSession()
    session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: 8 } })
    session.submit(0, FREEZE_ENEMIES)
    session.submit(0, drillReport(0))
    session.submit(0, { type: 'debug.setHeat', payload: { heat: 40 } })
    const gauge = new Map<number, number>()
    for (let tick = REPORT_EVERY; tick <= LAST_TICK; tick += REPORT_EVERY) {
      session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '150' } })
      session.submit(tick, drillReport(REPORT_EVERY))
      gauge.set(tick, session.vehicle().heat.level)
    }
    return { gauge, digest: stateDigest(session.state()) }
  })
}

const riseOf = (gauge: Map<number, number>, from: number, to: number) =>
  (gauge.get(to) as number) - (gauge.get(from) as number)

describe('heat pauses', () => {
  it('settles the gauge exactly as before with no window', () => {
    expect(gaugeByTickWith([flaskSlice([])])).toEqual(gaugeByTickWith([]))
  })

  it('leaves the gauge alone until the window opens', () => {
    const plain = gaugeByTickWith([]).gauge
    const flask = gaugeByTickWith([flaskSlice([FLASK])]).gauge
    expect(flask.get(FLASK.fromTick)).toBe(plain.get(FLASK.fromTick))
  })

  it('vents the gauge at the window start, never below half of it', () => {
    const plain = gaugeByTickWith([]).gauge
    const flask = gaugeByTickWith([flaskSlice([FLASK])]).gauge
    const atOpen = plain.get(FLASK.fromTick) as number
    const firstReport = FLASK.fromTick + REPORT_EVERY
    expect(flask.get(firstReport)).toBeGreaterThanOrEqual(Math.floor(atOpen / 2))
    expect(flask.get(firstReport)).toBeLessThan(Math.floor(atOpen / 2) + riseOf(plain, 300, 312))
  })

  it('lets half the heat gain land during the window and all of it after', () => {
    const plain = gaugeByTickWith([]).gauge
    const flask = gaugeByTickWith([flaskSlice([FLASK])]).gauge
    const windowRise = riseOf(flask, FLASK.fromTick + REPORT_EVERY, FLASK.untilTick)
    const plainWindowRise = riseOf(plain, FLASK.fromTick + REPORT_EVERY, FLASK.untilTick)
    expect(windowRise).toBeLessThan(plainWindowRise)
    expect(windowRise * 2).toBeGreaterThanOrEqual(plainWindowRise)
    expect(riseOf(flask, FLASK.untilTick, LAST_TICK)).toBe(
      riseOf(plain, FLASK.untilTick, LAST_TICK),
    )
  })
})

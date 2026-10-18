import { describe, expect, it } from 'vitest'
import { AUTHORITY_DEV_FLAGS, type DevFlags } from '../../constants/devFlags'
import { replayRun } from '../replay/replayRun'
import { drillReportIntervalOf } from '../vehicle/poseReport'
import { FACING } from '../vehicle/vehiclePose'
import { advanceTicks } from './advanceTicks'
import { applyCommand, type CommandOutcome } from './applyCommand'
import type { AuthorityCommand, CommandIntent } from './authorityCommand'
import type { VehicleState } from '../vehicle/vehicleState'
import { createAuthorityState, vehicleOf, type AuthorityState } from './authorityState'
import { CUT_ENERGY_DENOMINATOR } from '../vehicle/cutCarry'
import { cutEnergyNumeratorOf, lawWorkOfGroundChanges } from './cutCarryFixtures'
import { AUTHORITY_FLAG_IDS, flagsOf, type AuthorityFlagId } from './devFlagState'
import { isUnderTankFloor, lawChargeBarsOf } from './lawChargeBars'
import { FREEZE_ENEMIES, GROUND, poseAbove, WORLD_SEED } from './scriptedSession'
import { stateDigest } from './stateDigest'

// Flip safety (ticket 547, the TD ruling on #547 and its amendment): every authority flag flips
// off, on and off again at its own ticks while the rig drills down on the report path at the
// cadence the session's flags give. No step throws or writes a float; the carries a flag turned on
// consumes are gone the tick it lands; the tank ratio stays at or below the floor in every stretch
// between flips; and the command log replays digest-equal, jumping the clock or at 60 frames a
// second.

/** The report path: no swept cut, the every-tick cadence on, as the client loop runs it. */
const REPORT_PATH: DevFlags = { 'drill.sweptCut': false, 'drill.reportEveryTick': true }

/** Purchase 2 since #552 (31 mm a tick in band 1), the cut stored step 10 gave before it (28). */
const DRILL_POWER = {
  type: 'debug.setUpgrade',
  payload: { upgradeId: 'drill_power', level: 2 },
} as const

/** The rig's descent, in mm a tick: under the cut speed of drill power purchase 2 in band 1. */
const DESCENT_MM_PER_TICK = 20
const RUN_TICKS = 160

/** Each flag's off, on and off ticks, apart from every other flag's. */
const FLIP_TICKS: Readonly<Record<AuthorityFlagId, readonly number[]>> = {
  'enemy.lureRetarget': [9, 40, 101],
  'drill.exactCarry': [17, 63, 118],
  'drill.sweptLawCharge': [23, 71, 125],
  'drill.reportCapsule': [29, 52, 109],
  'heat.workUncapped': [34, 83, 132],
  'codex.materialContact': [46, 94, 141],
}

interface FlipRun {
  commands: AuthorityCommand[]
  /** The digest after every tick, as the live fixed step would take it. */
  digests: string[]
  /** The law-charge read of every stretch of reports between two flips. */
  stretches: { lawWork: number; energy: number }[]
  /** The report carries right after each flip that turned a carried flag on. */
  carriesAfterTurnOn: (number | undefined)[]
  intervals: number[]
  /** The ticks of the reports that removed ground. */
  cuttingReportTicks: number[]
  state: AuthorityState
}

function flipsAt(tick: number): Partial<Record<AuthorityFlagId, boolean>> {
  return Object.fromEntries(
    AUTHORITY_FLAG_IDS.filter((id) => FLIP_TICKS[id].includes(tick)).map((id) => [
      id,
      FLIP_TICKS[id].indexOf(tick) === 1,
    ]),
  )
}

/** The carries a flag turned on owns, as the vehicle holds them right after the flip. */
function carriesTurnedOn(
  flips: Partial<Record<AuthorityFlagId, boolean>>,
  vehicle: VehicleState,
): (number | undefined)[] {
  const turnedOn = AUTHORITY_FLAG_IDS.filter((id) => flips[id] === true)
  return turnedOn.flatMap((id) => {
    if (id === 'drill.exactCarry') return [vehicle.cutEnergyCarry, vehicle.cutHeatCarry]
    if (id === 'drill.sweptLawCharge') return [vehicle.cutEnergyCarry]
    if (id === 'heat.workUncapped') return [vehicle.cutHeatCarry]
    return []
  })
}

function descendingReport(tick: number, drillTicks: number): CommandIntent {
  const { payload } = poseAbove(GROUND, FACING.down, { drillTicks })
  return { type: 'reportPose', payload: { ...payload, y: payload.y - DESCENT_MM_PER_TICK * tick } }
}

function runFlips(): FlipRun {
  let outcome: CommandOutcome = {
    state: createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] }),
    events: [],
  }
  const run: Omit<FlipRun, 'state'> = {
    commands: [],
    digests: [],
    stretches: [{ lawWork: 0, energy: 0 }],
    carriesAfterTurnOn: [],
    intervals: [],
    cuttingReportTicks: [],
  }
  let seq = 0
  const submit = (tick: number, intent: CommandIntent) => {
    const command = { playerId: 'p1', tick, seq: ++seq, ...intent } as AuthorityCommand
    run.commands.push(command)
    outcome = applyCommand(outcome.state, command)
    return outcome.events
  }
  submit(0, FREEZE_ENEMIES)
  submit(0, DRILL_POWER)
  submit(0, poseAbove(GROUND, FACING.down))
  let lastReport = 0
  for (let tick = 1; tick <= RUN_TICKS; tick++) {
    outcome = advanceTicks(outcome.state, tick)
    const flips = flipsAt(tick)
    if (Object.keys(flips).length > 0) {
      submit(tick, { type: 'debug.setFlags', payload: { delta: flips } })
      run.stretches.push({ lawWork: 0, energy: 0 })
      run.carriesAfterTurnOn.push(...carriesTurnedOn(flips, vehicleOf(outcome.state, 'p1')))
    }
    const interval = drillReportIntervalOf(REPORT_PATH, flagsOf(outcome.state))
    run.intervals.push(interval)
    if (tick - lastReport >= interval) {
      const before = outcome.state
      const events = submit(tick, descendingReport(tick, tick - lastReport))
      const stretch = run.stretches[run.stretches.length - 1]
      const lawWork = lawWorkOfGroundChanges(before, outcome.state.world, events)
      if (lawWork > 0) run.cuttingReportTicks.push(tick)
      stretch.lawWork += lawWork
      stretch.energy += cutEnergyNumeratorOf(
        vehicleOf(before, 'p1'),
        vehicleOf(outcome.state, 'p1'),
      )
      lastReport = tick
    }
    run.digests.push(stateDigest(outcome.state))
  }
  return { ...run, state: outcome.state }
}

const FLIPPED = runFlips()

describe('authority dev flags flipped mid-drill (ticket 547)', () => {
  it('runs every tick through every flip without a throw, a float or a lost digest', () => {
    expect(FLIPPED.digests).toHaveLength(RUN_TICKS)
    expect(flagsOf(FLIPPED.state)).toEqual(
      Object.fromEntries(AUTHORITY_FLAG_IDS.map((id) => [id, false])),
    )
    expect(FLIPPED.state.devFlagsEverSet).toBe(true)
  })

  it('lands every flip mid-drill, between two reports that cut ground', () => {
    const cutting = FLIPPED.cuttingReportTicks
    const flipTicks = Object.values(FLIP_TICKS).flat()
    const isMidDrill = (tick: number) =>
      cutting.some((at) => at <= tick && tick - at <= 12) &&
      cutting.some((at) => at > tick && at - tick <= 12)
    expect(flipTicks.filter((tick) => !isMidDrill(tick))).toEqual([])
  })

  it('consumes no carry from before a flip that turns a carried flag on', () => {
    expect(FLIPPED.carriesAfterTurnOn.length).toBeGreaterThan(0)
    expect(FLIPPED.carriesAfterTurnOn.every((carry) => carry === undefined)).toBe(true)
  })

  it('keeps the energy at or below the tank floor of the law in every stretch between flips', () => {
    const cut = FLIPPED.stretches.filter((stretch) => stretch.lawWork > 0)
    const whole = cut.reduce((sum, stretch) => ({
      lawWork: sum.lawWork + stretch.lawWork,
      energy: sum.energy + stretch.energy,
    }))
    const ratioOf = ({ lawWork, energy }: { lawWork: number; energy: number }) =>
      lawChargeBarsOf({ lawWork, energy: energy / CUT_ENERGY_DENOMINATOR, heatTicks: 0 })
        .energyRatio
    expect(cut.map(ratioOf).every(isUnderTankFloor)).toBe(true)
    expect(isUnderTankFloor(ratioOf(whole))).toBe(true)
  })

  it('drops the report interval to 12 on the tick the exact carry goes off, never every tick', () => {
    const [off, on, offAgain] = FLIP_TICKS['drill.exactCarry']
    const intervalAt = (tick: number) => FLIPPED.intervals[tick - 1]
    expect(intervalAt(off - 1)).toBe(1)
    expect(intervalAt(off)).toBe(12)
    expect(intervalAt(on)).toBe(1)
    expect(intervalAt(offAgain)).toBe(12)
    expect(FLIPPED.intervals.slice(offAgain - 1).every((interval) => interval === 12)).toBe(true)
  })

  it('replays the command log digest-equal, jumping the clock and at 60 frames a second', () => {
    const end = stateDigest(FLIPPED.state)
    const jumped = replayRun(WORLD_SEED, FLIPPED.commands, { endTick: RUN_TICKS })
    const framed = replayRun(WORLD_SEED, FLIPPED.commands, {
      endTick: RUN_TICKS,
      framesPerSecond: 60,
    })
    expect(stateDigest(jumped.state)).toBe(end)
    expect(stateDigest(framed.state)).toBe(end)
  })

  it('ships every flag on, so the flips above start from the shipped defaults', () => {
    expect(Object.values(AUTHORITY_DEV_FLAGS).every((isOn) => isOn)).toBe(true)
  })
})

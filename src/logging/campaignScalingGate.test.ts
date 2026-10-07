import { describe, expect, it } from 'vitest'
import scheduleFile from '../../docs/scaling/horizontal/stats.json'
import { TICKS_PER_SECOND } from '../constants/physics'
import type { UnlockSchedule } from '../systems/unlocks/readUnlockSchedule'
import { LOCKED_SCHEDULE, LOCKED_SCHEDULE_SOURCE_HASH } from '../systems/unlocks/unlockSchedule'
import type { BandDig } from './bandDigReport'
import {
  campaignPacingFindings,
  campaignScalingProblems,
  type CampaignGateRun,
} from './campaignScalingGate'
import { derivePacingReport } from './pacingReport'
import { deriveSummary, type RunSummary } from './runSummary'

/**
 * The Horizontal Scaler's pin (#89 acceptance 4). The ticket names the #80 lock `sha256:419ca56d…`;
 * the schedule refreshes of #162 and #153 re-pinned it to this one.
 */
const SCALER_PIN = 'sha256:a420cb57bdc831be41eea490fe199873b567388c7159510acac920acd2814c8f'

/** The rows of M1-M5 (#92-#96), which the gate must not hold to anything (#90 scope review). */
const CONTENT_MODULE_ROW_IDS = [
  'refinery_bay',
  'auto_guns',
  'tunnel_wrecker',
  'blasting_charges',
  'heat_lava',
  'refractory_lining',
]

const LAST_PLANET = 8
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

/** Band 5 at departure in `ratio` of its arrival time on every planet before the last. */
function digsAtRatio(ratio: number): Record<string, BandDig> {
  const planets = Array.from({ length: LAST_PLANET - 1 }, (_, index) => String(index + 1))
  return Object.fromEntries(
    planets.map((planet) => [planet, { arrival: 100, departure: ratio * 100 }]),
  )
}

/** A test double of one seed's run: it reached `reached` planets and dug band 5 as given. */
function seedRun(
  worldSeed: number,
  digs: Record<string, BandDig>,
  reached = LAST_PLANET,
): CampaignGateRun {
  const planetReached = Object.fromEntries(
    Array.from({ length: reached }, (_, index) => [String(index + 1), index * 1000]),
  )
  const empty = deriveSummary([])
  const summary: RunSummary = {
    ...empty,
    sawtoothBandDigTicks: digs,
    milestones: { ...empty.milestones, planetReached },
  }
  return { worldSeed, summary, hasCompletedLastCore: reached === LAST_PLANET }
}

function healthyRuns(): CampaignGateRun[] {
  return [
    seedRun(1, digsAtRatio(0.6)),
    seedRun(2, digsAtRatio(0.55)),
    seedRun(3, digsAtRatio(0.65)),
  ]
}

function withoutRowsOn(schedule: UnlockSchedule, planets: readonly number[]): UnlockSchedule {
  return { ...schedule, rows: schedule.rows.filter((row) => !planets.includes(row.planetIndex)) }
}

function withContentModulesHeldBack(schedule: UnlockSchedule): UnlockSchedule {
  const rows = schedule.rows.map((row) =>
    CONTENT_MODULE_ROW_IDS.includes(row.id) ? { ...row, status: 'vision' as const } : row,
  )
  return { ...schedule, rows }
}

function reportWithCoreMinutes(minutesByPlanet: Record<string, number>) {
  const coreTicksOnPlanet = Object.fromEntries(
    Object.entries(minutesByPlanet).map(([planet, minutes]) => [
      planet,
      minutes * TICKS_PER_MINUTE,
    ]),
  )
  return { ...derivePacingReport([], 1), coreTicksOnPlanet }
}

describe('campaign scaling gate (R1 #89)', () => {
  it('passes seeds whose band 5 dug at least 30% faster on every planet left, on the locked schedule', () => {
    expect(campaignScalingProblems(healthyRuns(), LOCKED_SCHEDULE, LAST_PLANET)).toEqual([])
  })

  it('fails a test double whose median band 5 at departure is over 0.7x arrival', () => {
    const runs = [
      seedRun(1, digsAtRatio(0.6)),
      seedRun(2, digsAtRatio(0.8)),
      seedRun(3, digsAtRatio(0.75)),
    ]
    const problems = campaignScalingProblems(runs, LOCKED_SCHEDULE, LAST_PLANET)
    expect(problems).toHaveLength(LAST_PLANET - 1)
    expect(problems[0]).toBe('planet 1 band 5 median 0.75x, target at most 0.7x')
  })

  it('fails a test double of the schedule that leaves 3 campaign planets without a horizontal', () => {
    const schedule = withoutRowsOn(LOCKED_SCHEDULE, [15, 17])
    expect(campaignScalingProblems(healthyRuns(), schedule, LAST_PLANET)).toEqual([
      'the schedule leaves 3 campaign planets in a row without a horizontal row, at most 2',
    ])
  })

  it('fails a seed that stalled before the core of the last planet', () => {
    const runs = [...healthyRuns().slice(0, 2), seedRun(3, digsAtRatio(0.6), 6)]
    expect(campaignScalingProblems(runs, LOCKED_SCHEDULE, LAST_PLANET)).toEqual([
      'seed 3 stalled on planet 6 before the core of planet 8',
    ])
  })

  it('fails when no seed left a planet, rather than passing on nothing', () => {
    expect(campaignScalingProblems([], LOCKED_SCHEDULE, LAST_PLANET)).toEqual([
      'no seed left a planet, so the band 5 sawtooth judged nothing',
    ])
  })

  it('passes with every M1-M5 content module row held back at vision', () => {
    const heldBack = withContentModulesHeldBack(LOCKED_SCHEDULE)
    const visionRows = heldBack.rows.filter((row) => CONTENT_MODULE_ROW_IDS.includes(row.id))
    expect(visionRows.map((row) => row.status)).toEqual(Array(6).fill('vision'))
    expect(campaignScalingProblems(healthyRuns(), heldBack, LAST_PLANET)).toEqual([])
  })

  it("loads the locked schedule only at the Horizontal Scaler's source_hash pin", () => {
    expect(scheduleFile.source_hash).toBe(SCALER_PIN)
    expect(LOCKED_SCHEDULE_SOURCE_HASH).toBe(SCALER_PIN)
    expect(LOCKED_SCHEDULE.sourceHash).toBe(SCALER_PIN)
  })
})

describe('campaign pacing findings (R1 #89, C4 #91)', () => {
  it('reports a planet outside 45 to 60 minutes with the dial to turn, never as a gate problem', () => {
    const report = reportWithCoreMinutes({ '3': 50, '4': 70 })
    expect(campaignPacingFindings(report)).toEqual([
      'planet 4 core took 70.0 min, campaign target 45 to 60 min per planet',
      'campaign pacing misses are a Systems & Economy finding: the dial is paceScale in economy.json; k_casing stays at its floor (Game Director on #84)',
    ])
  })

  it('says nothing when every planet is inside the campaign minutes', () => {
    expect(campaignPacingFindings(reportWithCoreMinutes({ '3': 45, '4': 60 }))).toEqual([])
  })
})

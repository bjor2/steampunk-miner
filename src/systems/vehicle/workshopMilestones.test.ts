import { describe, expect, it } from 'vitest'
import SHIPPED_MILESTONES from '../../data/workshop/milestones.json'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { exportedSidecarOf } from '../art/artCatalogue'
import { slotOfPartId, tierOfPartId } from '../art/artIds'
import type { PartsSidecar } from '../art/partsSidecar'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { majorsOfSteps, stepOfMajor, type TrackNumbers } from '../economy/upgradeSteps'
import { progressFromTravel } from '../unlocks/travelUnlocks'
import { isUnlocked, LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import {
  isMilestoneOwned,
  MILESTONE_BEHAVIOUR_IDS,
  milestoneLandedBy,
  milestoneOf,
  milestonePartProblems,
  nextMilestoneOf,
  ownedMilestonesOf,
  WORKSHOP_MILESTONES,
  workshopMilestoneProblems,
  type WorkshopMilestone,
} from './workshopMilestones'

// Gameplay & Vehicle's 12 rows on #177 (data ticket 228): majors 1 and 2 on each of the six
// tracks, among the tier 1-3 parts the vehicle ships.
const GV_ROWS: readonly [string, number, string, readonly string[]][] = [
  ['drill_tip', 1, 'motion.bit_spin_flourish', ['t1-drill-bit']],
  ['drill_tip', 2, 'swap.part', ['t3-drill-bit']],
  ['drill_power', 1, 'swap.part', ['t2-drill-head']],
  ['drill_power', 2, 'swap.part', ['t3-drill-head']],
  ['engine', 1, 'motion.piston_pump', ['t1-piston']],
  ['engine', 2, 'swap.part', ['t3-wheel', 't3-wheel-2', 't3-wheel-3']],
  ['boiler', 1, 'swap.part', ['t2-stack-2']],
  ['boiler', 2, 'swap.part', ['t3-boiler-2', 't3-stack']],
  ['cargo_hold', 1, 'motion.hopper_tip', ['t1-hopper']],
  ['cargo_hold', 2, 'motion.hopper_tip', ['t1-hopper']],
  ['hull', 1, 'swap.part', ['t2-armour-plate', 't2-armour-plate-2']],
  [
    'hull',
    2,
    'swap.part',
    ['t3-armour-plate', 't3-armour-plate-2', 't3-armour-plate-3', 't3-chassis'],
  ],
]

const DRILL_POWER_MAJOR_1 = milestoneOf('drill_power', 1) as WorkshopMilestone

const NOTHING_UNLOCKED = () => false
const EVERYTHING_UNLOCKED = () => true

function shippedVehicleSidecar(): PartsSidecar {
  const sidecar = exportedSidecarOf(SHIPPED_ART, 'vehicle')
  if (sidecar === null) throw new Error('the vehicle has no exported sidecar')
  return sidecar
}

function majorsOf(levels: Partial<TrackNumbers>): TrackNumbers {
  const steps = Object.fromEntries(
    UPGRADE_IDS.map((track) => [track, stepOfMajor(levels[track] ?? 0)]),
  ) as Record<(typeof UPGRADE_IDS)[number], number>
  return majorsOfSteps(steps)
}

/** Drill power rows, one major each unless a row says otherwise, with no featureId by default. */
function fileWith(rows: readonly Partial<WorkshopMilestone>[]): unknown {
  return {
    milestones: rows.map((row, index) => ({
      ...DRILL_POWER_MAJOR_1,
      major: index + 1,
      featureId: undefined,
      ...row,
    })),
  }
}

describe('workshop milestones', () => {
  it('lists G&V’s 12 rows: majors 1 and 2 on every track, keyed on the track’s major level', () => {
    const rows = WORKSHOP_MILESTONES.map((row) => [
      row.track,
      row.major,
      row.behaviour,
      row.partIds,
    ])
    expect(rows).toHaveLength(12)
    expect(rows).toEqual(expect.arrayContaining(GV_ROWS.map((row) => [...row])))
    for (const track of UPGRADE_IDS) {
      expect(
        WORKSHOP_MILESTONES.filter((row) => row.track === track).map((row) => row.major),
      ).toEqual([1, 2])
    }
  })

  it('names only parts the vehicle’s sidecar ships, and no part is swapped in from tier 1', () => {
    expect(milestonePartProblems(WORKSHOP_MILESTONES, shippedVehicleSidecar())).toEqual([])
    for (const row of WORKSHOP_MILESTONES.filter((row) => row.behaviour === 'swap.part')) {
      expect(row.partIds.map(tierOfPartId).every((tier) => tier !== null && tier >= 2)).toBe(true)
    }
  })

  it('keeps cargo_hold motion-only while the vehicle ships no hopper above tier 1', () => {
    const hopperTiers = shippedVehicleSidecar()
      .parts.filter((part) => slotOfPartId(part.id) === 'hopper')
      .map((part) => part.tier)
    expect(hopperTiers).toEqual([1])
    const cargoRows = WORKSHOP_MILESTONES.filter((row) => row.track === 'cargo_hold')
    expect(cargoRows.every((row) => row.behaviour.startsWith('motion.'))).toBe(true)
  })

  it('never unlocks a scheduled feature: no row grants, names or stands for a stats.json row', () => {
    const scheduleIds = LOCKED_SCHEDULE.rows.map((row) => row.id)
    for (const row of WORKSHOP_MILESTONES) {
      expect(row.featureId).toBeNull()
      expect(scheduleIds).not.toContain(row.behaviour)
      expect(scheduleIds).not.toContain(row.behaviour.split('.')[1])
      expect(row.partIds.some((partId) => scheduleIds.includes(partId))).toBe(false)
    }
    expect(MILESTONE_BEHAVIOUR_IDS.some((id) => scheduleIds.includes(id))).toBe(false)
  })

  it('is owned at its major with no feature unlocked at all, so the list depends on no schedule', () => {
    const owned = ownedMilestonesOf(majorsOf({ drill_power: 2, hull: 1 }), NOTHING_UNLOCKED)
    expect(owned.map((row) => `${row.track} ${row.major}`)).toEqual([
      'drill_power 1',
      'drill_power 2',
      'hull 1',
    ])
    expect(ownedMilestonesOf(majorsOf({}), EVERYTHING_UNLOCKED)).toEqual([])
  })

  it('owns a milestone that upgrades a scheduled feature only once FeatureUnlocked has fired', () => {
    const onGuns: WorkshopMilestone = { ...DRILL_POWER_MAJOR_1, featureId: 'auto_guns' }
    expect(isMilestoneOwned(onGuns, 5, NOTHING_UNLOCKED)).toBe(false)
    expect(isMilestoneOwned(onGuns, 5, (id) => id === 'auto_guns')).toBe(true)
    expect(isMilestoneOwned(onGuns, 0, EVERYTHING_UNLOCKED)).toBe(false)
  })

  it('keeps a milestone on a vision row hidden however far the run has travelled', () => {
    const unlockedByTravelTo = (planetIndex: number) => (featureId: string) => {
      const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === featureId)
      return row !== undefined && isUnlocked(row, progressFromTravel(planetIndex))
    }
    const visionRow = LOCKED_SCHEDULE.rows.find((row) => row.status === 'vision')
    if (visionRow === undefined) throw new Error('the locked schedule has no vision row')
    const onVision: WorkshopMilestone = { ...DRILL_POWER_MAJOR_1, featureId: visionRow.id }
    expect(isMilestoneOwned(onVision, 9, unlockedByTravelTo(99))).toBe(false)
    const onShipped: WorkshopMilestone = { ...DRILL_POWER_MAJOR_1, featureId: 'auto_guns' }
    expect(isMilestoneOwned(onShipped, 9, unlockedByTravelTo(1))).toBe(false)
    expect(isMilestoneOwned(onShipped, 9, unlockedByTravelTo(40))).toBe(true)
  })

  it('finds the milestone a step lands on: the big level-up into a milestone major, never a pip', () => {
    expect(milestoneLandedBy('drill_power', stepOfMajor(1) - 1)).toBe(DRILL_POWER_MAJOR_1)
    expect(milestoneLandedBy('drill_power', stepOfMajor(1) - 2)).toBeNull()
    expect(milestoneLandedBy('drill_power', stepOfMajor(3) - 1)).toBeNull()
    expect(milestoneLandedBy('cargo_hold', stepOfMajor(2) - 1)).toBe(milestoneOf('cargo_hold', 2))
  })

  it('stars the next milestone above the major a track is on, and none past the last', () => {
    expect(nextMilestoneOf('engine', 0)).toBe(milestoneOf('engine', 1))
    expect(nextMilestoneOf('engine', 1)).toBe(milestoneOf('engine', 2))
    expect(nextMilestoneOf('engine', 2)).toBeNull()
    expect(milestoneOf('engine', 3)).toBeNull()
  })

  it('ships the committed file as it is', () => {
    expect(workshopMilestoneProblems(SHIPPED_MILESTONES)).toEqual([])
  })

  it('refuses the file whole, listing every problem, never trimming a row', () => {
    const problems = workshopMilestoneProblems(
      fileWith([
        { major: 1 },
        { major: 1 },
        { major: 0 },
        { behaviour: 'swap.part', partIds: ['t1-drill-head'] },
        { partIds: ['t2-prow'] },
        { partIds: [] },
        { featureId: 'jetpack' },
        { behaviour: 'motion.jetpack' as WorkshopMilestone['behaviour'] },
      ]),
    )
    expect(problems).toEqual([
      'milestones[2].major must be a major level of 1 or more, got 0',
      'milestones[3] swaps in t1-drill-head, a tier-1 part: no new silhouette',
      'milestones[4].partIds names t2-prow, which is no vehicle part id',
      'milestones[5].partIds must name at least one part',
      'milestones[6].featureId names jetpack, which is no row of the locked schedule',
      'milestones[7].behaviour must be one of motion.bit_spin_flourish, motion.hopper_tip, motion.piston_pump, swap.part, got "motion.jetpack"',
      'drill_power major 1 is listed twice',
    ])
    expect(workshopMilestoneProblems({ rows: [] })).toEqual(['milestones must be a list'])
  })

  it('accepts a row that upgrades a locked-schedule feature', () => {
    expect(workshopMilestoneProblems(fileWith([{ featureId: 'auto_guns' }]))).toEqual([])
  })
})

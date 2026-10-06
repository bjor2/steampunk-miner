import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import scheduleFile from '../../../docs/scaling/horizontal/stats.json'
import type { UnlockBind, UnlockRow } from './readUnlockSchedule'
import {
  BUILT_VISION_ROW_IDS,
  isUnlocked,
  LOCKED_SCHEDULE,
  LOCKED_SCHEDULE_SOURCE_HASH,
  rowsAt,
  unlockCountThrough,
  type UnlockProgress,
} from './unlockSchedule'

/**
 * The bytes of the locked file. Any edit to the schedule, even one that keeps its `source_hash`,
 * fails here until this pin is updated on purpose with the Horizontal Scaler's refresh.
 */
const LOCKED_FILE_SHA256 = '74227339530b34d4318f0a35091ab9e8bc9304a6ce83266397f7ca2c3ed83777'

const CAMPAIGN_PLANETS = Array.from({ length: 40 }, (_, index) => index + 1)

const NO_PROGRESS: UnlockProgress = {
  highestPlanetIndex: 1,
  collectedArtefactRowIds: new Set(),
  builtFacilityRowIds: new Set(),
  manualUnlockRowIds: new Set(),
}

function stubRow(bind: UnlockBind, overrides: Partial<UnlockRow> = {}): UnlockRow {
  return {
    id: `stub_${bind}`,
    name: `Stub ${bind}`,
    planetIndex: 3,
    lane: 'Feature',
    progressionAxis: 'horizontal',
    status: 'planned',
    bind,
    count: 1,
    ...overrides,
  }
}

function progressWithEveryBindMet(rows: readonly UnlockRow[]): UnlockProgress {
  const ids = new Set(rows.map((row) => row.id))
  return {
    highestPlanetIndex: Number.MAX_SAFE_INTEGER,
    collectedArtefactRowIds: ids,
    builtFacilityRowIds: ids,
    manualUnlockRowIds: ids,
  }
}

describe('locked unlock schedule', () => {
  it('loads the 55 locked Schedule C rows', () => {
    expect(LOCKED_SCHEDULE.rows).toHaveLength(55)
  })

  it('carries the Horizontal Scaler source hash pin', () => {
    expect(LOCKED_SCHEDULE.sourceHash).toBe(
      'sha256:419ca56d8af626d1f0ff799075be9e72726381567c26168b7d0a6fbf8e1f3481',
    )
    expect(LOCKED_SCHEDULE_SOURCE_HASH).toBe(LOCKED_SCHEDULE.sourceHash)
  })

  it('fails when the file bytes drift without a pin update', () => {
    const bytes = readFileSync(
      new URL('../../../docs/scaling/horizontal/stats.json', import.meta.url),
    )
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(LOCKED_FILE_SHA256)
  })

  it('schedules 60 unlocks cumulatively by planet 40', () => {
    expect(unlockCountThrough(LOCKED_SCHEDULE, 40)).toBe(60)
  })

  it('matches the cumulative count the scaler recorded for every campaign planet', () => {
    const counted = CAMPAIGN_PLANETS.map((planet) => ({
      planet,
      cumulative: unlockCountThrough(LOCKED_SCHEDULE, planet),
    }))
    expect(counted).toEqual(scheduleFile.cumulative_by_planet)
  })

  it('leaves only the intentional gaps at planets 16 and 29 without a new row', () => {
    const emptyPlanets = CAMPAIGN_PLANETS.filter(
      (planet) => rowsAt(LOCKED_SCHEDULE, planet).length === 0,
    )
    expect(emptyPlanets).toEqual([16, 29])
  })

  it('lists the finale and the endless gate at planet 40', () => {
    expect(rowsAt(LOCKED_SCHEDULE, 40).map((row) => row.id)).toEqual(['finale', 'endless_unlock'])
  })

  it('unlocks no vision row whose module is not built, even when every bind is met', () => {
    const visionRows = LOCKED_SCHEDULE.rows.filter((row) => row.status === 'vision')
    const progress = progressWithEveryBindMet(visionRows)
    expect(visionRows).toHaveLength(40)
    expect(visionRows.filter((row) => isUnlocked(row, progress)).map((row) => row.id)).toEqual([
      ...BUILT_VISION_ROW_IDS,
    ])
  })

  it('opens the built tunnel_wrecker row at planet 6, its locked planet (#94)', () => {
    const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === 'tunnel_wrecker')!
    expect(row).toMatchObject({ planetIndex: 6, bind: 'planet_gate', lane: 'Enemy' })
    expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: 5 })).toBe(false)
    expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: 6 })).toBe(true)
  })

  it('names only vision rows of the locked schedule as built modules', () => {
    const built = LOCKED_SCHEDULE.rows.filter((row) => BUILT_VISION_ROW_IDS.has(row.id))
    expect(built.map((row) => [row.id, row.status])).toEqual(
      [...BUILT_VISION_ROW_IDS].map((id) => [id, 'vision']),
    )
  })

  it('opens auto_guns on arriving at planet 4 now its module is built (#93)', () => {
    const guns = LOCKED_SCHEDULE.rows.find((row) => row.id === 'auto_guns') as UnlockRow
    expect(guns).toMatchObject({ planetIndex: 4, bind: 'planet_gate' })
    expect(isUnlocked(guns, { ...NO_PROGRESS, highestPlanetIndex: 3 })).toBe(false)
    expect(isUnlocked(guns, { ...NO_PROGRESS, highestPlanetIndex: 4 })).toBe(true)
  })

  it('opens the built refinery_bay row once the platform has its Refinery bay (#92)', () => {
    const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === 'refinery_bay')!
    expect(row).toMatchObject({ planetIndex: 3, bind: 'facility', lane: 'Facility' })
    expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: 3 })).toBe(false)
    const withBay = {
      ...NO_PROGRESS,
      highestPlanetIndex: 3,
      builtFacilityRowIds: new Set([row.id]),
    }
    expect(isUnlocked(row, withBay)).toBe(true)
  })
})

describe('unlock gate checks', () => {
  it('opens a planet gate row on arrival at its planet', () => {
    const row = stubRow('planet_gate')
    expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: 2 })).toBe(false)
    expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: 3 })).toBe(true)
  })

  it('opens an artefact row when its artefact is collected', () => {
    const row = stubRow('artefact')
    const progress = { ...NO_PROGRESS, collectedArtefactRowIds: new Set([row.id]) }
    expect(isUnlocked(row, NO_PROGRESS)).toBe(false)
    expect(isUnlocked(row, progress)).toBe(true)
  })

  it('opens a facility row when its facility is built', () => {
    const row = stubRow('facility')
    const progress = { ...NO_PROGRESS, builtFacilityRowIds: new Set([row.id]) }
    expect(isUnlocked(row, NO_PROGRESS)).toBe(false)
    expect(isUnlocked(row, progress)).toBe(true)
  })

  it('opens a manual row only when a script sets it', () => {
    const row = stubRow('manual')
    const reachedOnly = { ...NO_PROGRESS, highestPlanetIndex: 40 }
    const progress = { ...reachedOnly, manualUnlockRowIds: new Set([row.id]) }
    expect(isUnlocked(row, reachedOnly)).toBe(false)
    expect(isUnlocked(row, progress)).toBe(true)
  })

  it('does not open a bind meant for another row', () => {
    const row = stubRow('artefact')
    const progress = { ...NO_PROGRESS, collectedArtefactRowIds: new Set(['stub_other']) }
    expect(isUnlocked(row, progress)).toBe(false)
  })

  it('keeps a cut row locked whatever its bind', () => {
    const row = stubRow('planet_gate', { status: 'cut' })
    expect(isUnlocked(row, progressWithEveryBindMet([row]))).toBe(false)
  })

  it('counts each pick of an artefact set toward the cumulative total', () => {
    const schedule = {
      sourceHash: LOCKED_SCHEDULE_SOURCE_HASH,
      rows: [stubRow('artefact', { count: 2 }), stubRow('planet_gate', { planetIndex: 4 })],
    }
    expect(unlockCountThrough(schedule, 3)).toBe(2)
    expect(unlockCountThrough(schedule, 4)).toBe(3)
    expect(rowsAt(schedule, 4).map((row) => row.bind)).toEqual(['planet_gate'])
  })
})

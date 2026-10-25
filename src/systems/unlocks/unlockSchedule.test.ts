import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import scheduleFile from '../../../docs/scaling/horizontal/stats.json'
import type { UnlockBind, UnlockRow } from './readUnlockSchedule'
import {
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
const LOCKED_FILE_SHA256 = '27ec1659b6023056a99fddd85060fdc8e07be0c91f1f2dcd972b5c3f7b5652b7'

/**
 * The pin before ticket 900 refreshed the schedule (HS/GD 25 Oct, the P1-P5 audit on #647): the
 * rows built on main marked shipped, `blasting_charges` re-pinned from planet 7 to 1 as a price-band
 * anchor (dynamite money-only from P1, GD lock on #863) and the `blast_rock` row added at planet 7.
 */
const PIN_BEFORE_STATS_REFRESH = '0395075f762c362be7abe0aac9d3fa2db8949c2a08b8f67111b2eca66e704211'

/** The rows ticket 900 flipped to shipped, each with the status it had before. */
const REFRESHED_ROW_STATUSES: readonly (readonly [string, string])[] = [
  ['fluid_ground', 'building'],
  ...[
    'casing_cement',
    'collapse_vacuum',
    'two_bay_shops',
    'artefacts',
    'music_layers',
    'ore_whisper',
    'breathing_room',
    'assay_beacon',
    'bore_gun',
    'merchants',
    'cache_crate',
    'scree_plough',
    'damp_flask',
    'shard_tongs',
    'vent_vane',
  ].map((id) => [id, 'planned'] as const),
]

/** The planet `blast_rock` opens on: every count from it on gained the row. */
const BLAST_ROCK_PLANET = 7

/** What ticket 900 wrote into the file besides the statuses, the row and the counts. */
const STATS_REFRESH_EDIT: readonly (readonly [string, string])[] = [
  ['"updated": "2026-10-06T20:04:18.487954+00:00"', '"updated": "2026-10-25T23:45:00+00:00"'],
  ['    "issues/823"\n  ],', '    "issues/823",\n    "issues/900"\n  ],'],
  [
    'sha256:e1d74cdc56bc1b9f23a4177e5d6d11666f6186e857e57fe5f55c1bfbd7ed2b97',
    'sha256:09985a8b29e109263896001851d58cf2e3112cf7406d0c8e4cc8484ea256fdb0',
  ],
  [
    ' was not reproducible).',
    ' was not reproducible). #900 (HS/GD 25 Oct, P1\\u2013P5 audit): statuses refreshed from the code on main (16 planned/building rows read shipped); blasting_charges re-pinned P7->P1 as a price-band anchor (dynamite money-only from P1) and blast_rock added at P7 (Environment, planet_gate, planned); P1\\u2013P40 cumulative +1 (P40 69).',
  ],
  [
    '      "planetIndex": 7,\n      "lane": "Feature",\n      "progressionAxis": "horizontal",\n      "status": "shipped",\n      "bind": "planet_gate",\n      "name": "Blasting charges",\n      "slice": "campaign",\n      "origin": "new"\n',
    '      "planetIndex": 1,\n      "lane": "Feature",\n      "progressionAxis": "horizontal",\n      "status": "shipped",\n      "bind": "planet_gate",\n      "name": "Blasting charges",\n      "slice": "campaign",\n      "origin": "new",\n      "repinNote": "Re-pinned P7 -> P1 (#900): a price-band anchor only, as dynamite is money-only from P1 (Bjor 25 Oct, GD lock on #863). Blast Radius and Blast Casing stay under this row, no own ids."\n',
  ],
]

/**
 * The file's text as it stood before ticket 900: the statuses back, `blast_rock` out,
 * `blasting_charges` at planet 7, and every count one lower (P1-P6 by the move, P7 on by the row).
 */
function textBeforeStatsRefresh(text: string): string {
  const unflipped = REFRESHED_ROW_STATUSES.reduce(
    (current, [id, status]) =>
      current.replace(
        rowTextOf(current, id),
        rowTextOf(current, id).replace('"status": "shipped",', `"status": "${status}",`),
      ),
    withoutRowOf(text, 'blast_rock'),
  )
  const counts = unflipped.indexOf('"cumulative_by_planet"')
  const lowered =
    unflipped.slice(0, counts) +
    unflipped
      .slice(counts)
      .replace(/"cumulative": (\d+)/g, (_, count: string) => `"cumulative": ${+count - 1}`)
  return STATS_REFRESH_EDIT.reduce(
    (current, [before, after]) => current.replace(after, before),
    lowered,
  )
}

/**
 * The pin before ticket 823 re-pinned the schedule for the planet kits (GD lock of 24 Oct on #647):
 * `merchants` moved from planet 10 to 1 as a planned row, and the five kit item rows came in.
 */
const PIN_BEFORE_KIT_ROWS = 'aab8622fb7249f3fd8a9a3511c4fd00a1dc8a04b10001d9ae0108b798a8cf873'

/** The kit item rows of ticket 823, each with the planet it opens on. */
const KIT_ROW_PLANETS: readonly (readonly [string, number])[] = [
  ['cache_crate', 1],
  ['scree_plough', 2],
  ['damp_flask', 3],
  ['shard_tongs', 4],
  ['vent_vane', 5],
]

/** What ticket 823 wrote into the file besides its rows and the counts, each as `[before, after]`. */
const KIT_ROWS_EDIT: readonly (readonly [string, string])[] = [
  ['    "issues/650"\n  ],', '    "issues/650",\n    "issues/823"\n  ],'],
  [
    'sha256:688b54bad914719bc6fedddf95a84b9114f7b4f8eab9d510e404d775ac251121',
    'sha256:e1d74cdc56bc1b9f23a4177e5d6d11666f6186e857e57fe5f55c1bfbd7ed2b97',
  ],
  [
    ' source_hash recomputed',
    ' #823 (GD lock 24 Oct, planet kits P1\\u2013P5): merchants moved P10->P1 (vision->planned) and five kit items added (cache_crate P1, scree_plough P2, damp_flask P3, shard_tongs P4, vent_vane P5; Merchant, planet_gate, planned); P1\\u2013P9 cumulative +2..+6, P10\\u2013P40 +5 (P40 68). source_hash recomputed',
  ],
  [
    '  "gap_justifications": {\n',
    '  "gap_justifications": {\n    "10": "Freed when merchants moved to P1 (#823 GD lock, 24 Oct: final, keeps the schedule); P10 gets its content from #824\'s generated kit rows.",\n',
  ],
]

/**
 * The file's text as it stood before ticket 823: the kit rows out, `merchants` back at planet 10
 * as a vision row in its old place, and each planet's count lowered by the rows it had gained.
 */
function textBeforeKitRows(text: string): string {
  const merchants = rowTextOf(text, 'merchants')
    .replace('"planetIndex": 1,', '"planetIndex": 10,')
    .replace('"status": "planned",', '"status": "vision",')
  const withoutRows = ['merchants', ...KIT_ROW_PLANETS.map(([id]) => id)].reduce(withoutRowOf, text)
  const reinserted = withRowBefore(withoutRows, 'artefact_set_2', merchants)
  const counts = reinserted.indexOf('"cumulative_by_planet"')
  const lowered =
    reinserted.slice(0, counts) +
    reinserted
      .slice(counts)
      .replace(/("planet": (\d+),\n\s+"cumulative": )(\d+)/g, lowerFromKitRows)
  return KIT_ROWS_EDIT.reduce((current, [before, after]) => current.replace(after, before), lowered)
}

/** The rows a planet's count gained in ticket 823: the kit rows to it, and merchants before 10. */
function lowerFromKitRows(_: string, prefix: string, planet: string, count: string): string {
  const kitRows = KIT_ROW_PLANETS.filter(([, opensOn]) => opensOn <= +planet).length
  const merchants = +planet < 10 ? 1 : 0
  return `${prefix}${+count - kitRows - merchants}`
}

function rowTextOf(text: string, rowId: string): string {
  const row = text.indexOf(`    {\n      "id": "${rowId}"`)
  return text.slice(row, text.indexOf('    },\n', row) + '    },\n'.length)
}

function withRowBefore(text: string, rowId: string, rowText: string): string {
  const row = text.indexOf(`    {\n      "id": "${rowId}"`)
  return text.slice(0, row) + rowText + text.slice(row)
}

/** The file's text before ticket 823's edit, past ticket 900's refresh. */
function fileTextBeforeKitRows(): string {
  return textBeforeKitRows(textBeforeStatsRefresh(lockedFileText()))
}

/** The pin before ticket 759 added the `jump_drive` row, the star map's one new row (#650 GD lock). */
const PIN_BEFORE_JUMP_DRIVE_ROW = '99a6771ed1a264a3065c55b47927399638df41c4c8cfbc7286cafa7c13024876'

/** What ticket 759 wrote into the file besides its row and the counts, each as `[before, after]`. */
const JUMP_DRIVE_EDIT: readonly (readonly [string, string])[] = [
  ['    "issues/309"\n  ],', '    "issues/309",\n    "issues/650"\n  ],'],
  [
    'sha256:4543f787bfaa38083631a917492562bb178fe5c3705da79632a09bd60845276d',
    'sha256:688b54bad914719bc6fedddf95a84b9114f7b4f8eab9d510e404d775ac251121',
  ],
  [
    ' source_hash recomputed',
    ' #650 (GD lock, star map): jump_drive added at P5 (Upgrade, planet_gate, shipped), the one new row of the star map; P5\\u2013P40 cumulative +1 (P40 63). source_hash recomputed',
  ],
]

/** The planet the `jump_drive` row opens on: the counts from it on moved by one. */
const JUMP_DRIVE_PLANET = 5

/** The file's text as it stood before ticket 759: its row out, the counts from P5 one lower. */
function textBeforeJumpDriveRow(text: string): string {
  const withoutRow = withoutRowOf(text, 'jump_drive')
  const counts = withoutRow.indexOf('"cumulative_by_planet"')
  const lowered =
    withoutRow.slice(0, counts) +
    withoutRow
      .slice(counts)
      .replace(/("planet": (\d+),\n\s+"cumulative": )(\d+)/g, lowerFromJumpDrive)
  return JUMP_DRIVE_EDIT.reduce(
    (current, [before, after]) => current.replace(after, before),
    lowered,
  )
}

function lowerFromJumpDrive(_: string, prefix: string, planet: string, count: string): string {
  return `${prefix}${+planet >= JUMP_DRIVE_PLANET ? +count - 1 : +count}`
}

function withoutRowOf(text: string, rowId: string): string {
  const row = text.indexOf(`    {\n      "id": "${rowId}"`)
  const rowEnd = text.indexOf('    },\n', row) + '    },\n'.length
  return text.slice(0, row) + text.slice(rowEnd)
}

/** The pin before ticket 367 gave `casing_cement` its scopeNote, Content's copy on #367 (ruling B). */
const PIN_BEFORE_CEMENT_SCOPE_NOTE =
  '00994a897eb096b768046a780b7d04d7d0840b9361c3a18e64531b0513365206'

/** What ticket 367 wrote into the casing_cement row, `[before, after]`. */
const CEMENT_SCOPE_NOTE_EDIT: readonly [string, string] = [
  '      "slice": 2\n',
  '      "slice": 2,\n      "scopeNote": "Permanent ground reinforcement starts at P8 with refractory lining; earlier linings hold the bore but don\'t stop collapse (#367 ruling B)."\n',
]

/** The file's text as it stood before ticket 367. */
function textBeforeCementScopeNote(text: string): string {
  const [before, after] = CEMENT_SCOPE_NOTE_EDIT
  return text.replace(after, before)
}

/** The pin before ticket 289 flipped `magnetic_planets` to shipped, its one named re-pin (#258 Q4). */
const PIN_BEFORE_MAGNETIC_FLIP = '88ddb93162fa86883c8b3903d1a2588e3f23e6f41fdd98949c911ba4e93c9fc0'

/** The pin before ticket 313 added the `bore_gun` row, its named exception (#309 GD decision). */
const PIN_BEFORE_BORE_GUN_ROW = '68135afa890f3e109c2e9f54d619d64149d888fad3819102812ed0a6a5d6dcdc'

/** What ticket 313 wrote into the file besides the cumulative counts, each as `[before, after]`. */
const BORE_GUN_EDIT: readonly (readonly [string, string])[] = [
  ['    "issues/153"\n  ],', '    "issues/153",\n    "issues/309"\n  ],'],
  [
    'sha256:a420cb57bdc831be41eea490fe199873b567388c7159510acac920acd2814c8f',
    'sha256:4543f787bfaa38083631a917492562bb178fe5c3705da79632a09bd60845276d',
  ],
  [
    ' source_hash recomputed',
    ' #309 (GD decision, Horizontal): bore_gun added at P1 (Upgrade, planet_gate, planned), the named exception that pushes no other P1 row; P1\\u2013P40 cumulative +1 (P40 62). source_hash recomputed',
  ],
]

/** The file's text as it stood before ticket 313: its row out, every count one lower. */
function textBeforeBoreGunRow(text: string): string {
  const row = text.indexOf('    {\n      "id": "bore_gun"')
  const rowEnd = text.indexOf('    },\n', row) + '    },\n'.length
  const withoutRow = text.slice(0, row) + text.slice(rowEnd)
  const counts = withoutRow.indexOf('"cumulative_by_planet"')
  const lowered =
    withoutRow.slice(0, counts) +
    withoutRow
      .slice(counts)
      .replace(/"cumulative": (\d+)/g, (_, count: string) => `"cumulative": ${+count - 1}`)
  return BORE_GUN_EDIT.reduce((current, [before, after]) => current.replace(after, before), lowered)
}

function lockedFileText(): string {
  return readFileSync(
    new URL('../../../docs/scaling/horizontal/stats.json', import.meta.url),
    'utf8',
  )
}

/**
 * The canonical form of `source_hash_method` (docs/scaling/horizontal/source_hash.mjs, #153):
 * sorted feature ids, the #79 schema and the #80 lock fills (rows with origin `schedule_lock_80`
 * as `{id, planetIndex, lockNote}`, sorted by id), stringified with every object's keys sorted.
 */
function sourceHashOf(file: typeof scheduleFile): string {
  const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  const sortKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortKeys)
    if (value === null || typeof value !== 'object') return value
    const entries = Object.entries(value).sort(([a], [b]) => byCodeUnit(a, b))
    return Object.fromEntries(entries.map(([key, inner]) => [key, sortKeys(inner)]))
  }
  const rows: { id: string; planetIndex: number; origin?: string; lockNote?: string }[] =
    file.features
  const ids = rows.map((row) => row.id).sort(byCodeUnit)
  const fills = rows
    .filter((row) => row.origin === 'schedule_lock_80')
    .map(({ id, planetIndex, lockNote }) => ({ id, planetIndex, lockNote }))
    .sort((a, b) => byCodeUnit(a.id, b.id))
  const canonical = JSON.stringify(sortKeys({ ids, schema: file.schema, fills }))
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`
}

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

/**
 * The six vision rows the M tickets switched on in code before T3 (#127) marked them shipped in the
 * file; the pre-T3 rule below replays how they unlocked so the flip can be shown to change nothing.
 */
const BUILT_BEFORE_SHIPPED_IN_FILE = new Set([
  'refinery_bay',
  'auto_guns',
  'tunnel_wrecker',
  'blasting_charges',
  'heat_lava',
  'refractory_lining',
])

function isUnlockedBeforeShippedInFile(row: UnlockRow, progress: UnlockProgress): boolean {
  const hasModule =
    row.status === 'vision' ? BUILT_BEFORE_SHIPPED_IN_FILE.has(row.id) : row.status !== 'cut'
  return hasModule && isUnlocked({ ...row, status: 'planned' }, progress)
}

/** A run that has reached `planetIndex` and met the bind of every row scheduled up to it. */
function progressThroughPlanet(planetIndex: number): UnlockProgress {
  const reached = LOCKED_SCHEDULE.rows.filter((row) => row.planetIndex <= planetIndex)
  return { ...progressWithEveryBindMet(reached), highestPlanetIndex: planetIndex }
}

function unlockedIdsOnPlanet(
  planetIndex: number,
  unlocks: (row: UnlockRow, progress: UnlockProgress) => boolean,
): string[] {
  const progress = progressThroughPlanet(planetIndex)
  return LOCKED_SCHEDULE.rows.filter((row) => unlocks(row, progress)).map((row) => row.id)
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
  it('loads the 64 locked Schedule C rows', () => {
    expect(LOCKED_SCHEDULE.rows).toHaveLength(64)
  })

  it('carries the Horizontal Scaler source hash pin', () => {
    expect(LOCKED_SCHEDULE.sourceHash).toBe(
      'sha256:09985a8b29e109263896001851d58cf2e3112cf7406d0c8e4cc8484ea256fdb0',
    )
    expect(LOCKED_SCHEDULE_SOURCE_HASH).toBe(LOCKED_SCHEDULE.sourceHash)
  })

  it('stores the source hash its committed method recomputes from the file (#153)', () => {
    expect(sourceHashOf(scheduleFile)).toBe(scheduleFile.source_hash)
    const script = fileURLToPath(
      new URL('../../../docs/scaling/horizontal/source_hash.mjs', import.meta.url),
    )
    expect(execFileSync(process.execPath, [script], { encoding: 'utf8' }).trim()).toBe(
      scheduleFile.source_hash,
    )
  })

  it('fails when the file bytes drift without a pin update', () => {
    const bytes = readFileSync(
      new URL('../../../docs/scaling/horizontal/stats.json', import.meta.url),
    )
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(LOCKED_FILE_SHA256)
  })

  it('schedules 69 unlocks cumulatively by planet 40, the blast_rock row of ticket 900 its re-pin', () => {
    expect(unlockCountThrough(LOCKED_SCHEDULE, 40)).toBe(69)
  })

  it('matches the cumulative count the scaler recorded for every campaign planet', () => {
    const counted = CAMPAIGN_PLANETS.map((planet) => ({
      planet,
      cumulative: unlockCountThrough(LOCKED_SCHEDULE, planet),
    }))
    expect(counted).toEqual(scheduleFile.cumulative_by_planet)
  })

  it('leaves only the intentional gaps at planets 10, 16, 24 and 29 without a new row', () => {
    const emptyPlanets = CAMPAIGN_PLANETS.filter(
      (planet) => rowsAt(LOCKED_SCHEDULE, planet).length === 0,
    )
    expect(emptyPlanets).toEqual([10, 16, 24, 29])
  })

  it('unlocks the same rows on every campaign planet as before the six rows were marked shipped', () => {
    const before = CAMPAIGN_PLANETS.map((planet) =>
      unlockedIdsOnPlanet(planet, isUnlockedBeforeShippedInFile),
    )
    const after = CAMPAIGN_PLANETS.map((planet) => unlockedIdsOnPlanet(planet, isUnlocked))
    expect(after).toEqual(before)
    expect(after[39]).toEqual(expect.arrayContaining([...BUILT_BEFORE_SHIPPED_IN_FILE]))
  })

  it('lists the finale and the endless gate at planet 40', () => {
    expect(rowsAt(LOCKED_SCHEDULE, 40).map((row) => row.id)).toEqual(['finale', 'endless_unlock'])
  })

  it('unlocks no vision row whose module is not built, even when every bind is met', () => {
    const visionRows = LOCKED_SCHEDULE.rows.filter((row) => row.status === 'vision')
    const progress = progressWithEveryBindMet(visionRows)
    expect(visionRows).toHaveLength(24)
    expect(visionRows.filter((row) => isUnlocked(row, progress))).toEqual([])
  })

  it('opens the built tunnel_wrecker row at planet 6, its locked planet (#94)', () => {
    const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === 'tunnel_wrecker')!
    expect(row).toMatchObject({ planetIndex: 6, bind: 'planet_gate', lane: 'Enemy' })
    expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: 5 })).toBe(false)
    expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: 6 })).toBe(true)
  })

  it('opens heat_lava and refractory_lining together on arriving at planet 8 (#96)', () => {
    const pair = LOCKED_SCHEDULE.rows.filter((row) => row.planetIndex === 8)
    expect(pair.map((row) => [row.id, row.bind])).toEqual([
      ['heat_lava', 'planet_gate'],
      ['refractory_lining', 'planet_gate'],
    ])
    expect(pair.map((row) => isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: 7 }))).toEqual([
      false,
      false,
    ])
    expect(pair.map((row) => isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: 8 }))).toEqual([
      true,
      true,
    ])
  })

  it('marks the six built campaign module rows shipped in the locked file (#127)', () => {
    const built = LOCKED_SCHEDULE.rows.filter((row) => BUILT_BEFORE_SHIPPED_IN_FILE.has(row.id))
    expect(built.map((row) => [row.id, row.status])).toEqual(
      [...BUILT_BEFORE_SHIPPED_IN_FILE].map((id) => [id, 'shipped']),
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

  it('marks the three dock add-on facility rows shipped in the locked file (#222)', () => {
    const addOnRows = ['scanner_station', 'research_lab', 'drone_bay']
    const rows = LOCKED_SCHEDULE.rows.filter((row) => addOnRows.includes(row.id))
    expect(rows.map((row) => [row.id, row.planetIndex, row.bind, row.status])).toEqual([
      ['scanner_station', 14, 'facility', 'shipped'],
      ['research_lab', 15, 'facility', 'shipped'],
      ['drone_bay', 20, 'facility', 'shipped'],
    ])
  })

  it('opens the remote_detonator row at planet 22 now the dynamite slice ships the plunger (#149)', () => {
    const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === 'remote_detonator')!
    expect(row).toMatchObject({ planetIndex: 22, bind: 'planet_gate', status: 'shipped' })
    expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: 21 })).toBe(false)
    expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: 22 })).toBe(true)
  })

  it.each([
    ['shields', 22],
    ['grav_anchor', 32],
    ['buoyancy_tanks', 34],
    ['escape_thrusters', 37],
  ] as const)(
    'opens the %s row at planet %i now the mobility slice ships its node (ticket 204)',
    (id, planetIndex) => {
      const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === id)!
      expect(row).toMatchObject({ planetIndex, status: 'shipped' })
      expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: planetIndex - 1 })).toBe(false)
      expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: planetIndex })).toBe(true)
    },
  )

  it('opens the magnetic_planets row at planet 25 now planet-mix ships the class (ticket 289)', () => {
    const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === 'magnetic_planets')!
    expect(row).toMatchObject({ planetIndex: 25, bind: 'planet_gate', status: 'shipped' })
    expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: 24 })).toBe(false)
    expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: 25 })).toBe(true)
  })

  it('changed only magnetic_planets.status in the flip, leaving grounded_lining a vision row', () => {
    const text = textBeforeBoreGunRow(
      textBeforeCementScopeNote(textBeforeJumpDriveRow(fileTextBeforeKitRows())),
    )
    const row = text.indexOf('"id": "magnetic_planets"')
    const rowEnd = text.indexOf('}', row)
    const unflipped =
      text.slice(0, row) +
      text.slice(row, rowEnd).replace('"status": "shipped"', '"status": "vision"') +
      text.slice(rowEnd)
    expect(createHash('sha256').update(unflipped, 'utf8').digest('hex')).toBe(
      PIN_BEFORE_MAGNETIC_FLIP,
    )
    const lining = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === 'grounded_lining')!
    expect(lining).toMatchObject({ planetIndex: 25, status: 'vision' })
  })

  it('added only the bore_gun row, the counts it moves and its provenance in ticket 313 (#309)', () => {
    const before = textBeforeBoreGunRow(
      textBeforeCementScopeNote(textBeforeJumpDriveRow(fileTextBeforeKitRows())),
    )
    expect(createHash('sha256').update(before, 'utf8').digest('hex')).toBe(PIN_BEFORE_BORE_GUN_ROW)
  })

  it('added only the jump_drive row, the counts it moves and its provenance in ticket 759 (#650)', () => {
    const before = textBeforeJumpDriveRow(fileTextBeforeKitRows())
    expect(createHash('sha256').update(before, 'utf8').digest('hex')).toBe(
      PIN_BEFORE_JUMP_DRIVE_ROW,
    )
  })

  it('flipped only the built rows to shipped, re-pinned blasting_charges and added blast_rock in ticket 900', () => {
    const before = textBeforeStatsRefresh(lockedFileText())
    expect(createHash('sha256').update(before, 'utf8').digest('hex')).toBe(PIN_BEFORE_STATS_REFRESH)
  })

  it('moved only merchants to planet 1 and added the five kit rows, their counts and provenance in ticket 823', () => {
    const before = fileTextBeforeKitRows()
    expect(createHash('sha256').update(before, 'utf8').digest('hex')).toBe(PIN_BEFORE_KIT_ROWS)
  })

  it('opens each shipped kit row on arriving at its home planet in the Merchant lane (ticket 823)', () => {
    for (const [id, planetIndex] of KIT_ROW_PLANETS) {
      const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === id)!
      expect(row).toMatchObject({
        planetIndex,
        lane: 'Merchant',
        bind: 'planet_gate',
        status: 'shipped',
        progressionAxis: 'horizontal',
      })
      expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: planetIndex - 1 })).toBe(false)
      expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: planetIndex })).toBe(true)
    }
  })

  it('opens the shipped merchants row on planet 1 only once a dock facility builds it (ticket 823)', () => {
    const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === 'merchants')!
    expect(row).toMatchObject({ planetIndex: 1, bind: 'facility', status: 'shipped' })
    expect(isUnlocked(row, NO_PROGRESS)).toBe(false)
    expect(isUnlocked(row, { ...NO_PROGRESS, builtFacilityRowIds: new Set([row.id]) })).toBe(true)
  })

  it("opens the shipped jump_drive row at planet 5, the first system's last planet (#650)", () => {
    const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === 'jump_drive')!
    expect(row).toMatchObject({
      planetIndex: 5,
      lane: 'Upgrade',
      bind: 'planet_gate',
      status: 'shipped',
      progressionAxis: 'horizontal',
    })
    expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: 4 })).toBe(false)
    expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: 5 })).toBe(true)
  })

  it('added only the casing_cement scopeNote in ticket 367 (#367 ruling B)', () => {
    const text = textBeforeJumpDriveRow(fileTextBeforeKitRows())
    expect(text).toContain(CEMENT_SCOPE_NOTE_EDIT[1])
    const before = textBeforeCementScopeNote(text)
    expect(createHash('sha256').update(before, 'utf8').digest('hex')).toBe(
      PIN_BEFORE_CEMENT_SCOPE_NOTE,
    )
  })

  it('opens the shipped bore_gun row on planet 1, in the Upgrade lane, pushing no other P1 row (#309)', () => {
    const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === 'bore_gun')!
    expect(row).toMatchObject({
      planetIndex: 1,
      lane: 'Upgrade',
      bind: 'planet_gate',
      status: 'shipped',
    })
    expect(isUnlocked(row, NO_PROGRESS)).toBe(true)
    const laterP1Rows = new Set(['merchants', 'cache_crate', 'blasting_charges'])
    const rowsBeforeKits = rowsAt(LOCKED_SCHEDULE, 1).filter(
      (candidate) => !laterP1Rows.has(candidate.id),
    )
    expect(rowsBeforeKits).toHaveLength(15)
  })

  it('opens the side_drills row at planet 13 now the drill-gear slice ships its node (ticket 205)', () => {
    const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === 'side_drills')!
    expect(row).toMatchObject({ planetIndex: 13, status: 'shipped' })
    expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: 12 })).toBe(false)
    expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: 13 })).toBe(true)
  })

  it('opens the blasting_charges row on planet 1, its price-band anchor since ticket 900 (#863)', () => {
    const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === 'blasting_charges')!
    expect(row).toMatchObject({
      planetIndex: 1,
      bind: 'planet_gate',
      progressionAxis: 'horizontal',
      status: 'shipped',
    })
    expect(isUnlocked(row, NO_PROGRESS)).toBe(true)
  })

  it('opens the planned blast_rock row at planet 7 in the Environment lane (ticket 900)', () => {
    const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === 'blast_rock')!
    expect(row).toMatchObject({
      planetIndex: BLAST_ROCK_PLANET,
      lane: 'Environment',
      bind: 'planet_gate',
      progressionAxis: 'horizontal',
      status: 'planned',
    })
    const beforeIt = { ...NO_PROGRESS, highestPlanetIndex: BLAST_ROCK_PLANET - 1 }
    expect(isUnlocked(row, beforeIt)).toBe(false)
    expect(isUnlocked(row, { ...NO_PROGRESS, highestPlanetIndex: BLAST_ROCK_PLANET })).toBe(true)
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

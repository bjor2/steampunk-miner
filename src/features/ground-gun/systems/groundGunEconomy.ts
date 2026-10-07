/**
 * The armoury's numbers from `groundGun.json` (ticket 322, the Systems values under the GD
 * decisions on #309 and #310): the bore's fixed numbers, the three store tracks as a gap to a
 * wall with their planet-tied prices, the long barrel's hold absorber, the auto-shoot reserve, the
 * bot's shot floor, the turret's cap and Content's module placeholders. The file is refused whole
 * on any problem, like the kernel's economy file, so a stand-in never reaches a formula.
 */
import type { Money } from '../../../systems/money'
import {
  createFieldReader,
  readIntegerList,
  readLiteral,
  type FieldReader,
} from '../../../systems/economy/economyFieldReader'
import GROUND_GUN_FILE from '../groundGun.json'

/** The bore as #309 fixed it, with the GD's 10-cell cap and the Vertical Scaler's shot budget. */
export interface BoreNumbers {
  /** Cells the bore reaches at L1, before any long-barrel Mark. */
  boreRangeBase: number
  /** The TD's hard cap: if it can hit it, you can see it. */
  rangeCap: number
  openIntervalTicks: number
  /** Ticks the bored line stands before its blocks are checked. */
  collapseHoldTicks: number
  /** Dig-function ticks one shot may spend (`gun.shotDigTicks`). */
  shotDigTicks: number
}

/** A track stat as `wall + perGap * gap`: the wall is reached as the gap closes to 0. */
export interface TrackStatRule {
  wall: number
  perGap: number
}

/** A level's price: `oreUnits` of band-`band` ore at its target planet, more on a repeat planet. */
export interface TrackPrice {
  band: number
  oreUnits: Money
  /** The factor on a second level whose target planet is the previous level's. */
  samePlanetRatio: Money
}

export interface GunTrack<Stat extends string> {
  /** The gap at L1; L1's stats are the walls plus `perGap * gap0`. */
  gap0: number
  stats: Readonly<Record<Stat, TrackStatRule>>
  price: TrackPrice
  /** Level L's planet at `targetPlanet[L - 1]`; one entry per level, so the length is the wall. */
  targetPlanet: readonly number[]
}

export type RateStat = 'kGunPct' | 'cooldownTicks'
export type PenetrationStat = 'gunFactorPct'
export type EnergyStat = 'energyPerCellPct'

export interface GunTracks {
  rate: GunTrack<RateStat>
  penetration: GunTrack<PenetrationStat>
  energy: GunTrack<EnergyStat>
}

export type GunTrackId = keyof GunTracks

export const GUN_TRACK_IDS: readonly GunTrackId[] = ['rate', 'penetration', 'energy']

/** Past the range cap, each long-barrel Mark adds `holdStep` ticks to the hold, up to `holdCap`. */
export interface LongBarrelNumbers {
  holdStep: number
  holdCap: number
}

export interface AutoShootNumbers {
  /** Auto holds unless the tank after the shot stays this far above the rescue floor. */
  reserveAboveRescueBp: number
  /** The target is locked this long before the shot; never shortened by a Mark. */
  previewTicks: number
  /** The sear's wait after a manual shot never masters below this (GD). */
  manualWaitFloorTicks: number
}

export interface BotNumbers {
  /** Shots the forced-gun run must fire per planet run per seed, a floor that proves it fires. */
  minShots: number
}

export interface TurretNumbers {
  /** The auto_guns range cap in tiles (TD): extended barrels stop here. */
  gunRangeCap: number
  /** The stat later extended-barrel Marks step inside the existing caps. */
  pastCapStat: 'energyPerShot'
}

/** Which of a module's stats each Mark role of the tree's rotation steps. */
export interface ModuleMarkRoles {
  isIncomeItem: boolean
  cooldown?: string
  magnitude?: string
  charges?: string
}

/** One module's Mark 1 numbers, keyed by Content's placeholder names, and what its Marks step. */
export interface ArmouryModule {
  marks: ModuleMarkRoles
  stats: Readonly<Record<string, number>>
}

export interface GroundGunEconomy {
  bore: BoreNumbers
  tracks: GunTracks
  longBarrel: LongBarrelNumbers
  autoShoot: AutoShootNumbers
  bot: BotNumbers
  turret: TurretNumbers
  modules: Readonly<Record<string, ArmouryModule>>
  combos: Readonly<Record<string, Readonly<Record<string, number>>>>
}

const RATE_STATS: readonly RateStat[] = ['kGunPct', 'cooldownTicks']
const PENETRATION_STATS: readonly PenetrationStat[] = ['gunFactorPct']
const ENERGY_STATS: readonly EnergyStat[] = ['energyPerCellPct']
const MARK_ROLES = ['cooldown', 'magnitude', 'charges'] as const

export const GROUND_GUN: GroundGunEconomy = loadGroundGunEconomy(GROUND_GUN_FILE)

/** Every problem with the file, or the numbers when it has none. */
export function readGroundGunEconomy(
  raw: unknown,
): { economy: GroundGunEconomy } | { problems: string[] } {
  const reader = createFieldReader()
  const file = reader.object('file', raw)
  const tracks = reader.object('tracks', file.tracks)
  const economy: GroundGunEconomy = {
    bore: readBore(reader, file.bore),
    tracks: {
      rate: readTrack(reader, 'tracks.rate', tracks.rate, RATE_STATS),
      penetration: readTrack(reader, 'tracks.penetration', tracks.penetration, PENETRATION_STATS),
      energy: readTrack(reader, 'tracks.energy', tracks.energy, ENERGY_STATS),
    },
    longBarrel: readLongBarrel(reader, file.longBarrel),
    autoShoot: readAutoShoot(reader, file.autoShoot),
    bot: { minShots: reader.safeInteger('bot.minShots', reader.object('bot', file.bot).minShots) },
    turret: readTurret(reader, file.turret),
    modules: readRows(reader, 'modules', file.modules, readModule),
    combos: readRows(reader, 'combos', file.combos, readWholeStats),
  }
  return reader.problems.length > 0 ? { problems: reader.problems } : { economy }
}

function loadGroundGunEconomy(raw: unknown): GroundGunEconomy {
  const reading = readGroundGunEconomy(raw)
  if ('problems' in reading) {
    throw new Error(`groundGun.json is refused:\n${reading.problems.join('\n')}`)
  }
  return reading.economy
}

function readBore(reader: FieldReader, raw: unknown): BoreNumbers {
  const bore = reader.object('bore', raw)
  return {
    boreRangeBase: reader.safeInteger('bore.boreRangeBase', bore.boreRangeBase),
    rangeCap: reader.safeInteger('bore.rangeCap', bore.rangeCap),
    openIntervalTicks: reader.safeInteger('bore.openIntervalTicks', bore.openIntervalTicks),
    collapseHoldTicks: reader.safeInteger('bore.collapseHoldTicks', bore.collapseHoldTicks),
    shotDigTicks: reader.safeInteger('bore.shotDigTicks', bore.shotDigTicks),
  }
}

function readTrack<Stat extends string>(
  reader: FieldReader,
  path: string,
  raw: unknown,
  statNames: readonly Stat[],
): GunTrack<Stat> {
  const track = reader.object(path, raw)
  const stats = reader.object(`${path}.stats`, track.stats)
  return {
    gap0: reader.safeInteger(`${path}.gap0`, track.gap0),
    stats: Object.fromEntries(
      statNames.map((name) => [name, readStatRule(reader, `${path}.stats.${name}`, stats[name])]),
    ) as Record<Stat, TrackStatRule>,
    price: readTrackPrice(reader, `${path}.price`, track.price),
    targetPlanet: readIntegerList(reader, `${path}.targetPlanet`, track.targetPlanet),
  }
}

function readStatRule(reader: FieldReader, path: string, raw: unknown): TrackStatRule {
  const rule = reader.object(path, raw)
  return {
    wall: reader.safeInteger(`${path}.wall`, rule.wall),
    perGap: reader.safeInteger(`${path}.perGap`, rule.perGap),
  }
}

function readTrackPrice(reader: FieldReader, path: string, raw: unknown): TrackPrice {
  const price = reader.object(path, raw)
  return {
    band: reader.safeInteger(`${path}.band`, price.band),
    oreUnits: reader.money(`${path}.oreUnits`, price.oreUnits),
    samePlanetRatio: reader.money(`${path}.samePlanetRatio`, price.samePlanetRatio),
  }
}

function readLongBarrel(reader: FieldReader, raw: unknown): LongBarrelNumbers {
  const barrel = reader.object('longBarrel', raw)
  return {
    holdStep: reader.safeInteger('longBarrel.holdStep', barrel.holdStep),
    holdCap: reader.safeInteger('longBarrel.holdCap', barrel.holdCap),
  }
}

function readAutoShoot(reader: FieldReader, raw: unknown): AutoShootNumbers {
  const auto = reader.object('autoShoot', raw)
  return {
    reserveAboveRescueBp: reader.safeInteger(
      'autoShoot.reserveAboveRescueBp',
      auto.reserveAboveRescueBp,
    ),
    previewTicks: reader.safeInteger('autoShoot.previewTicks', auto.previewTicks),
    manualWaitFloorTicks: reader.safeInteger(
      'autoShoot.manualWaitFloorTicks',
      auto.manualWaitFloorTicks,
    ),
  }
}

function readTurret(reader: FieldReader, raw: unknown): TurretNumbers {
  const turret = reader.object('turret', raw)
  return {
    gunRangeCap: reader.safeInteger('turret.gunRangeCap', turret.gunRangeCap),
    pastCapStat: readLiteral(reader, 'turret.pastCapStat', turret.pastCapStat, ['energyPerShot']),
  }
}

function readModule(reader: FieldReader, path: string, raw: unknown): ArmouryModule {
  const module = reader.object(path, raw)
  const stats = readWholeStats(reader, `${path}.stats`, module.stats)
  const marks = readMarkRoles(reader, `${path}.marks`, module.marks)
  MARK_ROLES.map((role) => marks[role])
    .filter((stat): stat is string => stat !== undefined && !(stat in stats))
    .forEach((stat) => reader.record(`${path}.marks names ${stat}, which ${path}.stats lacks`))
  return { marks, stats }
}

function readMarkRoles(reader: FieldReader, path: string, raw: unknown): ModuleMarkRoles {
  const marks = reader.object(path, raw)
  const isIncomeItem = marks.isIncomeItem
  if (typeof isIncomeItem !== 'boolean') reader.record(`${path}.isIncomeItem must be a boolean`)
  return {
    isIncomeItem: isIncomeItem === true,
    ...Object.fromEntries(
      MARK_ROLES.filter((role) => role in marks).map((role) => [
        role,
        reader.text(`${path}.${role}`, marks[role]),
      ]),
    ),
  }
}

function readWholeStats(
  reader: FieldReader,
  path: string,
  raw: unknown,
): Readonly<Record<string, number>> {
  const stats = reader.object(path, raw)
  return Object.fromEntries(
    Object.entries(stats).map(([name, value]) => [
      name,
      reader.safeInteger(`${path}.${name}`, value),
    ]),
  )
}

function readRows<Row>(
  reader: FieldReader,
  path: string,
  raw: unknown,
  readRow: (reader: FieldReader, path: string, raw: unknown) => Row,
): Readonly<Record<string, Row>> {
  const rows = reader.object(path, raw)
  return Object.fromEntries(
    Object.entries(rows).map(([id, row]) => [id, readRow(reader, `${path}.${id}`, row)]),
  )
}

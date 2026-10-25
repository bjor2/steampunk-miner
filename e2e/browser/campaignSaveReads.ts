/**
 * The reads of the mid-campaign save trip (ticket 857, `campaignSaveTrip.ts`): the session's
 * snapshot and looks through `steampunkDebug`, what each planet keeps while the session is away as
 * exact JSON text, the casing rings and crates the fixture placed, the fuel the trip back burns
 * as the jump rules charge it, and the run log's lines. Money and fuel stay canonical text and are
 * compared through `systems/money`, never through a double.
 */
import { expect, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import { corePlanetKeyOf } from '../../src/systems/authority/planetCoreBays'
import type { PortableState, SessionSnapshot } from '../../src/systems/authority/sessionSnapshot'
import { jumpFuelUnitsOf } from '../../src/systems/economy/jumpFuel'
import {
  add,
  cmp,
  fromCanonical,
  sub,
  toCanonical,
  ZERO_MONEY,
  type BigStat,
} from '../../src/systems/money'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
    steampunkRunLog?: () => string
  }
}

/** The planet the save is cut on, and the trip after the reload. */
export const SAVED_PLANET = 3
export const TRIP_BACK = [4, 5, 1] as const

/** 2^53 as canonical money text: the wallet must sit above it (VS on #857). */
const TWO_TO_THE_53 = '9.007199254740992e+15'
/** The vehicle part report's look fields: derived from the levels, never saved (HS on #857). */
const LOOK_FIELDS = ['visualTier', 'partIds', 'lookPartIds', 'poses', 'mounted', 'requestedAttach']
const CONTAINERS_SECTION = 'planet-kit.containers'
const WAIT_FOR_LINE_MS = 30_000

/** The rig's looks as the art reads them from the levels. */
export interface RigLooks {
  visualTier: number
  partIds: string[]
  lookPartIds: string[]
}

/** The state a planet keeps while the session is away, each as the exact JSON text. */
export interface PlanetKeep {
  coreBays: string
  containers: string
  premiumLedger: string
}

/** A placed crate as the fixture checks it: who owns it, who may open it, what it holds. */
export interface CrateRow {
  kind: string
  ownerId: string
  access: string
  cargo: { ore: Record<string, number> }
  premium?: unknown[]
}

export function readSnapshot(page: Page): Promise<SessionSnapshot> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.snapshot()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.snapshot
  })
}

export function readLooks(page: Page): Promise<RigLooks> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.vehicleParts()
    if (!result.ok) throw new Error(result.problems.join('; '))
    const { visualTier, partIds, lookPartIds } = result
    return { visualTier, partIds, lookPartIds }
  })
}

export function playerIdOf(snapshot: SessionSnapshot): string {
  return Object.keys(snapshot.state.players)[0]
}

export function playerOf(snapshot: SessionSnapshot) {
  return snapshot.state.players[playerIdOf(snapshot)]
}

export function vehicleOfSnapshot(snapshot: SessionSnapshot) {
  return playerOf(snapshot).vehicle
}

/** What every planet keeps while the session is away, as exact JSON text. */
export function planetKeepOf(snapshot: SessionSnapshot): PlanetKeep {
  return {
    coreBays: JSON.stringify(coreBaysByPlanetOf(snapshot.state)),
    containers: JSON.stringify(snapshot.state.slices?.[CONTAINERS_SECTION] ?? null),
    premiumLedger: JSON.stringify(playerOf(snapshot).premiumLedger ?? null),
  }
}

/** Every planet's banked bay, the session's own under its `s:p` too, in key order. */
export function coreBaysByPlanetOf(state: PortableState): [string, unknown][] {
  const here = { fragments: state.platform.coreBay, isCompleted: state.core.isCompleted }
  const bays = { ...state.platform.awayCoreBays, [corePlanetKeyOf(state.planet)]: here }
  return Object.entries(bays).sort(([a], [b]) => a.localeCompare(b))
}

/** Each chunk's casing cells (grade and lining bits), for the chunks that have any. */
export function casingRingsOf(snapshot: SessionSnapshot): [string, readonly number[]][] {
  return Object.entries(snapshot.state.world.chunks)
    .filter(([, delta]) => delta.casing.some((cell) => cell !== 0))
    .map(([key, delta]) => [key, delta.casing])
}

/** The placed crates by planet `s:p`. */
export function cratesByPlanetOf(snapshot: SessionSnapshot): Record<string, CrateRow[]> {
  return Object.fromEntries(
    Object.entries(containersBodyOf(snapshot)).map(([planet, { byId }]) => [
      planet,
      Object.values(byId),
    ]),
  )
}

/** The id the session planet's next crate takes: 1 on a planet with none yet. */
export function nextContainerIdOf(snapshot: SessionSnapshot): number {
  return containersBodyOf(snapshot)[corePlanetKeyOf(snapshot.state.planet)]?.nextContainerId ?? 1
}

/** The fuel the trip back burns, unit for unit as the jump rules charge it. */
export function tripFuelUnits(): BigStat {
  const legs = [SAVED_PLANET, ...TRIP_BACK]
  return legs
    .slice(1)
    .reduce((units, to, leg) => add(units, jumpFuelUnitsOf(legs[leg], to)), ZERO_MONEY)
}

/** The saved fuel less the trip, as canonical text. */
export function fuelAfterTheTrip(saved: SessionSnapshot): string {
  return toCanonical(sub(fuelOfText(vehicleOfSnapshot(saved).fuel), tripFuelUnits()))
}

export function fuelOfText(fuel: string | undefined): BigStat {
  return fuel === undefined ? ZERO_MONEY : fromCanonical(fuel)
}

/** Whether `wallet` is above 2^53, compared as decimal text, never as a double. */
export function isAboveTwoToThe53(wallet: string): boolean {
  return cmp(fromCanonical(wallet), fromCanonical(TWO_TO_THE_53)) > 0
}

/** The look fields found anywhere under `value`; a saved vehicle holds levels, never looks. */
export function lookFieldsIn(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, inner]) => [
    ...(LOOK_FIELDS.includes(key) ? [key] : []),
    ...lookFieldsIn(inner),
  ])
}

/** The run log's refused commands, type and reason: the setup expects none. */
export async function rejectedCommandsOf(page: Page): Promise<string[]> {
  return (await logLinesOf(page))
    .filter((line) => line.event === 'command_rejected')
    .map((line) => `${String(line.data.type)}: ${String(line.data.reason)}`)
}

/** Until the run logs a save written at `digest`: that file, not an earlier queued write. */
export async function waitForSavedDigest(page: Page, digest: string): Promise<void> {
  await expect
    .poll(async () => isSavedAt(await logLinesOf(page), digest), { timeout: WAIT_FOR_LINE_MS })
    .toBe(true)
}

function isSavedAt(lines: readonly LogLine[], digest: string): boolean {
  return lines.some((line) => line.event === 'checkpoint_saved' && line.data.digest === digest)
}

/** A `checkpoint_loaded` after the run's `save_imported`: the file, not a start-up resume. */
export async function waitForImportedLoad(page: Page): Promise<void> {
  await expect
    .poll(async () => isLoadedAfterImport((await logLinesOf(page)).map((line) => line.event)), {
      timeout: WAIT_FOR_LINE_MS,
    })
    .toBe(true)
}

function isLoadedAfterImport(events: readonly string[]): boolean {
  const imported = events.lastIndexOf('save_imported')
  return imported >= 0 && events.indexOf('checkpoint_loaded', imported) > imported
}

interface PlanetContainersBody {
  nextContainerId: number
  byId: Record<string, CrateRow>
}

function containersBodyOf(snapshot: SessionSnapshot): Record<string, PlanetContainersBody> {
  const section = snapshot.state.slices?.[CONTAINERS_SECTION]
  return (section?.body ?? {}) as Record<string, PlanetContainersBody>
}

interface LogLine {
  event: string
  data: Record<string, unknown>
}

async function logLinesOf(page: Page): Promise<LogLine[]> {
  const text = await page.evaluate(() => window.steampunkRunLog!())
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as LogLine)
}

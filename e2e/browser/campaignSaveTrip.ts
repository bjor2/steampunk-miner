/**
 * A mid-campaign save, reload and trip back (ticket 857, the TD's audit gap of 25 Oct), shared by
 * the desktop and phone specs. A fresh save makes progress on P1, P2 and P3: a shaft carved and a
 * casing ring lined, fragments in the planet's core bay, and a Cache Crate dropped with the hold's
 * premium ledger counts (#844); on P3 the hold is loaded and counted again, so the save carries a
 * ledger. The rig jumps on through the star map and saves docked at P3. The save is exported, the
 * game reloaded and the file imported; then the rig jumps P3 -> P4 -> P5 -> P1 on carried fuel.
 *
 * What a planet keeps while the session is away (its core bay by `s:p`, the placed crates with
 * cargo, owner and access, the player's premium ledger) must come back byte for byte, and the
 * wallet and the fuel match exactly. A left planet's ground is regenerated on landing
 * (`planetEntry.ts`), so the casing ring's grade and lining are judged across the reload, where
 * P3's world is the save's. The wallet sits above 2^53 and one ledger origin's system is past any
 * double (1e320), both crossing the file as canonical text, never a float (VS on #857).
 *
 * The setup's commands are authority commands on exact ticks (`fastForward`), with the scenario
 * calls (`debug.*`) for the crate's source cargo, the ledger counts, the bay and the shaft; the
 * jumps are the star map's controls pressed as the profile presses them. State through the DOM,
 * `steampunkDebug` and the run log, never pixels.
 */
import type { Page } from '@playwright/test'
import { UP_VECTOR_SCALE } from '../../src/constants/physics'
import type { SessionSnapshot } from '../../src/systems/authority/sessionSnapshot'
import { fuelTankCapacityOf } from '../../src/systems/economy/fuelTank'
import type { ScriptedCommand } from '../../src/systems/fastForward'
import { cmp, sub, toSafeInteger, type BigStat } from '../../src/systems/money'
import { tileOfPose } from '../../src/systems/vehicle/vehiclePose'
import {
  fuelOfText,
  nextContainerIdOf,
  playerIdOf,
  readLooks,
  readSnapshot,
  tripFuelUnits,
  SAVED_PLANET,
  TRIP_BACK,
  vehicleOfSnapshot,
  waitForImportedLoad,
  waitForSavedDigest,
  type RigLooks,
} from './campaignSaveReads'
import { dockAt } from './screens/screenHelpers'
import {
  buyFuelAndJumpTo,
  jumpOnCarriedFuelTo,
  openStarMapFromTheBay,
  type Press,
} from './starMapJumps'

/** Above 2^53, with more figures than a double keeps (VS on #857). */
const BIG_WALLET_GRANT = '9007199254740993123'
/** A system index past `Number.MAX_VALUE`: a ledger origin no double can hold. */
export const FAR_SYSTEM = `1${'0'.repeat(320)}`
/** Test data: no slice registers a premium species yet (#821), and the ledger checks none. */
const PREMIUM_SPECIES = 'e2e-premium-ore'
const PREMIUM_TIER = 1
const CACHE_CRATE = 'cache_crate'
/** A hold roomy enough for each crate's cargo, and a track whose look the rig shows. */
const SEEDED_LEVELS = { cargo_hold: 20, engine: 20 } as const

/** The shaft carved below the docked rig and its ring, as the screen-layout spec lays one. */
const SHAFT_DROP_MM = 5000
const SHAFT_RADIUS_MM = 900
const SHAFT_DENSITY = 255
const RING_GRADE = 2

/** What each planet of the campaign gets before the rig jumps on. */
export interface PlanetProgress {
  planet: number
  coreFragments: number
  crateOre: number
  premiumUnits: number
}

export const CAMPAIGN: readonly PlanetProgress[] = [
  { planet: 1, coreFragments: 2, crateOre: 6, premiumUnits: 3 },
  { planet: 2, coreFragments: 1, crateOre: 5, premiumUnits: 2 },
  { planet: 3, coreFragments: 3, crateOre: 4, premiumUnits: 4 },
]

/** The hold P3 saves with: fresh units counted from three origins, one past any double. */
const HELD_ORE = 6
const HELD_PREMIUM: Readonly<Record<string, string>> = {
  [premiumKeyOf('1', 1)]: '1',
  [premiumKeyOf('1', 3)]: '2',
  [premiumKeyOf(FAR_SYSTEM, 1)]: '1',
}

/**
 * A command as `fastForward` submits it, without its tick. Loose, because the slices' commands
 * (`planet-kit.*`) augment `CommandPayloads` from modules this graph never loads; the authority
 * checks every payload.
 */
interface ScriptedIntent {
  type: string
  payload: Readonly<Record<string, unknown>>
}

/** The saved session: its snapshot as the save was cut, the file's text and the rig's looks. */
export interface CampaignSave {
  snapshot: SessionSnapshot
  exported: string
  looks: RigLooks
}

/** P1 to P3 with progress on each, P3's hold loaded, the tank filled, and the save cut at P3. */
export async function playCampaignToTheSave(page: Page, press: Press): Promise<CampaignSave> {
  await seedCampaignStart(page)
  await makeProgressAcrossTheCampaign(page, press)
  await loadHoldWithPremium(page)
  await fillTankForTheTrip(page)
  return saveAtTheDock(page)
}

/** The start: the big wallet, the seeded levels, and enemies held still for the whole run. */
async function seedCampaignStart(page: Page): Promise<void> {
  await page.evaluate(
    ({ grant, levels }) => {
      const debug = window.steampunkDebug!
      const results = [
        debug.freezeEnemies(true),
        debug.giveMoney(grant),
        ...Object.entries(levels).map(([track, level]) => debug.setUpgrade(track, level)),
      ]
      for (const result of results) if (!result.ok) throw new Error(result.problems.join('; '))
    },
    { grant: BIG_WALLET_GRANT, levels: SEEDED_LEVELS },
  )
}

/** Each campaign planet's progress, jumping on to the next until the saved planet. */
async function makeProgressAcrossTheCampaign(page: Page, press: Press): Promise<void> {
  for (const progress of CAMPAIGN) {
    await makeProgressOn(page, progress)
    if (progress.planet < SAVED_PLANET) await jumpOnTo(page, progress.planet + 1, press)
  }
}

/**
 * On the session's planet: out on the pad, a crate's worth of ore taken into the hold and counted
 * premium, the hold dropped as a Cache Crate, fragments banked and a lined shaft cut.
 */
async function makeProgressOn(page: Page, progress: PlanetProgress): Promise<void> {
  const snapshot = await readSnapshot(page)
  const counts = { [premiumKeyOf('1', progress.planet)]: String(progress.premiumUnits) }
  await playCommands(page, [
    ...undockedCommandsOf(snapshot),
    ...holdLoadCommandsOf(snapshot, progress.crateOre, counts),
    { type: 'planet-kit.drop_container', payload: { kind: CACHE_CRATE } },
    { type: 'debug.setCoreFragments', payload: { count: progress.coreFragments } },
    ...linedShaftCommandsOf(snapshot),
  ])
}

/** Docked at the Sell bay, the next planet's fuel bought and the jump made on the star map. */
async function jumpOnTo(page: Page, place: number, press: Press): Promise<void> {
  await dockAt(page, 'sell')
  await openStarMapFromTheBay(page, press)
  await buyFuelAndJumpTo(page, place, press)
}

/** P3's hold loaded and counted again, so the save carries a premium ledger. */
async function loadHoldWithPremium(page: Page): Promise<void> {
  const snapshot = await readSnapshot(page)
  await playCommands(page, [
    ...undockedCommandsOf(snapshot),
    ...holdLoadCommandsOf(snapshot, HELD_ORE, HELD_PREMIUM),
  ])
}

/** At the Sell bay, the tank levels and fuel for the whole trip back, bought before the save. */
async function fillTankForTheTrip(page: Page): Promise<void> {
  await dockAt(page, 'sell')
  const vehicle = vehicleOfSnapshot(await readSnapshot(page))
  const fromLevel = vehicle.fuelTankLevel ?? 1
  const level = tankLevelHolding(tripFuelUnits(), fromLevel)
  const units = toSafeInteger(sub(fuelTankCapacityOf(level), fuelOfText(vehicle.fuel)))
  await playCommands(page, [
    ...Array.from({ length: level - fromLevel }, () => ({ type: 'buyFuelTank', payload: {} })),
    { type: 'buyFuel', payload: { units } },
  ])
}

/**
 * The step held, the autosave written as the page hides (docked, so it writes) at the held
 * state's digest, and the file Export would hand over read back; the step runs again after.
 */
async function saveAtTheDock(page: Page): Promise<CampaignSave> {
  await runDebug(page, 'pause')
  const snapshot = await readSnapshot(page)
  const looks = await readLooks(page)
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await waitForSavedDigest(page, snapshot.digest)
  const exported = await exportText(page)
  await runDebug(page, 'resume')
  return { snapshot, exported, looks }
}

/** The exported file imported as a picked file is; answers the loaded session, held still. */
export async function importSave(page: Page, exported: string): Promise<SessionSnapshot> {
  await page.evaluate((text) => {
    const result = window.steampunkDebug!.saves.importText(text)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, exported)
  await waitForImportedLoad(page)
  await runDebug(page, 'pause')
  const loaded = await readSnapshot(page)
  await runDebug(page, 'resume')
  return loaded
}

/** From the saved planet back across the system on carried fuel: P4, P5, then P1. */
export async function travelBack(page: Page, press: Press): Promise<void> {
  await dockAt(page, 'sell')
  for (const place of TRIP_BACK) {
    await openStarMapFromTheBay(page, press)
    await jumpOnCarriedFuelTo(page, place, press)
  }
}

function premiumKeyOf(system: string, place: number): string {
  return `${PREMIUM_TIER}:${system}:${place}:${PREMIUM_SPECIES}`
}

function undockedCommandsOf(snapshot: SessionSnapshot): ScriptedIntent[] {
  return vehicleOfSnapshot(snapshot).mode === 'docked' ? [{ type: 'undock', payload: {} }] : []
}

/**
 * A scenario's crate of `ore` units at the rig's cell, picked up whole into the hold, and the
 * hold's units counted premium as `counts` says.
 */
function holdLoadCommandsOf(
  snapshot: SessionSnapshot,
  ore: number,
  counts: Readonly<Record<string, string>>,
): ScriptedIntent[] {
  const crate = {
    kind: CACHE_CRATE,
    ownerId: playerIdOf(snapshot),
    ...tileOfPose(posedOf(snapshot)),
    ore: { [String(PREMIUM_TIER)]: String(ore) },
    coreFragments: 0,
  }
  return [
    { type: 'debug.planet-kit.placeContainer', payload: crate },
    { type: 'planet-kit.pickup_container', payload: { containerId: nextContainerIdOf(snapshot) } },
    { type: 'debug.setPremiumLedger', payload: { counts } },
  ]
}

/** A shaft below the docked rig, down its own up vector (the planet is round), and lined. */
function linedShaftCommandsOf(snapshot: SessionSnapshot): ScriptedIntent[] {
  const pose = posedOf(snapshot)
  const x = Math.round(pose.x - (pose.upx * SHAFT_DROP_MM) / UP_VECTOR_SCALE)
  const y = Math.round(pose.y - (pose.upy * SHAFT_DROP_MM) / UP_VECTOR_SCALE)
  return [
    {
      type: 'debug.carveCircle',
      payload: { x, y, radius: SHAFT_RADIUS_MM, amount: SHAFT_DENSITY },
    },
    { type: 'debug.lineCasing', payload: { x, y, grade: RING_GRADE } },
  ]
}

function posedOf(snapshot: SessionSnapshot) {
  const { pose } = vehicleOfSnapshot(snapshot)
  if (pose === null) throw new Error('the vehicle has no pose')
  return pose
}

/** The smallest tank level from `fromLevel` up that holds `units`. */
function tankLevelHolding(units: BigStat, fromLevel: number): number {
  let level = fromLevel
  while (cmp(fuelTankCapacityOf(level), units) < 0) level += 1
  return level
}

/** `intents` submitted in order on the next tick, the authority advanced over it. */
async function playCommands(page: Page, intents: readonly ScriptedIntent[]): Promise<void> {
  await page.evaluate((list) => {
    const debug = window.steampunkDebug!
    const snapshot = debug.snapshot()
    if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
    const tick = snapshot.snapshot.tick + 1
    const commands = list.map((intent) => ({ tick, ...intent })) as unknown as ScriptedCommand[]
    const played = debug.fastForward(1, commands)
    if (!played.ok) throw new Error(played.problems.join('; '))
  }, intents)
}

async function runDebug(page: Page, call: 'pause' | 'resume'): Promise<void> {
  await page.evaluate((name) => {
    const result = window.steampunkDebug![name]()
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, call)
}

function exportText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.saves.exportText()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.json
  })
}

/**
 * The judgements of the mid-campaign save trip (ticket 857, `campaignSaveTrip.ts`): the fixture
 * holds what the ticket names before anything is compared (so no comparison passes empty), the
 * import gives back the saved session, and the trip back to P1 finds every planet's keep as it was
 * saved, byte for byte, with the wallet unchanged and the fuel less exactly what the jumps burn.
 */
import { expect } from '@playwright/test'
import type { SessionSnapshot } from '../../src/systems/authority/sessionSnapshot'
import {
  casingRingsOf,
  coreBaysByPlanetOf,
  cratesByPlanetOf,
  fuelAfterTheTrip,
  isAboveTwoToThe53,
  lookFieldsIn,
  planetKeepOf,
  playerIdOf,
  playerOf,
  vehicleOfSnapshot,
  type RigLooks,
} from './campaignSaveReads'
import { CAMPAIGN, FAR_SYSTEM, type CampaignSave } from './campaignSaveTrip'

/** The saved file's player as it crosses JSON: the wallet text and the vehicle. */
interface SavedFile {
  digest: string
  profile: { players: Record<string, { wallet: string; vehicle: { levels: unknown } }> }
}

/** Every planet of the campaign as its stable `s:p` in system 1. */
const CAMPAIGN_KEYS = CAMPAIGN.map((progress) => `1:${progress.planet}`)

/**
 * The save holds the ticket's fixture: a bay, a crate (owner, access, cargo) on P1-P3, a ledger
 * with a far origin, a lined ring on P3, a wallet past 2^53 written as text a double would change,
 * and the vehicle's levels without any look field.
 */
export function expectSaveFixture(save: CampaignSave): void {
  const { snapshot } = save
  const file = JSON.parse(save.exported) as SavedFile
  const player = file.profile.players[playerIdOf(snapshot)]
  expect(file.digest).toBe(snapshot.digest)
  expect(coreBaysByPlanetOf(snapshot.state).map(([key]) => key)).toEqual(CAMPAIGN_KEYS)
  expectOwnedCrateOnEachPlanet(snapshot)
  expect(casingRingsOf(snapshot)).not.toEqual([])
  expect(playerOf(snapshot).premiumLedger?.map((count) => count.origin)).toContain(
    `${FAR_SYSTEM}:1`,
  )
  expect(save.exported).toContain(JSON.stringify(`${FAR_SYSTEM}:1`))
  expect(player.wallet).toBe(playerOf(snapshot).wallet)
  expect(isAboveTwoToThe53(player.wallet)).toBe(true)
  expect(Number(player.wallet).toExponential(), 'a double would change it').not.toBe(player.wallet)
  expect(player.vehicle.levels).toEqual(vehicleOfSnapshot(snapshot).levels)
  expect(lookFieldsIn(player.vehicle)).toEqual([])
}

/**
 * The import resumed the saved session: its digest, its world (the ring's grade and lining), the
 * wallet, the fuel, the levels, every planet's keep and the looks the levels give.
 */
export function expectImportedAsSaved(
  loaded: SessionSnapshot,
  looks: RigLooks,
  save: CampaignSave,
): void {
  const saved = save.snapshot
  expect(loaded.digest).toBe(saved.digest)
  expect(JSON.stringify(casingRingsOf(loaded))).toBe(JSON.stringify(casingRingsOf(saved)))
  expect(JSON.stringify(loaded.state.world)).toBe(JSON.stringify(saved.state.world))
  expect(playerOf(loaded).wallet).toBe(playerOf(saved).wallet)
  expect(vehicleOfSnapshot(loaded).fuel).toBe(vehicleOfSnapshot(saved).fuel)
  expect(vehicleOfSnapshot(loaded).levels).toEqual(vehicleOfSnapshot(saved).levels)
  expect(planetKeepOf(loaded)).toEqual(planetKeepOf(saved))
  expect(looks).toEqual(save.looks)
}

/** Back on P1 after P4 and P5: every planet's keep byte for byte, the wallet and fuel exact. */
export function expectKeptAfterTheTrip(back: SessionSnapshot, save: CampaignSave): void {
  const saved = save.snapshot
  expect(back.state.planet.index).toBe(1)
  expect(planetKeepOf(back)).toEqual(planetKeepOf(saved))
  expect(playerOf(back).wallet).toBe(playerOf(saved).wallet)
  expect(vehicleOfSnapshot(back).fuel).toBe(fuelAfterTheTrip(saved))
}

function expectOwnedCrateOnEachPlanet(snapshot: SessionSnapshot): void {
  const crates = cratesByPlanetOf(snapshot)
  expect(Object.keys(crates).sort()).toEqual(CAMPAIGN_KEYS)
  for (const key of CAMPAIGN_KEYS) {
    expect(crates[key], key).toEqual([
      expect.objectContaining({
        kind: 'cache_crate',
        ownerId: playerIdOf(snapshot),
        access: 'owner',
        premium: [expect.objectContaining({ origin: key })],
      }),
    ])
  }
}

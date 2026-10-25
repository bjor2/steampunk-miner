/**
 * Mid-campaign save, reload and trip back on a phone (ticket 857): on the iPhone 13 and Pixel 7
 * projects a fresh save makes progress on P1, P2 and P3, saves docked at P3, is exported, the game
 * reloaded and the file imported, and the rig jumps P3 -> P4 -> P5 -> P1 with a tap on each star
 * map control; every planet's core bay, placed crates and the premium ledger come back byte for
 * byte, the wallet (past 2^53) and the fuel exactly. The desktop run is
 * `e2e/browser/ui/campaignSaveTrip.spec.ts`. Emulation, not a device (#482). State through the
 * DOM, `steampunkDebug` and the run log, never pixels.
 */
import { expect, test } from '@playwright/test'
import {
  expectImportedAsSaved,
  expectKeptAfterTheTrip,
  expectSaveFixture,
} from '../campaignSaveChecks'
import { readLooks, readSnapshot, rejectedCommandsOf } from '../campaignSaveReads'
import { importSave, playCampaignToTheSave, travelBack } from '../campaignSaveTrip'
import { currentCell, openGame } from '../screens/screenHelpers'
import { TAP } from '../starMapJumps'
import { skipWhereEngineIsMissing } from './mobileHelpers'

/** Five jumps and two loads on a 3x phone screen's software GL: a wait, not a judgement. */
const TEST_TIMEOUT_MS = 480_000

skipWhereEngineIsMissing()

test.describe('mobile: mid-campaign save trip (ticket 857)', () => {
  test('saves at P3, reloads, imports, and finds every planet as saved after jumping back to P1', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openGame(page, currentCell())
    const save = await playCampaignToTheSave(page, TAP)
    expectSaveFixture(save)
    expect(await rejectedCommandsOf(page)).toEqual([])

    await openGame(page, currentCell())
    const loaded = await importSave(page, save.exported)
    expectImportedAsSaved(loaded, await readLooks(page), save)

    await travelBack(page, TAP)
    expectKeptAfterTheTrip(await readSnapshot(page), save)
    expect(await rejectedCommandsOf(page)).toEqual([])
    expect(errors).toEqual([])
  })

  // HS on #857: owned kit tools and consumable stacks (max 3) join the byte-identical set once
  // #850 lets a player buy and own them.
  test.fixme('keeps owned kit tools and consumable stacks byte for byte through the trip', () => {})
})

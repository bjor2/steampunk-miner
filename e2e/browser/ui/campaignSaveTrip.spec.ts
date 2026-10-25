/**
 * Mid-campaign save, reload and trip back on desktop (ticket 857): a fresh save makes progress on
 * P1, P2 and P3, saves docked at P3, is exported, the game reloaded and the file imported, and the
 * rig jumps P3 -> P4 -> P5 -> P1 with a click on each star map control; every planet's core bay,
 * placed crates and the premium ledger come back byte for byte, the wallet (past 2^53) and the
 * fuel exactly. The steps and the judgements are `campaignSaveTrip.ts` and `campaignSaveChecks.ts`;
 * the phone run is `e2e/browser/mobile/campaignSaveTrip.spec.ts`. State through the DOM,
 * `steampunkDebug` and the run log, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import {
  expectImportedAsSaved,
  expectKeptAfterTheTrip,
  expectSaveFixture,
} from '../campaignSaveChecks'
import { readLooks, readSnapshot, rejectedCommandsOf } from '../campaignSaveReads'
import { importSave, playCampaignToTheSave, travelBack } from '../campaignSaveTrip'
import { openGame, type HudLayoutCell } from '../hud/hudLayoutHelpers'
import { CLICK } from '../starMapJumps'

/** Five jumps, two loads and the bays on software WebGL: a wait, not a judgement. */
const TEST_TIMEOUT_MS = 480_000

const DESKTOP: HudLayoutCell = {
  name: 'desktop-1440x900',
  viewport: { width: 1440, height: 900 },
  isTouch: false,
  isTvMode: false,
  floor: null,
}

test.describe(`mid-campaign save trip (ticket 857): ${DESKTOP.name}`, () => {
  test.use({ viewport: DESKTOP.viewport, isMobile: false, hasTouch: false, deviceScaleFactor: 1 })

  test('saves at P3, reloads, imports, and finds every planet as saved after jumping back to P1', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openPlainGame(page)
    const save = await playCampaignToTheSave(page, CLICK)
    expectSaveFixture(save)
    expect(await rejectedCommandsOf(page)).toEqual([])

    await openPlainGame(page)
    const loaded = await importSave(page, save.exported)
    expectImportedAsSaved(loaded, await readLooks(page), save)

    await travelBack(page, CLICK)
    expectKeptAfterTheTrip(await readSnapshot(page), save)
    expect(await rejectedCommandsOf(page)).toEqual([])
    expect(errors).toEqual([])
  })

  // HS on #857: owned kit tools and consumable stacks (max 3) join the byte-identical set once
  // #850 lets a player buy and own them.
  test.fixme('keeps owned kit tools and consumable stacks byte for byte through the trip', () => {})
})

/** The debug build with the opening transmission taken down by its key. */
async function openPlainGame(page: Page): Promise<string[]> {
  const errors = await openGame(page, DESKTOP)
  await page.keyboard.press('KeyK')
  return errors
}

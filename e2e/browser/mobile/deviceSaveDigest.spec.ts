/**
 * Saves are identical across devices (#11, #12; the TD's section 4 on #470, ticket 481): the
 * committed device fixture, put in the debug save folder as a player's autosave, loads through the
 * title menu's Continue to the digest `tests/golden/device-save.digest.json` holds. Node pins the
 * same value (`src/systems/save/loadedSaveDigest.test.ts` and the store's resume in
 * `checkpoint.test.ts`), so the Pixel 7 Chromium and iPhone 13 WebKit projects agreeing with the
 * golden is the WebKit digest equal to the Chromium one. Emulation, not a device (#482).
 */
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { DeviceSaveGolden } from '../../../src/systems/save/loadedSaveDigest'
import {
  collectErrors,
  openDebugGame,
  skipWhereEngineIsMissing,
  tapAction,
  waitForLine,
} from './mobileHelpers'

const GOLDEN = JSON.parse(
  readFileSync(new URL('../../../tests/golden/device-save.digest.json', import.meta.url), 'utf8'),
) as DeviceSaveGolden
const FIXTURE_TEXT = readFileSync(new URL(`../../../${GOLDEN.fixture}`, import.meta.url), 'utf8')
/** A `?debug` run's save folder (`saveFolderOf`): never the player's own saves. */
const DEBUG_AUTOSAVE_KEY = 'steampunk-miner/saves-debug/autosave.json'

skipWhereEngineIsMissing()

/** The fixture is the folder's only save before the page's first script runs. */
async function storeFixtureAsAutosave(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, text }) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, text)
    },
    { key: DEBUG_AUTOSAVE_KEY, text: FIXTURE_TEXT },
  )
}

async function continueFromTitle(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const result = window.steampunkDebug!.ui.getTitleMenuModel()
    return result.ok && result.model?.startFocus === 'title-continue'
  })
  await tapAction(page, 'ui_confirm')
}

test.describe('device save digest (ticket 481)', () => {
  test('loads the committed fixture to the golden digest on this engine', async ({ page }) => {
    test.setTimeout(240_000)
    const errors = collectErrors(page)
    await storeFixtureAsAutosave(page)
    await openDebugGame(page, 'debug&title')
    await continueFromTitle(page)
    const loaded = await waitForLine(page, 'checkpoint_loaded')
    expect(loaded.data).toMatchObject({ slot: 'autosave', digest: GOLDEN.digest })
    expect(errors).toEqual([])
  })
})

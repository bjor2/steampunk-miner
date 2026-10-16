/**
 * Taps on both phones (ticket 481, the TD's section 5 on #470): what a finger reaches with
 * `locator.tap()`, which WebKit drives without CDP. A tap on a filled power-up slot presses the
 * slot's action as its number key does, and no screen a phone shows keeps information in a hover
 * `title=` alone (`titleOnlyTextsOf`, ticket 476) under a no-hover, coarse-pointer screen. The
 * matrix's touch specs cover the pause button, the charge size badge, cards and money on taps.
 * Emulation, not a device (#482). State through `steampunkDebug` and the DOM, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { titleOnlyTextsOf } from '../../../src/systems/views/titleOnlyText'
import { currentCell, dockAt, openGame } from '../screens/screenHelpers'
import { actionStream, skipWhereEngineIsMissing } from './mobileHelpers'

const RIVET_PATCH = 'consumable.rivet_patch'
const SLOT_ONE_TILE = 'power-up-slot-powerup.1'

skipWhereEngineIsMissing()

async function slotRivetPatch(page: Page): Promise<void> {
  const problems = await page.evaluate((itemId) => {
    const result = window.steampunkDebug!.setVehicleLoadout({ 'powerup.1': itemId })
    return result.ok ? [] : result.problems
  }, RIVET_PATCH)
  expect(problems).toEqual([])
}

/** The hover titles on screen whose words no drawn line or tap-opened plate repeats. */
function titleOnlyTextsOnScreen(page: Page): Promise<string[]> {
  return page
    .getByTestId('safe-area')
    .evaluate((element) => element.outerHTML)
    .then(titleOnlyTextsOf)
}

function matchesNoHoverCoarsePointer(page: Page): Promise<boolean> {
  return page.evaluate(
    () => matchMedia('(hover: none)').matches && matchMedia('(pointer: coarse)').matches,
  )
}

test.describe('mobile: taps (ticket 481)', () => {
  test('presses slot 1 on a tap of its tile, as the Digit1 key does', async ({ page }) => {
    const errors = await openGame(page, currentCell())
    await slotRivetPatch(page)
    const tile = page.getByTestId(SLOT_ONE_TILE)
    await expect(tile).toBeVisible()
    const before = (await actionStream(page)).length
    await tile.tap()
    await expect.poll(async () => (await actionStream(page)).length).toBeGreaterThan(before)
    const onTap = (await actionStream(page)).slice(before)
    expect(onTap[0]).toEqual({ actionId: 'use_slot_1', isDown: true })
    const middle = (await actionStream(page)).length
    await page.keyboard.press('Digit1')
    expect((await actionStream(page)).slice(middle)[0]).toEqual(onTap[0])
    expect(errors).toEqual([])
  })

  test('reports a no-hover, coarse-pointer screen and keeps nothing in a hover title alone', async ({
    page,
  }) => {
    const errors = await openGame(page, currentCell())
    expect(await matchesNoHoverCoarsePointer(page)).toBe(true)
    expect(await titleOnlyTextsOnScreen(page)).toEqual([])
    await page.evaluate(() => window.steampunkDebug!.giveMoney('1e9'))
    await dockAt(page, 'upgrade')
    expect(await titleOnlyTextsOnScreen(page)).toEqual([])
    await dockAt(page, 'sell')
    expect(await titleOnlyTextsOnScreen(page)).toEqual([])
    expect(errors).toEqual([])
  })
})

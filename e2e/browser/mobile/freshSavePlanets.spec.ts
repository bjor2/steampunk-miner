/**
 * The fresh-save loop to each of P1 to P5 on a phone (ticket 905; the desktop run is
 * `e2e/browser/freshSavePlanets.spec.ts`, ticket 656): in the Pixel 7 project at 360x640, one test
 * per planet opens a fresh save and
 *
 * 1. from P3 on, has the pacing bot play to the planet before (`bot.playToPlanet`: it harvests,
 *    sells, upgrades and buys each travel with play commands, replayed on the live game);
 * 2. from P2 on, docks at the Sell bay with the touch Dock button, opens the star map from the bay
 *    footer, shows the planet on the strip, buys any fuel shortfall and jumps there, all by taps;
 * 3. on landing makes the desktop run's checks (`freshSaveLandings.ts`): still a play run, the
 *    pool id, the hazard with a pocket round the dock, the card's arrival line;
 * 4. then, money granted, buys the planet's own kit item at the merchant and a Drill tip step on
 *    the Outfitter by taps. The grant and the bay move to the Upgrade bay are debug commands, so
 *    they come after the play-run check.
 *
 * Each step's title names its planet, so a red run says where it stopped. The hop into a planet
 * leaves the planet before's core unharvested: a jump asks only for fuel (`jumpRules.ts`), and the
 * #648 clamp sells the hop's fuel to any wallet.
 *
 * Only the Pixel 7: the iPhone 13 (WebKit) cannot launch on the box, so it is unverified for this
 * loop. Emulation, not a device (#482). State through the DOM and `steampunkDebug`, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { PLANET_KIT_TEST_IDS } from '../../../src/features/planet-kit/ui/testIds'
import { UI_ID_TEMPLATES, UI_IDS } from '../../../src/systems/views/screenIds'
import { SHEET_UI_IDS } from '../../../src/ui/sheet/sheetIds'
import { touchButtonIdOf } from '../../../src/ui/stage/deviceIds'
import {
  expectLandedOn,
  LANDINGS,
  MS_PER_PLANET,
  openFreshSave,
  playBotToPlanet,
  type ExpectedLanding,
} from '../freshSaveLandings'
import { dockAt, waitForOpenBay } from '../screens/screenHelpers'
import { buyAnyShortfallAndJumpTo, openStarMapFromTheBay, TAP } from '../starMapJumps'

/** The repo's small-phone window (the 360x640 of the UI suite), held upright. */
const PHONE_VIEWPORT = { width: 360, height: 640 }
/** Software WebGL on a 2.625x phone screen: the taps' waits, not a judgement. */
const TOUCH_STEPS_MS = 5 * 60_000
/** Enough for any line of any merchant and any Outfitter card on P1-P5. */
const SHOP_MONEY = '1e12'
/** The Outfitter card bought, as the Outfitter's touch spec buys it (ticket 687). */
const SHOP_TRACK = 'drill_tip'
/** Each planet's own kit item on its merchant (`planet-kit/planetKits.json`, ticket 820). */
const MERCHANT_ITEMS: Readonly<Record<number, string>> = {
  1: 'cache_crate',
  2: 'scree_plough',
  3: 'damp_flask',
  4: 'shard_tongs',
  5: 'vent_vane',
}
const MERCHANT = '[data-bay-panel-id="planet-kit.merchant"]'

interface KitHoldingsRead {
  tools: string[]
  stacks: { itemId: string; count: string }[]
}

test.use({ viewport: PHONE_VIEWPORT })

test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'iPhone 13 (WebKit) cannot launch on the box: the P1-P5 phone loop is unverified there (ticket 905)',
)

test.describe('mobile: fresh save to P1-P5 by touch (ticket 905)', () => {
  for (const landing of LANDINGS) {
    test(`a fresh save lands on planet ${landing.planet} by a tapped jump and buys at its merchant and shop by touch`, async ({
      page,
    }) => {
      test.setTimeout(MS_PER_PLANET * landing.planet + TOUCH_STEPS_MS)
      const errors = await openFreshSave(page)
      await reachByTappedJump(page, landing.planet)
      await stepOn(landing.planet, 'lands as play on its pool, hazard and card line', () =>
        expectLandedOn(page, landing),
      )
      await buyOnTheLandedPlanet(page, landing)
      expect(errors).toEqual([])
    })
  }
})

/** P2 on: the bot's trip to the planet before, then that planet's hop made by taps. */
async function reachByTappedJump(page: Page, planet: number): Promise<void> {
  if (planet === 1) return
  const from = planet - 1
  await playBotFromFreshSaveTo(page, from)
  await stepOn(from, 'docks at the Sell bay by touch', () => dockAtTheSellBayByTouch(page))
  await stepOn(from, `opens the star map, buys fuel and jumps to P${planet} by touch`, () =>
    jumpByTouchTo(page, planet),
  )
}

/** The bot from the fresh save to `planet`, harvesting each core before it; P1 is already there. */
async function playBotFromFreshSaveTo(page: Page, planet: number): Promise<void> {
  if (planet === 1) return
  await stepOn(planet, 'is reached by the pacing bot from a fresh save', async () => {
    const arrival = await playBotToPlanet(page, planet)
    expect(arrival).toMatchObject({ ok: true, planetIndex: planet, isReplayExact: true })
  })
}

/** On the landed planet: its merchant's own item and an Outfitter step, each bought by taps. */
async function buyOnTheLandedPlanet(page: Page, landing: ExpectedLanding): Promise<void> {
  const itemId = MERCHANT_ITEMS[landing.planet]
  await stepOn(landing.planet, 'docks at the Sell bay by touch', () =>
    dockAtTheSellBayByTouch(page),
  )
  await stepOn(landing.planet, `buys ${itemId} at the merchant by touch`, () =>
    buyAtTheMerchantByTouch(page, itemId),
  )
  await stepOn(landing.planet, `buys a ${SHOP_TRACK} step at the shop by touch`, () =>
    buyAtTheShopByTouch(page),
  )
}

function stepOn(planet: number, step: string, body: () => Promise<void>): Promise<void> {
  return test.step(`P${planet}: ${step}`, body)
}

/**
 * Docked at the Sell bay with its screen open. A jump lands docked there; a fresh rig stands on
 * the Sell bay's pad, and the touch Dock button docks it once the authority would accept a dock.
 */
async function dockAtTheSellBayByTouch(page: Page): Promise<void> {
  if ((await vehicleModeOf(page)) !== 'docked') await tapDockWhenOffered(page)
  await waitForOpenBay(page, 'sell')
}

/** The dock prompt shows exactly when a dock would be accepted (#33), so the tap is not refused. */
async function tapDockWhenOffered(page: Page): Promise<void> {
  await expect.poll(() => isDockOffered(page), { timeout: 60_000 }).toBe(true)
  await page.getByTestId(touchButtonIdOf('interact')).tap()
}

async function jumpByTouchTo(page: Page, planet: number): Promise<void> {
  await openStarMapFromTheBay(page, TAP)
  await buyAnyShortfallAndJumpTo(page, planet, TAP)
}

/** The money granted and the item's Buy tapped: exactly one more of it is held. */
async function buyAtTheMerchantByTouch(page: Page, itemId: string): Promise<void> {
  await grantShopMoney(page)
  const before = heldCountOf(await readHoldings(page), itemId)
  await page
    .locator(`${MERCHANT} [data-testid="${PLANET_KIT_TEST_IDS.merchantBuy}-${itemId}"]`)
    .tap()
  await expect.poll(async () => heldCountOf(await readHoldings(page), itemId)).toBe(before + 1)
}

/**
 * At the Upgrade bay, the Outfitter card tapped twice: the first tap shows its gain text and buys
 * nothing, the second buys one step (ticket 687's card rules on touch).
 */
async function buyAtTheShopByTouch(page: Page): Promise<void> {
  await dockAt(page, 'upgrade')
  await expect(page.getByTestId(SHEET_UI_IDS.outfitterCards)).toBeVisible()
  const card = page.getByTestId(UI_ID_TEMPLATES.workshopUpgradeBuy(SHOP_TRACK))
  const before = await trackLevelOf(page, SHOP_TRACK)
  await card.tap()
  await expect(card).toHaveAttribute('data-revealed', 'true')
  expect(await trackLevelOf(page, SHOP_TRACK)).toBe(before)
  await card.tap()
  await expect.poll(() => trackLevelOf(page, SHOP_TRACK)).toBe(before + 1)
  await expect(page.getByTestId(UI_IDS.upgradebayScreen)).toBeAttached()
}

async function grantShopMoney(page: Page): Promise<void> {
  const problems = await page.evaluate((money) => {
    const result = window.steampunkDebug!.giveMoney(money)
    return result.ok ? [] : result.problems
  }, SHOP_MONEY)
  expect(problems).toEqual([])
}

function isDockOffered(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const read = window.steampunkDebug!.ui.getHudModel()
    return read.ok && read.model.dockPrompt.isShown
  })
}

function vehicleModeOf(page: Page): Promise<string> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.snapshot()
    if (!result.ok) throw new Error(result.problems.join('; '))
    const state = result.snapshot.state as {
      players: Record<string, { vehicle: { mode: string } }>
    }
    return Object.values(state.players)[0].vehicle.mode
  })
}

function trackLevelOf(page: Page, track: string): Promise<number> {
  return page.evaluate((upgradeId) => {
    const result = window.steampunkDebug!.snapshot()
    if (!result.ok) throw new Error(result.problems.join('; '))
    const state = result.snapshot.state as {
      players: Record<string, { vehicle: { levels: Record<string, number> } }>
    }
    return Object.values(state.players)[0].vehicle.levels[upgradeId]
  }, track)
}

function readHoldings(page: Page): Promise<KitHoldingsRead> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['planet-kit'].kitHoldings() as {
      holdings?: KitHoldingsRead
    }
    return result.holdings ?? { tools: [], stacks: [] }
  })
}

/** A tool counts once when owned; a consumable counts its stacks' units. */
function heldCountOf(holdings: KitHoldingsRead, itemId: string): number {
  const toolCount = holdings.tools.includes(itemId) ? 1 : 0
  const stackCounts = holdings.stacks.filter((stack) => stack.itemId === itemId)
  return stackCounts.reduce((total, stack) => total + Number(stack.count), toolCount)
}

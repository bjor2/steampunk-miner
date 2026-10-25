/**
 * The star map's jumps as a player makes them (ticket 793), shared by the desktop and phone specs:
 * a fresh save seeded through `steampunkDebug` to planet 2 with money and docked at the Sell bay,
 * then for each hop the bay footer's Star map, the destination's dot on the system strip (the
 * carousel of ticket 796 draws only the shown planet's controls), its Buy fuel and its Jump pressed
 * twice, timed from the confirming press until the travel card is gone and the bay screen is back
 * on the new planet (#650 Map UX: at most 2 s from confirming to control). `press` is a click on
 * desktop and a tap on a phone. State through the DOM and the debug API, never pixels.
 */
import { expect, type Locator, type Page } from '@playwright/test'
import { UI_IDS } from '../../src/ui/ids'
import { starMapBuyFuelIdOf, starMapJumpIdOf } from '../../src/systems/views/starMapControlIds'
import { starMapDotIdOf, starMapPlanetIdOf, STAR_MAP_UI_IDS } from '../../src/ui/starMap/starMapIds'
import { dockAt } from './screens/screenHelpers'

/** How a finger or a mouse presses a control. */
export type Press = (control: Locator) => Promise<void>

export const CLICK: Press = (control) => control.click()
export const TAP: Press = (control) => control.tap()

/** The jump's own transition (#650 Map UX, `JUMP_TRANSITION_SECONDS`). */
export const JUMP_TO_CONTROL_MS = 2_000
/**
 * The confirming press's round trip and one frame of software WebGL on the box: the spec's clock
 * starts before the press reaches the page and stops at the first frame that shows control.
 */
export const PRESS_AND_FRAME_SLACK_MS = 500
/** Enough for every hop's shortfall from P2 to P5 with the clamp long past. */
const SEED_MONEY = '1e12'
/** The travel card's title (`TravelTransitionCard`): control is back once it is gone. */
const TRAVEL_CARD_TITLE = 'Core drive engaged'

/** A fresh save on planet 2 with money, docked at the Sell bay that sells fuel. */
export async function seedPlanetTwoAtTheSellBay(page: Page): Promise<void> {
  await page.evaluate((money) => {
    const debug = window.steampunkDebug!
    for (const result of [debug.setPlanet(2), debug.giveMoney(money)]) {
      if (!result.ok) throw new Error(result.problems.join('; '))
    }
  }, SEED_MONEY)
  await dockAt(page, 'sell')
}

/** The bay footer's Star map, pressed: the map opens. */
export async function openStarMapFromTheBay(page: Page, press: Press): Promise<void> {
  await press(page.getByTestId(UI_IDS.platformStarMap))
  await expect(page.getByTestId(STAR_MAP_UI_IDS.starMapPanel)).toBeVisible()
}

/** The planet's dot on the system strip, pressed: the carousel shows it (ticket 796). */
export async function showPlanetOnTheStrip(page: Page, place: number, press: Press): Promise<void> {
  await press(page.getByTestId(starMapDotIdOf(place)))
  await expect(page.getByTestId(starMapPlanetIdOf(place))).toBeVisible()
}

/**
 * Shows the destination, buys its fuel shortfall and jumps there with two presses; answers the
 * milliseconds from the confirming press to control on the new planet.
 */
export async function buyFuelAndJumpTo(page: Page, place: number, press: Press): Promise<number> {
  await showPlanetOnTheStrip(page, place, press)
  await press(page.getByTestId(starMapBuyFuelIdOf(place)))
  return confirmJumpTo(page, place, press)
}

/**
 * Shows the destination and jumps there on the fuel the tank already carries, buying none, so
 * the wallet is untouched (ticket 857's trip back).
 */
export async function jumpOnCarriedFuelTo(page: Page, place: number, press: Press): Promise<void> {
  await showPlanetOnTheStrip(page, place, press)
  await confirmJumpTo(page, place, press)
}

/** The shown planet's Jump pressed twice; the milliseconds from the confirm to control there. */
async function confirmJumpTo(page: Page, place: number, press: Press): Promise<number> {
  const jump = page.getByTestId(starMapJumpIdOf(place))
  await expect(jump).not.toHaveAttribute('data-reason', /.+/)
  await press(jump)
  await expect(jump).toHaveText('Confirm jump')
  const confirmedAt = Date.now()
  await press(jump)
  await waitForControlOn(page, place)
  return Date.now() - confirmedAt
}

/** The travel card gone and the Sell bay's screen open on `planet`: the player has the rig. */
export async function waitForControlOn(page: Page, planet: number): Promise<void> {
  await page.waitForFunction(
    ({ planet: expected, title }) => {
      const debug = window.steampunkDebug!
      const sell = debug.ui.getSellBayModel()
      const shutter = debug.ui.getBayPresentation()
      const isCardShown = document.body.innerText.includes(title)
      const isOnPlanet = sell.ok && sell.model.header.planet === expected
      return (
        isOnPlanet && !isCardShown && shutter.ok && shutter.presentation.shutter.phase === 'open'
      )
    },
    { planet, title: TRAVEL_CARD_TITLE },
    { polling: 'raf' },
  )
}

/**
 * The mobility lane in the preview build (#204): read through `steampunkDebug`, never pixels. The
 * build registers the ten items by their bare ids, so the loadout slots them and the slot column
 * draws them; a slot key raises the steam shield, whose window lands in the `mobility` section;
 * and the item card's stat lines read from `statPreview`.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const SHIELD = 'power.steam_shield'
const ANCHOR = 'power.grav_anchor'

async function openGameWithShieldAndAnchor(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  const slotted = await page.evaluate(
    ([shield, anchor]) =>
      window.steampunkDebug!.setVehicleLoadout({ 'powerup.1': shield, 'powerup.2': anchor }).ok,
    [SHIELD, ANCHOR],
  )
  expect(slotted).toBe(true)
  return errors
}

test('the build slots mobility items and the slot column draws both', async ({ page }) => {
  const errors = await openGameWithShieldAndAnchor(page)
  const slots = await page.evaluate(() => {
    const result = window.steampunkDebug!.features['power-up-core'].getSlots() as {
      ok: boolean
      slots?: { itemId: string }[]
    }
    return (result.slots ?? []).map((slot) => slot.itemId)
  })
  expect(slots).toEqual([SHIELD, ANCHOR])
  expect(errors).toEqual([])
})

test('a slot key raises the steam shield, its window kept in the mobility section', async ({
  page,
}) => {
  const errors = await openGameWithShieldAndAnchor(page)
  await page.evaluate(() => window.steampunkDebug!.input.tap('use_slot_1'))
  await page.waitForFunction(() => {
    const result = window.steampunkDebug!.features.mobility.getEffects() as {
      effects?: { shieldUntilTick: number }
    }
    return (result.effects?.shieldUntilTick ?? 0) > 0
  })
  const charges = await page.evaluate(
    (shield) => window.steampunkDebug!.features['power-up-core'].getCharges(shield),
    SHIELD,
  )
  expect(charges).toEqual({ ok: true, chargesLeft: 1 })
  expect(errors).toEqual([])
})

test('the steam shield card reads its stat lines and price from statPreview', async ({ page }) => {
  const errors = await openGameWithShieldAndAnchor(page)
  const preview = await page.evaluate(
    (shield) => window.steampunkDebug!.features.mobility.statPreview(shield, 1, 22),
    SHIELD,
  )
  expect(preview).toMatchObject({
    ok: true,
    lines: [
      { label: 'Cooldown (s)', value: '1.5e+1' },
      { label: 'Curtain (s)', value: '2e+0' },
      { label: 'Charges', value: '2e+0' },
      { label: 'Price' },
    ],
  })
  expect(errors).toEqual([])
})

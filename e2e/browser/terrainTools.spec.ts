/**
 * The terrain lane in the preview build (#202): read through `steampunkDebug`, never pixels. The
 * build registers the ore-shifter and the lodestone beacon by their bare ids, so the loadout slots
 * them and the slot column draws them; a slot key plants the beacon, which waits in the
 * `terrain-tools` section; and the shifter's card lines read from `statPreview`.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const SHIFTER = 'power.ore_shifter'
const LODESTONE = 'consumable.lodestone_beacon'

async function openGameWithShifterAndLodestone(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  const slotted = await page.evaluate(
    ([shifter, lodestone]) =>
      window.steampunkDebug!.setVehicleLoadout({ 'powerup.1': shifter, 'powerup.2': lodestone }).ok,
    [SHIFTER, LODESTONE],
  )
  expect(slotted).toBe(true)
  return errors
}

test('the build slots terrain tools and the slot column draws both', async ({ page }) => {
  const errors = await openGameWithShifterAndLodestone(page)
  const slots = await page.evaluate(() => {
    const result = window.steampunkDebug!.features['power-up-core'].getSlots() as {
      ok: boolean
      slots?: { itemId: string }[]
    }
    return (result.slots ?? []).map((slot) => slot.itemId)
  })
  expect(slots).toEqual([SHIFTER, LODESTONE])
  expect(errors).toEqual([])
})

test('a slot key plants the lodestone beacon, kept in the terrain-tools section', async ({
  page,
}) => {
  const errors = await openGameWithShifterAndLodestone(page)
  await page.evaluate(() => window.steampunkDebug!.input.tap('use_slot_2'))
  await page.waitForFunction(() => {
    const result = window.steampunkDebug!.features['terrain-tools'].getBeacon() as {
      beacon?: { plantedTick: number } | null
    }
    return (result.beacon ?? null) !== null
  })
  const charges = await page.evaluate(
    (lodestone) => window.steampunkDebug!.features['power-up-core'].getCharges(lodestone),
    LODESTONE,
  )
  expect(charges).toEqual({ ok: true, chargesLeft: 0 })
  expect(errors).toEqual([])
})

test('the ore-shifter card reads its stat lines from statPreview', async ({ page }) => {
  const errors = await openGameWithShifterAndLodestone(page)
  const preview = await page.evaluate(
    (shifter) => window.steampunkDebug!.features['terrain-tools'].statPreview(shifter, 1, 6),
    SHIFTER,
  )
  expect(preview).toMatchObject({
    ok: true,
    preview: {
      itemId: SHIFTER,
      mark: 1,
      lines: [
        { stat: 'charges', value: 2 },
        { stat: 'cooldown', value: 600 },
        { stat: 'windup', value: 6 },
        { stat: 'reach', value: 6 },
        { stat: 'size', value: 8 },
      ],
    },
  })
  expect(errors).toEqual([])
})

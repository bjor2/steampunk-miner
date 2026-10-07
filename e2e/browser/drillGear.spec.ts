/**
 * The drill-gear lane in the preview build (#205): read through `steampunkDebug`, never pixels.
 * The build registers six drill-gear items by their bare ids, so the loadout takes them in the
 * drill sockets; the flank key (KeyF, `use_drill_flank`) switches the side cutters on and off; the
 * collar key (KeyC, `use_drill_collar`) uses the sampling corer, which spends one charge; and the
 * card's raw stat lines read from `statPreview`.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const CUTTERS = 'gear.side_cutters'
const CORER = 'gear.sampling_corer'

async function openGameWithCuttersAndCorer(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  const slotted = await page.evaluate(
    ([cutters, corer]) =>
      window.steampunkDebug!.setVehicleLoadout({ 'drill.flank': cutters, 'drill.collar': corer })
        .ok,
    [CUTTERS, CORER],
  )
  expect(slotted).toBe(true)
  return errors
}

async function engagedItems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['drill-gear'].getEngaged() as {
      itemIds?: string[]
    }
    return result.itemIds ?? []
  })
}

test('the flank key switches the side cutters on, and again off', async ({ page }) => {
  const errors = await openGameWithCuttersAndCorer(page)
  await page.evaluate(() => window.steampunkDebug!.input.tap('use_drill_flank'))
  await expect.poll(() => engagedItems(page)).toEqual([CUTTERS])
  await page.evaluate(() => window.steampunkDebug!.input.tap('use_drill_flank'))
  await expect.poll(() => engagedItems(page)).toEqual([])
  expect(errors).toEqual([])
})

test('the collar key uses the sampling corer, spending one of its four charges', async ({
  page,
}) => {
  const errors = await openGameWithCuttersAndCorer(page)
  await page.evaluate(() => window.steampunkDebug!.input.tap('use_drill_collar'))
  await expect
    .poll(() =>
      page.evaluate(
        (corer) => window.steampunkDebug!.features['power-up-core'].getCharges(corer),
        CORER,
      ),
    )
    .toEqual({ ok: true, chargesLeft: 3 })
  expect(errors).toEqual([])
})

test('the corer card reads its raw stat lines from statPreview', async ({ page }) => {
  const errors = await openGameWithCuttersAndCorer(page)
  const preview = await page.evaluate(
    (corer) => window.steampunkDebug!.features['drill-gear'].statPreview(corer, 1, 24),
    CORER,
  )
  expect(preview).toMatchObject({
    ok: true,
    preview: {
      itemId: CORER,
      lines: [
        { stat: 'charges', value: 4 },
        { stat: 'cooldownTicks', value: 300 },
        { stat: 'windUpTicks', value: 6 },
        { stat: 'reachTiles', value: 6 },
      ],
    },
  })
  expect(errors).toEqual([])
})

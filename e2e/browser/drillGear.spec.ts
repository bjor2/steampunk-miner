/**
 * The drill-gear lane in the preview build (#205): read through `steampunkDebug`, never pixels.
 * The build registers seven drill-gear items by their bare ids, so the loadout takes them in the
 * drill sockets; the flank key (KeyF, `use_drill_flank`) switches the side cutters on and off; the
 * collar key (KeyC, `use_drill_collar`) uses the sampling corer, which spends one charge; the card's
 * raw stat lines read from `statPreview`; and `getTwinBit` reads the twin-bit head in `drill.head`
 * (ticket 280) with no bearing latched before it cuts. The scenario `drill-gear.twin-bit-diagonal`
 * (ticket 281), played through `fastForward`, logs one `diagonal_cell_cut` per cell of its two bores.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
    steampunkRunLog?: () => string
  }
}

const CUTTERS = 'gear.side_cutters'
const CORER = 'gear.sampling_corer'
const TWIN_BIT = 'gear.twin_bit'
/** Two bores of six cells each (`twinBitDiagonal.ts`). */
const DIAGONAL_CELLS = 12

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

test('the twin-bit head mounts in drill.head and previews its one diagonal cell', async ({
  page,
}) => {
  const errors = await openGameWithCuttersAndCorer(page)
  const slotted = await page.evaluate(
    (head) => window.steampunkDebug!.setVehicleLoadout({ 'drill.head': head }).ok,
    TWIN_BIT,
  )
  expect(slotted).toBe(true)
  await expect
    .poll(() => page.evaluate(() => window.steampunkDebug!.features['drill-gear'].getTwinBit()))
    .toEqual({ ok: true, isMounted: true, aheadLatch: null })
  const preview = await page.evaluate(
    (head) => window.steampunkDebug!.features['drill-gear'].statPreview(head, 1, 19),
    TWIN_BIT,
  )
  expect(preview).toMatchObject({
    ok: true,
    preview: { itemId: TWIN_BIT, lines: [{ stat: 'aheadCells', value: 1 }] },
  })
  expect(errors).toEqual([])
})

test('the twin-bit diagonal scenario cuts two 45-degree bores on planet 19', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  const played = await page.evaluate(() => {
    const debug = window.steampunkDebug!
    const script = debug.features['drill-gear'].twinBitDiagonal() as unknown as {
      ticks: number
      commands: NonNullable<Parameters<DebugApi['fastForward']>[1]>
    }
    return debug.fastForward(script.ticks, script.commands).ok
  })
  expect(played).toBe(true)
  await expect
    .poll(() =>
      page.evaluate(
        () => window.steampunkRunLog!().split('"event":"drill-gear.diagonal_cell_cut"').length - 1,
      ),
    )
    .toBe(DIAGONAL_CELLS)
  await expect
    .poll(() => page.evaluate(() => window.steampunkDebug!.features['drill-gear'].getTwinBit()))
    .toMatchObject({ ok: true, isMounted: true })
  expect(errors).toEqual([])
})

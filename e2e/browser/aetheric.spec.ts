/**
 * The resonance whistle in the preview build (#262, the GD lock on #245): read through
 * `steampunkDebug`, never pixels. The build registers the whistle by its bare id, so the loadout
 * slots it and the rig hangs its part on the boiler stack's own point, `hull.stack.side` (ticket
 * 265), not at the slot's housing; the Digit1 key sounds it, its
 * lure lands in the `aetheric` section and a charge is spent; and the item card's stat lines read
 * from `statPreview`.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const WHISTLE = 'power.resonance_whistle'
const WHISTLE_ASSET = 'vehicle-item-power-resonance-whistle'

interface WhistleRead {
  ok: boolean
  sounding: { tx: number; ty: number; reachMm: number; untilTick: number } | null
}

async function openGameWithWhistle(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  const slotted = await page.evaluate(
    (whistle) => window.steampunkDebug!.setVehicleLoadout({ 'powerup.1': whistle }).ok,
    WHISTLE,
  )
  expect(slotted).toBe(true)
  return errors
}

function readWhistle(page: Page): Promise<WhistleRead> {
  return page.evaluate(() => window.steampunkDebug!.features.aetheric.getWhistle() as WhistleRead)
}

test('the build slots the whistle and the rig hangs it on the boiler stack, not in its cradle', async ({
  page,
}) => {
  const errors = await openGameWithWhistle(page)
  const whistleMountsOf = () =>
    page.evaluate((assetId) => {
      const result = window.steampunkDebug!.vehicleParts()
      const mounts = result.ok ? result.mounted : []
      return mounts.filter((mount) => mount.assetId === assetId).map((mount) => mount.attachId)
    }, WHISTLE_ASSET)
  await expect.poll(whistleMountsOf).toEqual(['hull.stack.side'])
  expect(errors).toEqual([])
})

test('Digit1 sounds the whistle: its lure in the aetheric section, one charge spent', async ({
  page,
}) => {
  const errors = await openGameWithWhistle(page)
  expect((await readWhistle(page)).sounding).toBeNull()
  await page.keyboard.press('Digit1')
  await expect.poll(async () => (await readWhistle(page)).sounding).not.toBeNull()
  const charges = await page.evaluate(
    (whistle) => window.steampunkDebug!.features['power-up-core'].getCharges(whistle),
    WHISTLE,
  )
  expect(charges).toEqual({ ok: true, chargesLeft: 1 })
  expect(errors).toEqual([])
})

test('the whistle card reads its stat lines and price from statPreview', async ({ page }) => {
  const errors = await openGameWithWhistle(page)
  const preview = await page.evaluate(
    (whistle) => window.steampunkDebug!.features.aetheric.statPreview(whistle, 1, 15),
    WHISTLE,
  )
  expect(preview).toMatchObject({
    ok: true,
    lines: [
      { label: 'Cooldown (s)', value: '1.5e+1' },
      { label: 'Lure lasts (s)', value: '5e+0' },
      { label: 'Charges', value: '2e+0' },
      { label: 'Reach (tiles)', value: '8e+0' },
      { label: 'Energy a blow', value: '1e+0' },
      { label: 'Price' },
    ],
  })
  expect(errors).toEqual([])
})

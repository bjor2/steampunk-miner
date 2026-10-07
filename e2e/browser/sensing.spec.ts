/**
 * The sensing lane in the preview build (#203): read through `steampunkDebug`, never pixels. The
 * build registers six items by their bare ids, so the loadout slots the echo sounder and the
 * signal buoy; a slot key pings or drops a buoy, and this client's reveal board and the reveal
 * layer pick it up from the `PowerUpUsed` line alone; owning the passives makes them read; the
 * held galvanic probe is no item at all.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const ECHO = 'power.echo_sounder'
const BUOY = 'consumable.signal_buoy'
const PASSIVES = ['passive.threat_periscope', 'passive.assay_lens', 'passive.hazard_barometer']

interface Reveals {
  marks: number
  pins: { ownerId: string }[]
  periscope: number | null
  lens: number | null
  barometer: number | null
  drawnQuads: number | null
}

async function openGameWithSensing(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  const slotted = await page.evaluate(
    ([echo, buoy, passives]) =>
      window.steampunkDebug!.setVehicleLoadout(
        { 'powerup.1': echo as string, 'powerup.2': buoy as string },
        passives as string[],
      ).ok,
    [ECHO, BUOY, PASSIVES] as const,
  )
  expect(slotted).toBe(true)
  return errors
}

const reveals = (page: Page) =>
  page.evaluate(() => window.steampunkDebug!.features.sensing.getReveals() as unknown as Reveals)

test('owning the passives makes each one read, and the held probe is no item', async ({ page }) => {
  const errors = await openGameWithSensing(page)
  await page.waitForFunction(() => {
    const read = window.steampunkDebug!.features.sensing.getReveals() as unknown as Reveals
    return read.periscope !== null && read.lens !== null && read.barometer !== null
  })
  const probe = await page.evaluate(() =>
    window.steampunkDebug!.setVehicleLoadout({ 'powerup.1': 'power.galvanic_probe' }),
  )
  expect(probe.ok).toBe(false)
  expect(errors).toEqual([])
})

test('a buoy drop pins its tile and the reveal layer draws it', async ({ page }) => {
  const errors = await openGameWithSensing(page)
  await page.evaluate(() => window.steampunkDebug!.input.tap('use_slot_2'))
  await page.waitForFunction(() => {
    const read = window.steampunkDebug!.features.sensing.getReveals() as unknown as Reveals
    return read.pins.length === 1 && (read.drawnQuads ?? 0) >= 1
  })
  const charges = await page.evaluate(
    (buoy) => window.steampunkDebug!.features['power-up-core'].getCharges(buoy),
    BUOY,
  )
  expect(charges).toEqual({ ok: true, chargesLeft: 2 })
  expect(errors).toEqual([])
})

test('an echo ping spends a charge and draws no more quads than the layer declares', async ({
  page,
}) => {
  const errors = await openGameWithSensing(page)
  await page.evaluate(() => window.steampunkDebug!.input.tap('use_slot_1'))
  await page.waitForFunction((echo) => {
    const charges = window.steampunkDebug!.features['power-up-core'].getCharges(echo) as {
      chargesLeft?: number
    }
    return charges.chargesLeft === 2
  }, ECHO)
  await page.waitForFunction(() => {
    const read = window.steampunkDebug!.features.sensing.getReveals() as unknown as Reveals
    return read.drawnQuads === read.marks + read.pins.length
  })
  expect((await reveals(page)).drawnQuads ?? 0).toBeLessThanOrEqual(87)
  expect(errors).toEqual([])
})

test('the barometer card reads its Mark 6 lookahead from statPreview', async ({ page }) => {
  const errors = await openGameWithSensing(page)
  const preview = await page.evaluate(() =>
    window.steampunkDebug!.features.sensing.statPreview('passive.hazard_barometer', 6, 8),
  )
  expect(preview).toMatchObject({ ok: true, preview: { lines: [{ value: 10 }] } })
  expect(errors).toEqual([])
})

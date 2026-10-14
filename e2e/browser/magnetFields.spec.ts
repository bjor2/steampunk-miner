/**
 * The terrain magnets' fields in the preview build (ticket 286): read through `steampunkDebug`,
 * never pixels. The `terrain-tools.magnet-fields` layer is mounted from the start and draws
 * nothing while no magnet is owned and planted; a planted lodestone beacon draws its 8 converging
 * arcs at the faint light while it waits for the dock.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const LODESTONE = 'consumable.lodestone_beacon'
const BEACON_ARCS = 8

interface DrawnFields {
  pieces: number
  fields: { kind: string; pieces: number; light: number }[]
}

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

async function readMagnetFields(page: Page): Promise<DrawnFields | null> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['terrain-tools'].getMagnetFields() as {
      fields: DrawnFields | null
    }
    return result.fields
  })
}

test('the magnet field layer draws nothing while no magnet is owned', async ({ page }) => {
  const errors = await openGame(page)
  await page.waitForFunction(() => {
    const result = window.steampunkDebug!.features['terrain-tools'].getMagnetFields() as {
      fields: unknown
    }
    return result.fields !== null
  })
  expect(await readMagnetFields(page)).toMatchObject({ pieces: 0, fields: [] })
  expect(errors).toEqual([])
})

test('a planted beacon draws its converging arcs faint while it waits', async ({ page }) => {
  const errors = await openGame(page)
  const slotted = await page.evaluate(
    (lodestone) => window.steampunkDebug!.setVehicleLoadout({ 'powerup.1': lodestone }).ok,
    LODESTONE,
  )
  expect(slotted).toBe(true)
  await page.evaluate(() => window.steampunkDebug!.input.tap('use_slot_1'))
  await page.waitForFunction(() => {
    const result = window.steampunkDebug!.features['terrain-tools'].getMagnetFields() as {
      fields: { pieces: number } | null
    }
    return (result.fields?.pieces ?? 0) > 0
  })
  const drawn = await readMagnetFields(page)
  expect(drawn?.fields).toHaveLength(1)
  expect(drawn?.fields[0]).toMatchObject({ kind: 'attract', pieces: BEACON_ARCS })
  expect(drawn?.fields[0].light).toBeGreaterThan(0)
  expect(drawn?.fields[0].light).toBeLessThan(0.5)
  expect(errors).toEqual([])
})

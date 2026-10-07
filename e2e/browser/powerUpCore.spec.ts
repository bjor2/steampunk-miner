/**
 * The power-up core slice in the preview build (#200): read through `steampunkDebug`, never pixels.
 * The build registers the three bare-id cradles, so the loadout takes them and refuses an id
 * nobody registered; a new game draws no slot buttons; and a slot key on an empty slot is pressed
 * but reserves no charge. The tap and hold on a filled slot waits for the first real
 * power-up (#201, TD lock on #200).
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const CRADLE_IDS = ['slot.powerup_3', 'slot.powerup_4', 'slot.powerup_5']

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

function slotButtonCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['power-up-core'].getSlots() as {
      ok: boolean
      slots?: unknown[]
    }
    if (!result.ok || result.slots === undefined) throw new Error('getSlots failed')
    return result.slots.length
  })
}

test('the build owns the three cradles by their bare ids and refuses an unregistered one', async ({
  page,
}) => {
  const errors = await openGame(page)
  const answers = await page.evaluate((cradles) => {
    const debug = window.steampunkDebug!
    const unknown = debug.setVehicleLoadout({}, ['slot.powerup_9'])
    const owned = debug.setVehicleLoadout({}, cradles)
    const snapshot = debug.snapshot()
    const vehicle = snapshot.ok ? JSON.stringify(snapshot.snapshot.state.players.p1.vehicle) : ''
    return {
      unknownOk: unknown.ok,
      ownedOk: owned.ok,
      ownsAll: cradles.every((id) => vehicle.includes(`"${id}"`)),
    }
  }, CRADLE_IDS)
  expect(answers).toEqual({ unknownOk: false, ownedOk: true, ownsAll: true })
  expect(await slotButtonCount(page)).toBe(0)
  expect(errors).toEqual([])
})

test('a slot key on an empty slot is pressed and reserves no charge', async ({ page }) => {
  const errors = await openGame(page)
  const answers = await page.evaluate(() => {
    const debug = window.steampunkDebug!
    const tapped = debug.input.tap('use_slot_1')
    const stream = debug.input.getActionStream()
    const snapshot = debug.snapshot()
    const sections = snapshot.ok ? (snapshot.snapshot.state.players.p1.slices ?? {}) : {}
    return {
      tappedOk: tapped.ok,
      pressed: stream.ok && stream.stream.some((edge) => edge.actionId === 'use_slot_1'),
      hasChargeState: 'power-up-core' in sections,
    }
  })
  expect(answers).toEqual({ tappedOk: true, pressed: true, hasChargeState: false })
  expect(await slotButtonCount(page)).toBe(0)
  expect(errors).toEqual([])
})

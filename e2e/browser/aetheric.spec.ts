/**
 * The aetheric items in the preview build (the GD lock on #245): read through `steampunkDebug`,
 * never pixels.
 *
 * - The resonance whistle (#262): the build registers it by its bare id, so the loadout slots it
 *   and the rig hangs its part on the boiler stack's own point, `hull.stack.side` (ticket 265),
 *   not at the slot's housing; the Digit1 key sounds it, its lure lands in the `aetheric` section
 *   and a charge is spent; and the item card's stat lines read from `statPreview`.
 * - The chronometric governor and the aether condenser (#263): the rig hangs them at their own
 *   points, `hull.tail` and `hull.flank`; Digit1 opens the governor's pocket in the
 *   `aetheric.pocket` section and puts heat on the item gauge the HUD shows, and Digit2 then burns
 *   it (a refused burn would spend no charge).
 * - The P16 fork pair (#261): the rig hangs the phase lantern on the nose, `hull.nose`, and the
 *   twin coils on the roof, `hull.roof.coils`; Digit1 on the coil with no enemy about is refused
 *   `no_target` and spends no charge, Digit2 on the lantern facing open air is refused
 *   `nothing_ahead` and leaves the `aetheric.phase` section empty; and both cards read from
 *   `statPreview`.
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
const GOVERNOR = 'power.chronometric_governor'
const CONDENSER = 'power.aether_condenser'

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

interface PocketRead {
  ok: boolean
  pocket: { tx: number; ty: number; reachMm: number; lastTick: number } | null
}

interface ItemHeatRead {
  ok: boolean
  gauge: { text: string; exact: string; permille: number } | null
}

async function openGameWithGovernorAndCondenser(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  const slotted = await page.evaluate(
    ([governor, condenser]) =>
      window.steampunkDebug!.setVehicleLoadout({ 'powerup.1': governor, 'powerup.2': condenser })
        .ok,
    [GOVERNOR, CONDENSER],
  )
  expect(slotted).toBe(true)
  return errors
}

function readPocket(page: Page): Promise<PocketRead> {
  return page.evaluate(() => window.steampunkDebug!.features.aetheric.getPocket() as PocketRead)
}

function readItemHeat(page: Page): Promise<ItemHeatRead> {
  return page.evaluate(() => window.steampunkDebug!.features.aetheric.getItemHeat() as ItemHeatRead)
}

function chargesOf(page: Page, itemId: string) {
  return page.evaluate(
    (id) => window.steampunkDebug!.features['power-up-core'].getCharges(id),
    itemId,
  )
}

test('the rig hangs the governor and the condenser at their own points', async ({ page }) => {
  const errors = await openGameWithGovernorAndCondenser(page)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const result = window.steampunkDebug!.vehicleParts()
        return result.ok ? result.mounted.map((mount) => [mount.assetId, mount.attachId]) : []
      }),
    )
    .toEqual(
      expect.arrayContaining([
        ['vehicle-item-power-chronometric-governor', 'hull.tail'],
        ['vehicle-item-power-aether-condenser', 'hull.flank'],
      ]),
    )
  expect(errors).toEqual([])
})

test('Digit1 opens a slow pocket and heats the item gauge; Digit2 condenses it', async ({
  page,
}) => {
  const errors = await openGameWithGovernorAndCondenser(page)
  expect((await readPocket(page)).pocket).toBeNull()
  expect((await readItemHeat(page)).gauge).toMatchObject({ permille: 0 })
  await page.keyboard.press('Digit1')
  await expect.poll(async () => (await readPocket(page)).pocket).not.toBeNull()
  await expect.poll(async () => (await readItemHeat(page)).gauge?.permille ?? 0).toBeGreaterThan(0)
  expect(await chargesOf(page, GOVERNOR)).toEqual({ ok: true, chargesLeft: 1 })
  await page.keyboard.press('Digit2')
  await expect.poll(() => chargesOf(page, CONDENSER)).toEqual({ ok: true, chargesLeft: 1 })
  expect(errors).toEqual([])
})

test('the governor and condenser cards read their lines from statPreview', async ({ page }) => {
  const errors = await openGameWithGovernorAndCondenser(page)
  const [governor, condenser] = await page.evaluate(
    ([governorId, condenserId]) => [
      window.steampunkDebug!.features.aetheric.statPreview(governorId, 1, 24),
      window.steampunkDebug!.features.aetheric.statPreview(condenserId, 1, 29),
    ],
    [GOVERNOR, CONDENSER],
  )
  expect(governor).toMatchObject({
    ok: true,
    lines: [
      { label: 'Cooldown (s)', value: '1.5e+1' },
      { label: 'Pocket lasts (s)', value: '4e+0' },
      { label: 'Charges', value: '2e+0' },
      { label: 'Range (tiles)', value: '6e+0' },
      { label: 'Energy a second', value: '1e+0' },
      { label: 'Heat a pocket (%)', value: '2.5e+1' },
      { label: 'Price' },
    ],
  })
  expect(condenser).toMatchObject({
    ok: true,
    lines: [
      { label: 'Cooldown (s)', value: '1e+1' },
      { label: 'Charges', value: '2e+0' },
      { label: 'Energy a full gauge', value: '1e+1' },
      { label: 'Price' },
    ],
  })
  expect(errors).toEqual([])
})

const LANTERN = 'power.phase_lantern'
const ARC_COIL = 'power.arc_coil'

interface PhaseRead {
  ok: boolean
  phase: { cellTx: number; cellTy: number; toTx: number; toTy: number; endTick: number } | null
}

async function openGameWithForkItems(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  const slotted = await page.evaluate(
    ([coil, lantern]) =>
      window.steampunkDebug!.setVehicleLoadout({ 'powerup.1': coil, 'powerup.2': lantern }).ok,
    [ARC_COIL, LANTERN],
  )
  expect(slotted).toBe(true)
  return errors
}

function readPhase(page: Page): Promise<PhaseRead> {
  return page.evaluate(() => window.steampunkDebug!.features.aetheric.getPhase() as PhaseRead)
}

test('the rig hangs the phase lantern on the nose and the arc coils on the roof', async ({
  page,
}) => {
  const errors = await openGameWithForkItems(page)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const result = window.steampunkDebug!.vehicleParts()
        return result.ok ? result.mounted.map((mount) => [mount.assetId, mount.attachId]) : []
      }),
    )
    .toEqual(
      expect.arrayContaining([
        ['vehicle-item-power-phase-lantern', 'hull.nose'],
        ['vehicle-item-power-arc-coil', 'hull.roof.coils'],
      ]),
    )
  expect(errors).toEqual([])
})

test('Digit1 on the coil with no enemy, and Digit2 on the lantern facing air, refuse and spend nothing', async ({
  page,
}) => {
  const errors = await openGameWithForkItems(page)
  await page.keyboard.press('Digit1')
  await page.keyboard.press('Digit2')
  // A refusal resolves after the wind-up; the charges stay whole once the acts have been judged.
  await page.waitForTimeout(500)
  expect(await chargesOf(page, ARC_COIL)).toEqual({ ok: true, chargesLeft: 3 })
  expect(await chargesOf(page, LANTERN)).toEqual({ ok: true, chargesLeft: 2 })
  expect((await readPhase(page)).phase).toBeNull()
  expect(errors).toEqual([])
})

test('the lantern and coil cards read their lines from statPreview', async ({ page }) => {
  const errors = await openGameWithForkItems(page)
  const [lantern, coil] = await page.evaluate(
    ([lanternId, coilId]) => [
      window.steampunkDebug!.features.aetheric.statPreview(lanternId, 1, 16),
      window.steampunkDebug!.features.aetheric.statPreview(coilId, 1, 16),
    ],
    [LANTERN, ARC_COIL],
  )
  expect(lantern).toMatchObject({
    ok: true,
    lines: [
      { label: 'Cooldown (s)', value: '1e+1' },
      { label: 'Charges', value: '2e+0' },
      { label: 'Extra energy a phase', value: '2.5e-1' },
      { label: 'Heat a phase (%)', value: '1.25e+1' },
      { label: 'Price' },
    ],
  })
  expect(coil).toMatchObject({
    ok: true,
    lines: [
      { label: 'Cooldown (s)', value: '1.5e+1' },
      { label: 'Reach (tiles)', value: '8e+0' },
      { label: 'Charges', value: '3e+0' },
      { label: 'Enemies a bolt', value: '3e+0' },
      { label: 'Energy a bolt', value: '1e+0' },
      { label: 'Heat a bolt (%)', value: '1.25e+1' },
      { label: 'Price' },
    ],
  })
  expect(errors).toEqual([])
})

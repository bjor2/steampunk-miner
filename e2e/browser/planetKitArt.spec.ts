/**
 * The planet-kit art in the preview build (ticket 825), read through `steampunkDebug`, never
 * pixels: with the kit tools shown, the car hangs each socket's asset at G&V's point (the tools on
 * their kit-only points since ticket 881) and reports it
 * under `vehicleParts().mounted`; on Hearthmoor the Assay & Exchange carries the first merchant's
 * frontage with its two parts, at 360 px and 1280 px.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const VIEWPORTS = [
  { label: '360 px', size: { width: 360, height: 760 } },
  { label: '1280 px', size: { width: 1280, height: 800 } },
] as const

const SOCKET_ASSETS: Record<string, string> = {
  'kit.blade': 'vehicle-item-scree-plough',
  'cab.gauge': 'vehicle-item-damp-flask',
  'kit.grab': 'vehicle-item-shard-tongs',
  'kit.mast': 'vehicle-item-vent-vane',
}

async function open(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

function mountedAssets(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const report = window.steampunkDebug!.vehicleParts() as {
      mounted?: { attachId: string; assetId: string }[]
    }
    return Object.fromEntries(
      (report.mounted ?? []).map((mount) => [mount.attachId, mount.assetId]),
    )
  })
}

for (const { label, size } of VIEWPORTS) {
  test(`hangs the four kit tools on their sockets and dresses the merchant at ${label}`, async ({
    page,
  }) => {
    await page.setViewportSize(size)
    const errors = await open(page)
    const shown = await page.evaluate(() =>
      window.steampunkDebug!.features['planet-kit'].showKitSockets({
        heldFlasks: 3,
        isActing: false,
      }),
    )
    expect(shown).toEqual({ ok: true })
    await expect.poll(() => mountedAssets(page)).toMatchObject(SOCKET_ASSETS)
    const frontage = await page.evaluate(() =>
      window.steampunkDebug!.features['planet-kit'].merchantFrontage(),
    )
    expect(frontage).toMatchObject({
      ok: true,
      frontage: { assetId: 'platform-merchant-1', device: 'crucible' },
    })
    expect(
      (frontage as unknown as { frontage: { partIds: string[] } }).frontage.partIds.sort(),
    ).toEqual(['merchant-banner', 'platform-merchant-1'])
    expect(errors).toEqual([])
  })
}

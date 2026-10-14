/**
 * The bore gun on a desktop in the preview build (ticket 314, the TD lock on #314 section 2): the
 * gauge panel shows once the gun is mounted, a held fire key fires at each `nextShotTick` and stops
 * when it comes up, and a canvas click fires through the same press. The tracer asks the kernel's
 * spray pool. The bought gun hangs on the rig at `hull.front` (ticket 315), and each bought Armoury
 * module rides it, its gilded plate shown once Mastered (ticket 321). The auto guns' modules hang
 * on the turret once owned, and Overpressure's switch latches the kernel's burst (ticket 388). State through
 * `steampunkDebug`, the run log and the DOM's test ids, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
    steampunkRunLog?: () => string
  }
}

const FIRE_GAUGE = 'ground-gun-fire-gauge'
const LONG_BARREL = 'weapon.long_barrel'
const LONG_BARREL_ASSET = 'vehicle-item-weapon-long-barrel'
/** The long barrel's Mastered Mark 11 is researched by planet 42 (ticket 318's ladder). */
const LONG_BARREL_MASTERED_PLANET = 42
const BURST_TOGGLE = 'ground-gun-burst-toggle'
const OVERPRESSURE = 'weapon.overpressure_burst'
/** The turret's first major level is ten minor steps (#180): `setGunLevel` takes steps. */
const TURRET_FIRST_LEVEL_STEPS = 10
/** Long enough for a shot at the 45-tick cadence floor or a recovery in surface rock, at 60 ticks/s. */
const HOLD_MS = 2500

test.describe('the bore gun on a desktop (ticket 314)', () => {
  test('shows the gauge with the fire key once the gun is mounted', async ({ page }) => {
    const errors = await openDrawnGame(page)
    await expect(page.getByTestId(FIRE_GAUGE)).toHaveCount(0)
    await mountGun(page)
    await expect(page.getByTestId(FIRE_GAUGE)).toBeVisible()
    await expect(page.getByTestId(FIRE_GAUGE)).toContainText('Fire (Left Mouse)')
    expect(errors).toEqual([])
  })

  test('hangs the gun on the rig once it is mounted, and nothing before (ticket 315)', async ({
    page,
  }) => {
    const errors = await openDrawnGame(page)
    expect(await boreGunOnRig(page)).toEqual([])
    await mountGun(page)
    await expect
      .poll(() => boreGunOnRig(page))
      .toEqual([
        {
          assetId: 'vehicle-bore-gun',
          attachId: 'hull.front',
          partIds: ['t1-bore-mount', 't1-bore-barrel'],
        },
      ])
    expect(errors).toEqual([])
  })

  test('hangs each bought module on the gun, its gilded plate only once Mastered (ticket 321)', async ({
    page,
  }) => {
    const errors = await openDrawnGame(page)
    await mountGun(page)
    await ownModules(page, [LONG_BARREL, 'weapon.steam_sear'])
    await expect
      .poll(() => modulesOnGun(page))
      .toEqual([
        { assetId: LONG_BARREL_ASSET, attachId: 'hull.front', partIds: ['barrel-sleeve'] },
        {
          assetId: 'vehicle-item-weapon-steam-sear',
          attachId: 'hull.front',
          partIds: ['sear-block', 'sear-lever'],
        },
      ])
    await researchThrough(page, LONG_BARREL_MASTERED_PLANET)
    await expect
      .poll(async () =>
        (await modulesOnGun(page)).find((mount) => mount.assetId === LONG_BARREL_ASSET),
      )
      .toMatchObject({ partIds: ['barrel-sleeve', 'gilded-plate'] })
    expect(errors).toEqual([])
  })

  test('hangs an owned auto_guns module on the turret once the guns are mounted (ticket 388)', async ({
    page,
  }) => {
    const errors = await openDrawnGame(page)
    await ownModules(page, ['weapon.fire_director'])
    expect(await modulesOnGun(page)).toEqual([])
    await mountTurret(page)
    await expect
      .poll(() => modulesOnGun(page))
      .toEqual([
        {
          assetId: 'vehicle-item-weapon-fire-director',
          attachId: 'hull.turret',
          partIds: ['director-box'],
        },
      ])
    expect(errors).toEqual([])
  })

  test("shows Overpressure's switch once it rides the mounted turret, and a click latches the burst (ticket 388)", async ({
    page,
  }) => {
    const errors = await openDrawnGame(page)
    await ownModules(page, [OVERPRESSURE])
    await expect(page.getByTestId(BURST_TOGGLE)).toHaveCount(0)
    await mountTurret(page)
    await expect(page.getByTestId(BURST_TOGGLE)).toHaveAttribute('aria-pressed', 'false')
    await page.getByTestId(BURST_TOGGLE).click()
    await expect(page.getByTestId(BURST_TOGGLE)).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => burstSwitchesLogged(page)).toBe(1)
    expect(errors).toEqual([])
  })

  test('fires while the key is held and stops once it comes up', async ({ page }) => {
    const errors = await openDrawnGame(page)
    await mountGun(page)
    await page.keyboard.down('KeyX')
    await expect.poll(() => boreShotsLogged(page)).toBeGreaterThanOrEqual(1)
    await page.waitForTimeout(HOLD_MS)
    await page.keyboard.up('KeyX')
    const shotsAtRelease = await boreShotsLogged(page)
    await page.waitForTimeout(HOLD_MS)
    expect(await boreShotsLogged(page)).toBe(shotsAtRelease)
    expect(await sprayRequests(page)).toBeGreaterThan(0)
    expect(errors).toEqual([])
  })

  test('fires one shot on a canvas click', async ({ page }) => {
    const errors = await openDrawnGame(page)
    await mountGun(page)
    const canvas = await page.locator('canvas').first().boundingBox()
    if (canvas === null) throw new Error('the game canvas is not drawn')
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height * 0.75)
    await expect.poll(() => boreShotsLogged(page)).toBe(1)
    expect(errors).toEqual([])
  })
})

async function openDrawnGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => {
    const stats = window.steampunkDebug?.ui.getRenderStats()
    return stats?.ok === true && stats.stats.drawCalls > 0
  })
  return errors
}

function mountGun(page: Page): Promise<void> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['ground-gun'].setLevels(1, 1, 1)
    if (!result.ok) throw new Error(result.problems.join('; '))
  })
}

function mountTurret(page: Page): Promise<void> {
  return page.evaluate((steps) => {
    const result = window.steampunkDebug!.setGunLevel(steps)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, TURRET_FIRST_LEVEL_STEPS)
}

/** The bore gun's entry in what the vehicle's pieces hang at attach points now. */
function boreGunOnRig(page: Page) {
  return page.evaluate(() => {
    const parts = window.steampunkDebug!.vehicleParts()
    if (!parts.ok) throw new Error(parts.problems.join('; '))
    return parts.mounted.filter((mount) => mount.assetId === 'vehicle-bore-gun')
  })
}

function ownModules(page: Page, itemIds: readonly string[]): Promise<void> {
  return page.evaluate((owned) => {
    const result = window.steampunkDebug!.setVehicleLoadout({}, owned)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, itemIds)
}

function researchThrough(page: Page, planet: number): Promise<void> {
  return page.evaluate((tier) => {
    const result = window.steampunkDebug!.features['tech-tree'].jumpToDepth(tier) as {
      ok: boolean
      problems?: string[]
    }
    if (!result.ok) throw new Error((result.problems ?? []).join('; '))
  }, planet)
}

/** The Armoury modules hung on the rig now, each with its part ids sorted. */
function modulesOnGun(page: Page) {
  return page.evaluate(() => {
    const parts = window.steampunkDebug!.vehicleParts()
    if (!parts.ok) throw new Error(parts.problems.join('; '))
    return parts.mounted
      .filter((mount) => mount.assetId.startsWith('vehicle-item-weapon-'))
      .map((mount) => ({ ...mount, partIds: [...mount.partIds].sort() }))
  })
}

function boreShotsLogged(page: Page): Promise<number> {
  return page.evaluate(
    () => (window.steampunkRunLog?.() ?? '').split('"event":"bore_fired"').length - 1,
  )
}

function burstSwitchesLogged(page: Page): Promise<number> {
  return page.evaluate(
    () => (window.steampunkRunLog?.() ?? '').split('"event":"turret_burst_set"').length - 1,
  )
}

function sprayRequests(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getSprayStats()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.stats.requested
  })
}

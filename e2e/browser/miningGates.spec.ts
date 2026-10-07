/**
 * The mining gates in the ground (ticket 299, the #238 follow-up), on the preview build. For a
 * dynamite, a drill and an extractor cell, the marker the terrain draws (`.drawnMarkerAt`, read
 * from the chunk mesh's own gate bits and the uniforms they draw with) is the lock marker the
 * player sees (`.lockMarkerAt`). The drill rim opens in the ground once the tip's last major cuts
 * it, and reduce motion (the shake switch) holds an extractor's surface motion as its engraved
 * glyph. The dense drill gate, the one kind in both acts, is shot in Fire and in Frost for review
 * (the test's output folder, never compared): the same pattern, only the act tint differs.
 *
 * The vehicle stays docked: `.gatesNearDock` names a planet and seed whose ground shows each kind
 * under the pad. Asserted through `steampunkDebug`, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import { VIEW_SHORT_AXIS_MAX_M } from '../../src/constants/scene'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

type GateKind = 'dense' | 'drillSignature' | 'dynamite' | 'rig'

interface GatedTile {
  tx: number
  ty: number
  rowsUnderPad: number
  gate: { kind: GateKind }
}

interface Stop {
  planet: number
  seed: number
  tile: GatedTile
}

interface Marker {
  kind: string
  motion: string | null
}

interface DrawnMarker extends Marker {
  isDrawn: boolean
  isGlyph: boolean
  tint: number[]
}

const FIRE_PLANETS = [8, 9, 10, 11, 12, 13, 14, 15, 16]
const FROST_PLANETS = [17, 18, 19, 20, 21, 22, 23, 24]
/** Dynamite gates from P7 (#142); extractor cells from P5, theme rares from P8. */
const DYNAMITE_PLANETS = [7, 9, 11, 13, 15]
const EXTRACTOR_PLANETS = [7, 18, 19, 20, 23, 24]
const SEEDS = Array.from({ length: 16 }, (_, at) => at + 1)
/** Far past any campaign tip, so the rim of the last major cuts every dense cell. */
const TIP_PAST_EVERY_GATE = 20_000
/** Well inside the view circle at the 20 m zoom-out (20 m on 1280 x 720), so its chunk draws. */
const ROWS_IN_VIEW = 10
/** The shot wants the cell on screen at the 20 m zoom-out: half the 720 px height is 10 m. */
const ROWS_ON_SCREEN = 8
const JPEG_QUALITY = 80
/** The strata maps upload after the planet changes; the shot waits this long for them. */
const GROUND_SETTLE_MS = 3000

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.evaluate((zoom) => window.steampunkDebug!.ui.setZoom(zoom), VIEW_SHORT_AXIS_MAX_M)
  return errors
}

/** The first planet and seed whose docked view holds a cell of `kind`, shallowest first. */
function findStop(
  page: Page,
  kind: GateKind,
  planets: number[],
  maxRows = ROWS_IN_VIEW,
): Promise<Stop> {
  return page.evaluate(
    ({ kind, planets, seeds, maxRows }) => {
      const gates = window.steampunkDebug!.features['mining-gates']
      for (const planet of planets) {
        for (const seed of seeds) {
          const near = gates.gatesNearDock(planet, seed) as unknown as { tiles: GatedTile[] }
          const tile = near.tiles.find(
            (one) => one.gate.kind === kind && one.rowsUnderPad <= maxRows,
          )
          if (tile !== undefined) return { planet, seed, tile }
        }
      }
      throw new Error(`no ${kind} gate near the dock on planets ${planets.join(', ')}`)
    },
    { kind, planets, seeds: SEEDS, maxRows },
  )
}

async function goTo(page: Page, { planet, seed }: Stop): Promise<void> {
  await page.evaluate(
    ({ planet, seed }) => {
      const debug = window.steampunkDebug!
      for (const step of [() => debug.setPlanet(planet), () => debug.setPlanetSeed(seed)]) {
        const result = step()
        if (!result.ok) throw new Error(result.problems.join('; '))
      }
    },
    { planet, seed },
  )
}

function lockMarkerAt(page: Page, { tx, ty }: GatedTile): Promise<Marker> {
  return page.evaluate(
    ({ tx, ty }) => {
      const marker = window.steampunkDebug!.features['mining-gates'].lockMarkerAt(tx, ty)
      const { kind, motion } = marker as unknown as Marker
      return { kind, motion }
    },
    { tx, ty },
  )
}

function drawnMarkerAt(page: Page, { tx, ty }: GatedTile): Promise<DrawnMarker> {
  return page.evaluate(
    ({ tx, ty }) =>
      window.steampunkDebug!.features['mining-gates'].drawnMarkerAt(
        tx,
        ty,
      ) as unknown as DrawnMarker,
    { tx, ty },
  )
}

/** Chunks rebuild a few a frame after a planet change, slowly on software WebGL. */
const BUILT_TIMEOUT_MS = 30_000

async function expectGroundToMatchLockMarker(page: Page, tile: GatedTile): Promise<Marker> {
  const marker = await lockMarkerAt(page, tile)
  expect(marker.kind).not.toBe('none')
  await expect
    .poll(
      async () => {
        const { isDrawn, kind, motion } = await drawnMarkerAt(page, tile)
        return { isDrawn, kind, motion }
      },
      { timeout: BUILT_TIMEOUT_MS },
    )
    .toEqual({ isDrawn: true, ...marker })
  return marker
}

async function turnShakeOff(page: Page): Promise<void> {
  await page.evaluate(() => {
    const result = window.steampunkDebug!.teleportToDock('sell')
    if (!result.ok) throw new Error(result.problems.join('; '))
  })
  await page.getByTestId('platform-settings').click()
  await expect(page.getByTestId('settings-panel')).toBeVisible()
  await page.getByTestId('settings-toggle-shake').click()
  await page.getByTestId('settings-close').click()
}

async function shootDenseGate(page: Page, planets: number[], name: string): Promise<DrawnMarker> {
  const stop = await findStop(page, 'dense', planets, ROWS_ON_SCREEN)
  await goTo(page, stop)
  await page.evaluate(() => window.steampunkDebug!.input.tap('ui_cancel'))
  expect(await expectGroundToMatchLockMarker(page, stop.tile)).toEqual({
    kind: 'hard_rim',
    motion: null,
  })
  await page.waitForTimeout(GROUND_SETTLE_MS)
  await page.screenshot({
    path: test.info().outputPath(`gate-dense-${name}.jpg`),
    type: 'jpeg',
    quality: JPEG_QUALITY,
  })
  return drawnMarkerAt(page, stop.tile)
}

test.describe('mining gates in the ground (ticket 299)', () => {
  test('draws the lock marker of a dynamite, a drill and an extractor cell', async ({ page }) => {
    test.setTimeout(120_000)
    const errors = await openGame(page)
    const stops = [
      await findStop(page, 'dynamite', DYNAMITE_PLANETS),
      await findStop(page, 'dense', FIRE_PLANETS),
      await findStop(page, 'rig', EXTRACTOR_PLANETS),
    ]
    const markers: Marker[] = []
    for (const stop of stops) {
      await goTo(page, stop)
      markers.push(await expectGroundToMatchLockMarker(page, stop.tile))
    }
    expect(markers.map((marker) => marker.kind)).toEqual(['cracked_shell', 'hard_rim', 'motion'])
    expect(markers[2].motion).not.toBeNull()
    expect(errors).toEqual([])
  })

  test('opens the drill rim in the ground once the last major cuts the cell', async ({ page }) => {
    test.setTimeout(120_000)
    const errors = await openGame(page)
    const stop = await findStop(page, 'dense', FIRE_PLANETS)
    await goTo(page, stop)
    expect(await expectGroundToMatchLockMarker(page, stop.tile)).toMatchObject({
      kind: 'hard_rim',
    })
    await page.evaluate(
      (level) => window.steampunkDebug!.setUpgrade('drill_tip', level),
      TIP_PAST_EVERY_GATE,
    )
    await expect.poll(async () => (await lockMarkerAt(page, stop.tile)).kind).toBe('hard_rim_open')
    expect(await expectGroundToMatchLockMarker(page, stop.tile)).toMatchObject({
      kind: 'hard_rim_open',
    })
    expect(errors).toEqual([])
  })

  test("holds an extractor's surface motion still as its glyph with reduce motion on", async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const errors = await openGame(page)
    const stop = await findStop(page, 'rig', EXTRACTOR_PLANETS)
    await goTo(page, stop)
    const marker = await expectGroundToMatchLockMarker(page, stop.tile)
    expect((await drawnMarkerAt(page, stop.tile)).isGlyph).toBe(false)

    await turnShakeOff(page)
    await expect.poll(async () => (await drawnMarkerAt(page, stop.tile)).isGlyph).toBe(true)
    const still = await drawnMarkerAt(page, stop.tile)
    expect({ kind: still.kind, motion: still.motion }).toEqual(marker)
    expect(errors).toEqual([])
  })

  test('shoots the dense drill gate in Fire and in Frost: one pattern, two act tints', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const errors = await openGame(page)
    await page.keyboard.press('KeyX')
    const fire = await shootDenseGate(page, FIRE_PLANETS, 'fire')
    const frost = await shootDenseGate(page, FROST_PLANETS, 'frost')
    expect({ kind: frost.kind, motion: frost.motion }).toEqual({
      kind: fire.kind,
      motion: fire.motion,
    })
    expect(frost.tint).not.toEqual(fire.tint)
    expect(errors).toEqual([])
  })
})

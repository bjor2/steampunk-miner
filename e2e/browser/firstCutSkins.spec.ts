/**
 * Tiles keep their skin through the first cut (ticket 698, GD ruling on #698, option 2), read
 * through `steampunkDebug.ui.getKindLooks()`, never pixels: on a fresh planet-1 start every
 * species of the roster draws its own skin before any drilling, with no rarity. Drilling the first
 * surface ore changes no slot's skin (silhouette, pattern, colour, hero cell); only the met
 * species' rarity lead arrives, with exactly one flourish, and a second cell starts one only if
 * its species is new. Run at a phone's 360x640 and a desktop's 1280x800.
 */
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import type { ScriptedCommand } from '../../src/systems/fastForward'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const PLANET_1_START = readFileSync(
  new URL('../../scenarios/planet1-start.scenario.json', import.meta.url),
  'utf8',
)
/** Seed 83921's first two surface ore tiles of planet 1 (`miningPopup.spec.ts`), one ore type. */
const FIRST_ORE = { tx: 12, ty: 298 }
const SAME_TYPE_ORE = { tx: 30, ty: 293 }
const DRILL_TICKS = 40
const SLOW_BOX_TIMEOUT_MS = 120_000
const VIEWPORTS = [
  { label: '360x640', size: { width: 360, height: 640 } },
  { label: '1280x800', size: { width: 1280, height: 800 } },
] as const

async function openScenario(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(`/?debug&scenario=${encodeURIComponent(PLANET_1_START)}`)
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.waitForFunction(() => window.steampunkDebug!.ui.getRenderStats().ok)
  return errors
}

function kindLooks(page: Page) {
  return page.evaluate(() => {
    const read = window.steampunkDebug!.ui.getKindLooks()
    if (!read.ok) throw new Error(read.problems.join('; '))
    return read.looks
  })
}

type DrawnLooks = Awaited<ReturnType<typeof kindLooks>>

/** What each slot draws under its rarity overlay. */
function skinsOf(looks: DrawnLooks): string[] {
  return looks.shown.map(
    (look) =>
      `${look.slot}|${look.silhouetteCode}|${look.patternCode}|${look.colour.join()}|${look.heroCell}`,
  )
}

function leadsOf(looks: DrawnLooks): number[] {
  return looks.shown.map((look) => look.rarityLead)
}

/** Undocked, upright over the tile facing down, then the drill on it until it breaks. */
async function drillFromAbove(page: Page, tile: { tx: number; ty: number }): Promise<void> {
  await page.evaluate(
    ({ target, drillTicks }) => {
      const debug = window.steampunkDebug!
      const snapshot = debug.snapshot()
      if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
      const tick = snapshot.snapshot.tick + 1
      const pose = {
        x: target.tx * 1000 + 500,
        y: (target.ty + 1) * 1000 + 500,
        vx: 0,
        vy: 0,
        upx: 0,
        upy: 1024,
        facing: 2,
        driving: false,
        thrusting: false,
        drilling: false,
        thrustTicks: 0,
        driveTicks: 0,
        drillTicks: 0,
        drive: { x: 0, y: 0 } as const,
      }
      const commands: ScriptedCommand[] = [
        { tick, type: 'undock', payload: {} },
        { tick, type: 'reportPose', payload: pose },
        { tick: tick + drillTicks, type: 'drillTile', payload: { ...target, ticks: drillTicks } },
      ]
      const result = debug.fastForward(drillTicks + 1, commands)
      if (!result.ok) throw new Error(result.problems.join('; '))
    },
    { target: tile, drillTicks: DRILL_TICKS },
  )
}

test.describe('first cut keeps the skin (ticket 698)', () => {
  for (const { label, size } of VIEWPORTS) {
    test(`draws every skin before the first cut and the same after it at ${label}`, async ({
      page,
    }) => {
      test.setTimeout(SLOW_BOX_TIMEOUT_MS)
      await page.setViewportSize(size)
      const errors = await openScenario(page)
      await expect.poll(async () => (await kindLooks(page)).shown.length).toBeGreaterThan(1)
      const fresh = await kindLooks(page)
      expect(new Set(leadsOf(fresh))).toEqual(new Set([0]))

      await drillFromAbove(page, FIRST_ORE)
      await expect
        .poll(async () => (await kindLooks(page)).reveals.fired)
        .toBe(fresh.reveals.fired + 1)
      const cut = await kindLooks(page)
      expect(skinsOf(cut)).toEqual(skinsOf(fresh))
      const changed = cut.shown.filter((look, at) => look.rarityLead !== fresh.shown[at].rarityLead)
      expect(changed.every((look) => look.slot === cut.reveals.lastSlot)).toBe(true)

      await drillFromAbove(page, SAME_TYPE_ORE)
      const second = await kindLooks(page)
      const isNewSpecies = second.reveals.lastSpeciesId !== cut.reveals.lastSpeciesId
      expect(second.reveals.fired).toBe(cut.reveals.fired + (isNewSpecies ? 1 : 0))
      expect(skinsOf(second)).toEqual(skinsOf(fresh))
      expect(errors).toEqual([])
    })
  }
})

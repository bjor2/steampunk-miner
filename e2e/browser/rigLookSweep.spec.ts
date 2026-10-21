/**
 * The rig look sweep (ticket 590; G&V spec v2 on #157, GD lock 6300553486): every track of
 * `rigLook.json` at every step and two tail points, shot at 360 px and at desktop size and
 * attached for review; at 360 px the rig differs between n and n + 1 at every step and for the
 * first 200 tail purchases; and with every track at its brightest look the threat markers, the
 * strip's pips and the collapse warning are still drawn as at the bare rig.
 *
 * The diff is the spec's own acceptance (#157 "Done when": a pixel-diff test with a fixed
 * threshold), so this spec reads pixels where the rulebook's section 5 otherwise asks for state:
 * it only compares two shots of one run, never a committed image. The game's clock is held
 * (`page.clock`) and each look gets the same frames, and a control pair of one count shot twice
 * must stay under the threshold, so a pass is the look and not the rig's idle motion. Below a
 * track's first step and between its steps the look does not change by design (VS on #157: steps
 * only at Systems' thresholds); every purchase from the top step on moves one tail step (GD: the
 * linear tail), which is what n = 1..200 counts.
 */
import { expect, test, type Page } from '@playwright/test'
import { VIEW_SHORT_AXIS_MIN_M } from '../../src/constants/scene'
import type { DebugApi } from '../../src/debug/debugApi'
import RIG_LOOK_FILE from '../../src/features/rig-look/rigLook.json'
import { UI_ID_TEMPLATES } from '../../src/systems/views/screenIds'
import { blockContaining, blockIdOf } from '../../src/systems/world/collapseBlock'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

interface TrackRows {
  track: string
  steps: readonly { from: number; glows: readonly number[] }[]
  tail: {
    delta: number
    palette: readonly string[]
    plating: readonly string[]
    glow: readonly (readonly number[])[]
  }
}

interface ScreenRegion {
  x: number
  y: number
  width: number
  height: number
}

const TRACKS: readonly TrackRows[] = RIG_LOOK_FILE.tracks
const PHONE = { name: 'phone', size: { width: 360, height: 640 } }
const VIEWPORTS = [{ name: 'desktop', size: { width: 1280, height: 720 } }, PHONE]
/** The GD's n = 1..200: tail steps past the top step each track must show apart. */
const TAIL_PURCHASES = 200
/**
 * One visible step at 360 px (#157: Δ is one visible step): at least 16 pixels, a 4 x 4 patch,
 * each moved by at least 24 of 255 on some channel. Fixed here, never tuned to pass.
 */
const CHANNEL_STEP = 24
const CHANGED_PIXELS_MIN = 16
/** Held-clock time each look is given to draw: a few frames at 60 Hz. */
const FRAME_RUN_MS = 100
/** A step's look atlas uploads after its swap (the engine spec's wait). */
const ART_SETTLE_MS = 1500
/** Room around the vehicle body's box for the parts that stand out of it (drill, stack). */
const RIG_MARGIN_PX = 24
/** Below the rig's centre: the ground block forced to warn of a collapse. */
const COLLAPSE_BELOW_MM = 2000
const SCREEN_OCTANTS = [0, 1, 2, 3, 4, 5, 6, 7]
const COLLAPSE_CHIP = UI_ID_TEMPLATES.hudStatus('collapse')
const JPEG_QUALITY = 80
const SWEEP_TIMEOUT_MS = 30 * 60 * 1000

function topOf(rows: TrackRows): number {
  return rows.steps[rows.steps.length - 1].from
}

/** Every step's first count, then two tail points. */
function shotCountsOf(rows: TrackRows): number[] {
  const top = topOf(rows)
  return [...rows.steps.map((step) => step.from), top + rows.tail.delta, top + 2 * rows.tail.delta]
}

/** `[n, n + 1]` across every step's threshold, then the first 200 tail steps. */
function neighbourPairsOf(rows: TrackRows): [number, number][] {
  const top = topOf(rows)
  const steps = rows.steps.map((step): [number, number] => [step.from - 1, step.from])
  const tail = Array.from({ length: TAIL_PURCHASES }, (_, at): [number, number] => [
    top + at * rows.tail.delta,
    top + (at + 1) * rows.tail.delta,
  ])
  return [...steps, ...tail]
}

/** The count of the track's brightest look: its top step, or the tail's brightest glow rung. */
function brightestCountOf(rows: TrackRows): number {
  const { palette, plating, glow, delta } = rows.tail
  const rung = glow.reduce((best, glows, at) => (sumOf(glows) > sumOf(glow[best]) ? at : best), 0)
  const isTopBrighter = sumOf(rows.steps[rows.steps.length - 1].glows) > sumOf(glow[rung])
  return isTopBrighter
    ? topOf(rows)
    : topOf(rows) + delta * (1 + rung * palette.length * plating.length)
}

function sumOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0)
}

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.clock.install()
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.evaluate((zoom) => window.steampunkDebug!.ui.setZoom(zoom), VIEW_SHORT_AXIS_MIN_M)
  return errors
}

/** Stops the game's frames, ticks and timers; `runFor` then draws on demand. */
async function holdClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + 500)
}

function setUpgrade(page: Page, track: string, purchases: number): Promise<void> {
  return page.evaluate(
    ([upgradeId, level]) => {
      const result = window.steampunkDebug!.setUpgrade(upgradeId, level as number)
      if (!result.ok) throw new Error(result.problems.join('; '))
    },
    [track, purchases] as const,
  )
}

function lookPurchasesOf(page: Page, track: string): Promise<number | undefined> {
  return page.evaluate((wanted) => {
    const result = window.steampunkDebug!.features['rig-look'].getLooks()
    const looks = (result as unknown as { looks: { track: string; purchases: number }[] }).looks
    return looks.find((look) => look.track === wanted)?.purchases
  }, track)
}

/** Sets the count and runs the held clock until the rig shows it, the same frames every time. */
async function showHeldLook(page: Page, track: string, purchases: number): Promise<void> {
  await setUpgrade(page, track, purchases)
  await expect
    .poll(async () => {
      await page.clock.runFor(FRAME_RUN_MS)
      return lookPurchasesOf(page, track)
    })
    .toBe(purchases)
}

async function showSettledLook(page: Page, track: string, purchases: number): Promise<void> {
  await setUpgrade(page, track, purchases)
  await expect.poll(() => lookPurchasesOf(page, track)).toBe(purchases)
  await page.waitForTimeout(ART_SETTLE_MS)
}

async function showBareRig(page: Page): Promise<void> {
  for (const { track } of TRACKS) await setUpgrade(page, track, 0)
  for (const { track } of TRACKS) await expect.poll(() => lookPurchasesOf(page, track)).toBe(0)
}

/** The vehicle body's box as the last frame drew it, widened for the parts outside it. */
async function rigRegionOf(page: Page): Promise<ScreenRegion> {
  const box = await page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getVehicleScreenBox()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.box
  })
  const viewport = page.viewportSize()!
  const left = Math.max(0, Math.floor(box.left - RIG_MARGIN_PX))
  const top = Math.max(0, Math.floor(box.top - RIG_MARGIN_PX))
  const right = Math.min(viewport.width, Math.ceil(box.right + RIG_MARGIN_PX))
  const bottom = Math.min(viewport.height, Math.ceil(box.bottom + RIG_MARGIN_PX))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function shootRegion(page: Page, clip: ScreenRegion): Promise<Buffer> {
  return page.screenshot({ clip, animations: 'disabled' })
}

/** Pixels whose largest channel moved by at least `CHANNEL_STEP`, decoded in the page. */
function changedPixelsBetween(page: Page, before: Buffer, after: Buffer): Promise<number> {
  return page.evaluate(
    async ([first, second, step]) => {
      const pixelsOf = async (base64: string): Promise<Uint8ClampedArray> => {
        const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob()
        const bitmap = await createImageBitmap(blob)
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const context = canvas.getContext('2d')!
        context.drawImage(bitmap, 0, 0)
        return context.getImageData(0, 0, bitmap.width, bitmap.height).data
      }
      const [a, b] = await Promise.all([pixelsOf(first), pixelsOf(second)])
      if (a.length !== b.length) return Number.POSITIVE_INFINITY
      let changed = 0
      for (let at = 0; at < a.length; at += 4) {
        const moved = Math.max(
          Math.abs(a[at] - b[at]),
          Math.abs(a[at + 1] - b[at + 1]),
          Math.abs(a[at + 2] - b[at + 2]),
        )
        if (moved >= step) changed++
      }
      return changed
    },
    [before.toString('base64'), after.toString('base64'), CHANNEL_STEP] as const,
  )
}

/** Visits every step with the clock running, so each look's atlas is in before the hold. */
async function loadEveryStepArt(page: Page, rows: TrackRows): Promise<void> {
  for (const purchases of shotCountsOf(rows)) await showSettledLook(page, rows.track, purchases)
}

/** One count shot twice under the held clock: what the rig's own motion changes. */
async function idleChangeOf(page: Page, rows: TrackRows, region: ScreenRegion): Promise<number> {
  await showHeldLook(page, rows.track, topOf(rows))
  const first = await shootRegion(page, region)
  await showHeldLook(page, rows.track, topOf(rows))
  return changedPixelsBetween(page, first, await shootRegion(page, region))
}

/** Each pair whose two looks the threshold cannot tell apart, with its changed pixels. */
async function unchangedPairsOf(page: Page, rows: TrackRows, region: ScreenRegion) {
  const unchanged: string[] = []
  for (const [before, after] of neighbourPairsOf(rows)) {
    await showHeldLook(page, rows.track, before)
    const first = await shootRegion(page, region)
    await showHeldLook(page, rows.track, after)
    const changed = await changedPixelsBetween(page, first, await shootRegion(page, region))
    if (changed < CHANGED_PIXELS_MIN) unchanged.push(`${before}->${after}: ${changed} px`)
  }
  return unchanged
}

async function attachShot(page: Page, name: string): Promise<void> {
  await test.info().attach(name, {
    body: await page.screenshot({ type: 'jpeg', quality: JPEG_QUALITY }),
    contentType: 'image/jpeg',
  })
}

/** Starts the collapse of the ground block under the rig: the warning holds while the clock does. */
async function warnOfCollapseUnderRig(page: Page): Promise<void> {
  const pose = await page.evaluate(() => {
    const result = window.steampunkDebug!.snapshot()
    if (!result.ok) throw new Error(result.problems.join('; '))
    const playerId = Object.keys(result.snapshot.state.players).sort()[0]
    return result.snapshot.state.players[playerId].vehicle.pose
  })
  if (pose === null) throw new Error('the rig has no pose')
  const block = blockIdOf(blockContaining({ xMm: pose.x, yMm: pose.y - COLLAPSE_BELOW_MM }))
  await page.evaluate((id) => {
    const result = window.steampunkDebug!.forceCollapse(id)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, block)
}

function stageEveryThreat(page: Page): Promise<void> {
  return page.evaluate((octants) => {
    const result = window.steampunkDebug!.ui.stageHud({
      isCargoFull: false,
      threatOctant: octants[0],
      threatOctants: octants.slice(1),
    })
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, SCREEN_OCTANTS)
}

/** The threat markers, the strip's shown pips and the collapse chip, as laid out now. */
async function warningRegionsOf(page: Page): Promise<{ name: string; region: ScreenRegion }[]> {
  const warnings = page.locator(
    `[data-hud="threat"], [data-testid^="hud-strip-pip-"]:visible, [data-testid="${COLLAPSE_CHIP}"]`,
  )
  const regions: { name: string; region: ScreenRegion }[] = []
  for (const warning of await warnings.all()) {
    const box = await warning.boundingBox()
    const name = (await warning.getAttribute('data-testid')) ?? 'threat'
    if (box !== null && box.width >= 1 && box.height >= 1) regions.push({ name, region: box })
  }
  return regions
}

interface WarningShot {
  name: string
  region: ScreenRegion
  shot: Buffer
}

/** Eight threat markers and a collapse warning under the rig, drawn under the held clock. */
async function stageWarnings(page: Page): Promise<void> {
  await stageEveryThreat(page)
  await warnOfCollapseUnderRig(page)
  await page.clock.runFor(FRAME_RUN_MS)
  await expect(page.locator('[data-hud="threat"]')).toHaveCount(SCREEN_OCTANTS.length)
  await expect(page.getByTestId(COLLAPSE_CHIP)).toBeVisible()
}

async function shootWarnings(page: Page): Promise<WarningShot[]> {
  const shots: WarningShot[] = []
  for (const { name, region } of await warningRegionsOf(page)) {
    shots.push({ name, region, shot: await shootRegion(page, region) })
  }
  return shots
}

/** Each warning the brightest looks drew differently from the bare rig, with its changed pixels. */
async function redrawnWarningsOf(page: Page, bare: readonly WarningShot[]): Promise<string[]> {
  const redrawn: string[] = []
  for (const { name, region, shot } of bare) {
    const changed = await changedPixelsBetween(page, shot, await shootRegion(page, region))
    if (changed >= CHANGED_PIXELS_MIN) redrawn.push(`${name}: ${changed} px`)
  }
  return redrawn
}

/** Every track at once, then one held run: the collapse warning lasts only 60 ticks. */
async function showBrightestLooks(page: Page): Promise<void> {
  for (const rows of TRACKS) await setUpgrade(page, rows.track, brightestCountOf(rows))
  await expect
    .poll(async () => {
      await page.clock.runFor(FRAME_RUN_MS)
      return Promise.all(TRACKS.map((rows) => lookPurchasesOf(page, rows.track)))
    })
    .toEqual(TRACKS.map(brightestCountOf))
}

test.describe('rig look sweep (ticket 590)', () => {
  for (const viewport of VIEWPORTS) {
    test(`shoots every track at every step and two tail points, ${viewport.name}`, async ({
      page,
    }) => {
      test.setTimeout(SWEEP_TIMEOUT_MS)
      await page.setViewportSize(viewport.size)
      const errors = await openGame(page)
      for (const rows of TRACKS) {
        await showBareRig(page)
        for (const purchases of shotCountsOf(rows)) {
          await showSettledLook(page, rows.track, purchases)
          await attachShot(page, `${rows.track} ${purchases}, ${viewport.name}`)
        }
      }
      expect(errors).toEqual([])
    })
  }

  for (const rows of TRACKS) {
    test(`tells n from n + 1 at 360 px at every step and 200 tail purchases, ${rows.track}`, async ({
      page,
    }) => {
      test.setTimeout(SWEEP_TIMEOUT_MS)
      await page.setViewportSize(PHONE.size)
      const errors = await openGame(page)
      await showBareRig(page)
      await loadEveryStepArt(page, rows)
      await holdClock(page)
      const region = await rigRegionOf(page)
      expect(await idleChangeOf(page, rows, region), 'idle motion').toBeLessThan(CHANGED_PIXELS_MIN)
      expect(await unchangedPairsOf(page, rows, region)).toEqual([])
      expect(errors).toEqual([])
    })
  }

  for (const viewport of VIEWPORTS) {
    test(`draws the warnings as at the bare rig with every track at its brightest, ${viewport.name}`, async ({
      page,
    }) => {
      test.setTimeout(SWEEP_TIMEOUT_MS)
      await page.setViewportSize(viewport.size)
      const errors = await openGame(page)
      await showBareRig(page)
      for (const rows of TRACKS) await loadEveryStepArt(page, rows)
      await showBareRig(page)
      await holdClock(page)
      await stageWarnings(page)
      const bare = await shootWarnings(page)
      await attachShot(page, `warnings, bare rig, ${viewport.name}`)
      await showBrightestLooks(page)
      await expect(page.getByTestId(COLLAPSE_CHIP)).toBeVisible()
      await attachShot(page, `warnings, brightest looks, ${viewport.name}`)
      expect(await redrawnWarningsOf(page, bare)).toEqual([])
      expect(errors).toEqual([])
    })
  }
})

/**
 * The rig look sweep (ticket 590; re-keyed onto the power-decade bands by ticket 809, LK1; GD lock
 * of 24 Oct on #647): every track of `rigLook.json` shot at the golden counts 0, 1, 10, 99, 9999
 * and 1e6, at each authored edge and one either side, and on its first finish band, at 360 px and
 * at desktop size and attached for review; at 360 px and at 1280 px the slot's crop differs across
 * every band edge to the last authored one and the first 20 finish bands past it (Progression: two
 * neighbouring bands never match); and with every line maxed (a million purchases, pips and all)
 * the threat markers, the strip's pips and the collapse warning are still drawn as at the bare rig
 * at 360 px, 1280 x 800 and 1920 x 1080, and zoomed out on the desktop.
 *
 * The diff is the spec's own acceptance (#157 "Done when": a pixel-diff test with a fixed
 * threshold), so this spec reads pixels where the rulebook's section 5 otherwise asks for state:
 * it only compares two shots of one run, never a committed image. The game's clock is held
 * (`page.clock`) and each look gets the same frames, and a control pair of one count shot twice
 * must stay under the threshold, so a pass is the look and not the rig's idle motion. Inside a
 * band the look does not change by design (the VS step rule on #809: one look a band).
 */
import { expect, test, type Page } from '@playwright/test'
import { VIEW_SHORT_AXIS_MAX_M, VIEW_SHORT_AXIS_MIN_M } from '../../src/constants/scene'
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
  steps: readonly { from: number }[]
  band: { step: number; edges: readonly number[] }
}

interface ScreenRegion {
  x: number
  y: number
  width: number
  height: number
}

const TRACKS: readonly TrackRows[] = RIG_LOOK_FILE.tracks
const PHONE = { name: 'phone', size: { width: 360, height: 640 } }
const DESKTOP = { name: 'desktop', size: { width: 1280, height: 720 } }
const VIEWPORTS = [DESKTOP, PHONE]
/** The all-lines-maxed sweep's sizes (#809): phone, laptop and full HD, the last zoomed out too. */
const MAXED_VIEWS = [
  { name: 'phone', size: PHONE.size, zoom: VIEW_SHORT_AXIS_MIN_M },
  { name: '1280x800', size: { width: 1280, height: 800 }, zoom: VIEW_SHORT_AXIS_MIN_M },
  { name: '1920x1080', size: { width: 1920, height: 1080 }, zoom: VIEW_SHORT_AXIS_MIN_M },
  {
    name: '1920x1080 zoomed out',
    size: { width: 1920, height: 1080 },
    zoom: VIEW_SHORT_AXIS_MAX_M,
  },
]
/** The golden counts every line is shot at (#809). */
const GOLDEN_COUNTS = [0, 1, 10, 99, 9_999, 1_000_000]
/** Finish bands past the last authored edge each crop must tell apart. */
const FINISH_BANDS = 20
/** Every line maxed: a million purchases, far past any authored edge. */
const MAXED_PURCHASES = 1_000_000
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

/** The golden counts, each authored edge and one either side, and the first finish band. */
function shotCountsOf(rows: TrackRows): number[] {
  const edges = rows.steps.flatMap((step) => [step.from - 1, step.from, step.from + 1])
  const counts = [...GOLDEN_COUNTS, ...edges, topOf(rows) + rows.band.step]
  return [...new Set(counts)].sort((a, b) => a - b)
}

/** `[n - 1, n]` across every band edge to the last authored one, then 20 finish bands on. */
function neighbourPairsOf(rows: TrackRows): [number, number][] {
  const { step, edges } = rows.band
  const last = edges[edges.length - 1]
  const onward = Array.from({ length: FINISH_BANDS }, (_, at) => last + (at + 1) * step)
  return [...edges, ...onward].map((edge): [number, number] => [edge - 1, edge])
}

async function openGame(page: Page, zoom = VIEW_SHORT_AXIS_MIN_M): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.clock.install()
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.evaluate((shortAxis) => window.steampunkDebug!.ui.setZoom(shortAxis), zoom)
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

/** Visits every authored step with the clock running, so each atlas is in before the hold. */
async function loadEveryStepArt(page: Page, rows: TrackRows): Promise<void> {
  for (const { from } of rows.steps) await showSettledLook(page, rows.track, from)
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

/** Every line maxed at once, then one held run: the collapse warning lasts only 60 ticks. */
async function showMaxedLooks(page: Page): Promise<void> {
  for (const rows of TRACKS) await setUpgrade(page, rows.track, MAXED_PURCHASES)
  await expect
    .poll(async () => {
      await page.clock.runFor(FRAME_RUN_MS)
      return Promise.all(TRACKS.map((rows) => lookPurchasesOf(page, rows.track)))
    })
    .toEqual(TRACKS.map(() => MAXED_PURCHASES))
}

test.describe('rig look sweep (tickets 590, 809)', () => {
  for (const viewport of VIEWPORTS) {
    test(`shoots every track at the golden counts and each authored edge, ${viewport.name}`, async ({
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
    for (const viewport of VIEWPORTS) {
      test(`tells neighbouring bands apart in the slot's crop, ${rows.track}, ${viewport.name}`, async ({
        page,
      }) => {
        test.setTimeout(SWEEP_TIMEOUT_MS)
        await page.setViewportSize(viewport.size)
        const errors = await openGame(page)
        await showBareRig(page)
        await loadEveryStepArt(page, rows)
        await holdClock(page)
        const region = await rigRegionOf(page)
        expect(await idleChangeOf(page, rows, region), 'idle motion').toBeLessThan(
          CHANGED_PIXELS_MIN,
        )
        expect(await unchangedPairsOf(page, rows, region)).toEqual([])
        expect(errors).toEqual([])
      })
    }
  }

  for (const viewport of MAXED_VIEWS) {
    test(`draws the warnings as at the bare rig with every line maxed, ${viewport.name}`, async ({
      page,
    }) => {
      test.setTimeout(SWEEP_TIMEOUT_MS)
      await page.setViewportSize(viewport.size)
      const errors = await openGame(page, viewport.zoom)
      await showBareRig(page)
      for (const rows of TRACKS) await loadEveryStepArt(page, rows)
      await showBareRig(page)
      await holdClock(page)
      await stageWarnings(page)
      const bare = await shootWarnings(page)
      await attachShot(page, `warnings, bare rig, ${viewport.name}`)
      await showMaxedLooks(page)
      await expect(page.getByTestId(COLLAPSE_CHIP)).toBeVisible()
      await attachShot(page, `warnings, every line maxed, ${viewport.name}`)
      expect(await redrawnWarningsOf(page, bare)).toEqual([])
      expect(errors).toEqual([])
    })
  }
})

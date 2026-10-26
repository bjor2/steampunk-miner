/**
 * The rig at every width Mark in the preview build (ticket 666, part C of #661; the HS goldens of
 * the #666 lock): ticket 913 draws each rig's hull at its collider's width and holds the turret,
 * the coal tender and the drill head's mount to their size on the body's edge. At the max loadout
 * (every track at tier 3, the guns at their cap, the tender's top wagon, the twin bit, the cutters
 * and the boom), and at width levels 0 to 3 (the cutters, their Mark 2, Wide's reamers), the spec
 * waits for the collider to settle at the width row on the dock's pad and asserts through
 * `steampunkDebug` that the drawn body matches it within 0.05 m, that every held mount is seated
 * (the rig look's `getBodyWidth()`) and that no part or mount is drawn twice (`vehicleParts()`).
 * Bare and Wide are told apart in the rig's crop at 360 px and at 1280 px under a held clock, the
 * #590 sweep's threshold with a control pair shot twice (two shots of one run, never a committed
 * image). Shots of each level on the pad and after a short dig down, so the hole hugs the rig, are
 * attached for review, never compared.
 */
import { expect, test, type Page } from '@playwright/test'
import { MM_PER_METRE } from '../../src/constants/physics'
import { VIEW_SHORT_AXIS_MIN_M } from '../../src/constants/scene'
import type { DebugApi } from '../../src/debug/debugApi'
import type { ScriptedCommand } from '../../src/systems/fastForward'
import { bodyWidthMmAt } from '../../src/systems/vehicle/drillBore'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

interface ScreenRegion {
  x: number
  y: number
  width: number
  height: number
}

interface MountSeat {
  id: string
  bodyShare: number
  overhangM: number
  drawnSizeShare: number
}

interface BodyWidthRead {
  widthLevel: number
  bodyHalfSide: number
  drawnWidth: number
  seats: MountSeat[]
  unseatedIds: string[]
}

interface WidthStep {
  level: number
  /** The width gear the level needs, by slot, and the Marks owned besides. */
  flank: string | null
  owned: string[]
  isWide: boolean
}

const FORK_LANE = 'drill-gear'
const FORK_PLANET = 16
const CUTTERS = 'gear.side_cutters'
const CUTTERS_MARK_2 = 'gear.side_cutters_mark_2'
/** The width ladder #308 sells: cutters Mark 1, Mark 2, then +1 with Wide (ticket 749). */
const WIDTH_STEPS: readonly WidthStep[] = [
  { level: 0, flank: null, owned: [], isWide: false },
  { level: 1, flank: CUTTERS, owned: [], isWide: false },
  { level: 2, flank: CUTTERS, owned: [CUTTERS_MARK_2], isWide: false },
  // A forced branch stays chosen: Wide comes last.
  { level: 3, flank: CUTTERS, owned: [CUTTERS_MARK_2], isWide: true },
]
/** The max loadout's other sockets: the twin-bit head and the reach boom. */
const OTHER_SLOTS = { 'drill.head': 'gear.twin_bit', 'drill.collar': 'gear.reach_boom' }
const UPGRADE_TRACKS = ['drill_power', 'drill_tip', 'engine', 'boiler', 'cargo_hold', 'hull']
/** The rig's tier counts majors over every track (#20): 200 purchases each is tier 3. */
const TRACK_PURCHASES = 200
/** The guns' cap step (`setGunLevel`: the mount at 10 to the cap at 160). */
const GUN_CAP = 160
/** The tender's top authored wagon (`fuelTender.json`, ticket 874). */
const TOP_TANK_LEVEL = 18
const TICKS_A_PURCHASE = 2
const VIEWPORTS = [
  { name: 'phone', size: { width: 360, height: 640 } },
  { name: 'desktop', size: { width: 1280, height: 720 } },
]
/** The ticket's tolerance, m. */
const WIDTH_TOLERANCE_M = 0.05
/** The #590 sweep's visible step: 16 pixels, each moved by 24 of 255 on some channel. */
const CHANNEL_STEP = 24
const CHANGED_PIXELS_MIN = 16
const FRAME_RUN_MS = 100
const ART_SETTLE_MS = 1500
const RIG_MARGIN_PX = 24
const DIG_KEYS = [
  { key: 'ArrowLeft', holdMs: 1500 },
  { key: 'ArrowDown', holdMs: 3000 },
]
const JPEG_QUALITY = 80
const SPEC_TIMEOUT_MS = 10 * 60 * 1000

async function openGame(page: Page, holdsClock = false): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  if (holdsClock) await page.clock.install()
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.evaluate(
    ([shortAxis, planet, tracks, purchases, gunCap]) => {
      const debug = window.steampunkDebug!
      const steps = [
        () => debug.ui.setZoom(shortAxis),
        () => debug.setPlanet(planet),
        () => debug.giveMoney('1e40'),
        () => debug.features['tech-tree']!.jumpToDepth!(planet),
        ...tracks.map((track) => () => debug.setUpgrade(track, purchases)),
        () => debug.setGunLevel(gunCap),
        () => debug.teleportToDock('sell'),
      ]
      for (const step of steps) {
        const result = step()
        if (!result.ok) throw new Error(result.problems.join('; '))
      }
    },
    [VIEW_SHORT_AXIS_MIN_M, FORK_PLANET, UPGRADE_TRACKS, TRACK_PURCHASES, GUN_CAP] as const,
  )
  await buyTankLevels(page, TOP_TANK_LEVEL - 1)
  return errors
}

/** Buys `count` tank levels at the Sell bay through the authority, two ticks apart. */
function buyTankLevels(page: Page, count: number): Promise<void> {
  return page.evaluate(
    ([levels, ticksApart]) => {
      const debug = window.steampunkDebug!
      const snapshot = debug.snapshot()
      if (!snapshot.ok) throw new Error('no snapshot')
      const first = snapshot.snapshot.tick + 1
      const buys = Array.from({ length: levels }, (_, at) => ({
        tick: first + at * ticksApart,
        type: 'buyFuelTank',
        payload: {},
      })) as unknown as ScriptedCommand[]
      const played = debug.fastForward(levels * ticksApart, buys)
      if (!played.ok) throw new Error(played.problems.join('; '))
    },
    [count, TICKS_A_PURCHASE] as const,
  )
}

function fitWidthGear(page: Page, step: WidthStep): Promise<void> {
  const slots = step.flank === null ? OTHER_SLOTS : { ...OTHER_SLOTS, 'drill.flank': step.flank }
  return page.evaluate(
    ([fitted, owned]) => {
      const result = window.steampunkDebug!.setVehicleLoadout(fitted, owned)
      if (!result.ok) throw new Error(result.problems.join('; '))
    },
    [slots, [...Object.values(slots), ...step.owned]] as const,
  )
}

/** Forces Wide on the session's next tick, as `balance:forks` does. */
function forceWide(page: Page): Promise<void> {
  return page.evaluate((lane) => {
    const debug = window.steampunkDebug!
    const snapshot = debug.snapshot()
    if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
    const { tick } = snapshot.snapshot
    const commands = [
      { tick, type: 'debug.tech-tree.forceFork', payload: { lane, branch: 'wide' } },
    ]
    const sent = debug.fastForward(1, commands as Parameters<DebugApi['fastForward']>[1])
    if (!sent.ok) throw new Error(sent.problems.join('; '))
  }, FORK_LANE)
}

function readBodyWidth(page: Page): Promise<BodyWidthRead> {
  return page.evaluate(
    () => window.steampunkDebug!.features['rig-look'].getBodyWidth() as unknown as BodyWidthRead,
  )
}

/** How far the collider sits from the width row's half side, m. */
function settleGapOf(read: BodyWidthRead, level: number): number {
  return Math.abs(read.bodyHalfSide - bodyWidthMmAt(level) / 2 / MM_PER_METRE)
}

/** Fits the level's gear, on the pad, and waits until the collider has grown to the width row. */
async function widenTo(page: Page, step: WidthStep, holdsClock = false): Promise<BodyWidthRead> {
  await page.evaluate(() => window.steampunkDebug!.teleportToDock('sell'))
  await fitWidthGear(page, step)
  if (step.isWide) await forceWide(page)
  await expect
    .poll(async () => {
      if (holdsClock) await page.clock.runFor(FRAME_RUN_MS)
      const read = await readBodyWidth(page)
      return read.widthLevel === step.level && settleGapOf(read, step.level) <= WIDTH_TOLERANCE_M
    })
    .toBe(true)
  return readBodyWidth(page)
}

/** Every part id and mount the rig draws, each once. */
async function drawnTwice(page: Page): Promise<string[]> {
  const drawn = await page.evaluate(() => {
    const result = window.steampunkDebug!.vehicleParts()
    if (!result.ok) throw new Error(result.problems.join('; '))
    const mounts = result.mounted.map((mount) => `${mount.assetId}@${mount.attachId}`)
    return [...result.partIds, ...result.lookPartIds, ...mounts]
  })
  return drawn.filter((id, at) => drawn.indexOf(id) !== at)
}

function expectSeatedAtWidth(read: BodyWidthRead, step: WidthStep): void {
  const label = `width level ${step.level}`
  expect(Math.abs(read.drawnWidth - 2 * read.bodyHalfSide), label).toBeLessThanOrEqual(
    WIDTH_TOLERANCE_M,
  )
  expect(read.seats.length, label).toBeGreaterThan(0)
  expect(read.unseatedIds, label).toEqual([])
  for (const seat of read.seats) expect(seat.drawnSizeShare, `${label} ${seat.id}`).toBe(1)
}

async function attachShot(page: Page, name: string): Promise<void> {
  await test.info().attach(name, {
    body: await page.screenshot({ type: 'jpeg', quality: JPEG_QUALITY }),
    contentType: 'image/jpeg',
  })
}

async function digDownBeside(page: Page): Promise<void> {
  for (const { key, holdMs } of DIG_KEYS) {
    await page.keyboard.down(key)
    await page.waitForTimeout(holdMs)
    await page.keyboard.up(key)
  }
}

/**
 * The rig's crop: the body's screen box grown to the drawn width of `widthLevel`, and a margin.
 * Bare and Wide are shot in one crop, the wider one, so the diff compares like with like.
 */
async function rigRegionOf(page: Page, widthLevel: number): Promise<ScreenRegion> {
  const box = await page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getVehicleScreenBox()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.box
  })
  const scale = bodyWidthMmAt(widthLevel) / bodyWidthMmAt(0)
  const middle = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 }
  const half = { x: ((box.right - box.left) / 2) * scale, y: ((box.bottom - box.top) / 2) * scale }
  const viewport = page.viewportSize()!
  const left = Math.max(0, Math.floor(middle.x - half.x - RIG_MARGIN_PX))
  const top = Math.max(0, Math.floor(middle.y - half.y - RIG_MARGIN_PX))
  const right = Math.min(viewport.width, Math.ceil(middle.x + half.x + RIG_MARGIN_PX))
  const bottom = Math.min(viewport.height, Math.ceil(middle.y + half.y + RIG_MARGIN_PX))
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

test.describe('rig body width looks (ticket 666)', () => {
  test('seats every mount on the drawn body at each width level, nothing drawn twice', async ({
    page,
  }) => {
    test.setTimeout(SPEC_TIMEOUT_MS)
    const errors = await openGame(page)
    for (const step of WIDTH_STEPS) {
      expectSeatedAtWidth(await widenTo(page, step), step)
      expect(await drawnTwice(page), `width level ${step.level}`).toEqual([])
    }
    expect(errors).toEqual([])
  })

  for (const viewport of VIEWPORTS) {
    test(`tells Bare and Wide apart in the rig's crop, ${viewport.name}`, async ({ page }) => {
      test.setTimeout(SPEC_TIMEOUT_MS)
      await page.setViewportSize(viewport.size)
      const errors = await openGame(page, true)
      const bareStep = WIDTH_STEPS[0]
      const wideStep = WIDTH_STEPS[WIDTH_STEPS.length - 1]
      await widenTo(page, bareStep, true)
      await page.clock.runFor(ART_SETTLE_MS)
      const now = await page.evaluate(() => Date.now())
      await page.clock.pauseAt(now + 500)
      const region = await rigRegionOf(page, wideStep.level)
      const control = await shootRegion(page, region)
      await page.clock.runFor(FRAME_RUN_MS)
      const idle = await changedPixelsBetween(page, control, await shootRegion(page, region))
      expect(idle, 'idle motion').toBeLessThan(CHANGED_PIXELS_MIN)
      await widenTo(page, wideStep, true)
      await page.clock.runFor(FRAME_RUN_MS)
      const wideShot = await shootRegion(page, region)
      expect(await changedPixelsBetween(page, control, wideShot)).toBeGreaterThanOrEqual(
        CHANGED_PIXELS_MIN,
      )
      expect(errors).toEqual([])
    })

    test(`shoots each width level on the pad and in its own hole, ${viewport.name}`, async ({
      page,
    }) => {
      test.setTimeout(SPEC_TIMEOUT_MS)
      await page.setViewportSize(viewport.size)
      const errors = await openGame(page)
      for (const step of WIDTH_STEPS) {
        await widenTo(page, step)
        await page.waitForTimeout(ART_SETTLE_MS)
        await attachShot(page, `width level ${step.level} on the pad, ${viewport.name}`)
        await digDownBeside(page)
        expectSeatedAtWidth(await readBodyWidth(page), step)
        await attachShot(page, `width level ${step.level} in its hole, ${viewport.name}`)
      }
      expect(errors).toEqual([])
    })
  }
})

/**
 * The drill types on the rig in the preview build (ticket 623; the #590 sweep's rows for each
 * type, GD lock of 25 Oct on #623): an equipped type swaps its own head of
 * `vehicle-look-drill-type` onto the drill head in place of the rig's bit, the cutters' Mark 2
 * its own; unequipping brings the bit back; with every type active the twin bit takes the head
 * and the cutters and the boom keep their own item art, nothing drawn twice. The parts are
 * asserted through `steampunkDebug` (`vehicleParts()`, the rig look's `getLooks()`), and each head
 * is told apart from the bare rig and from every other head in the rig's crop at 360 px and at
 * 1280 px, under a held clock, with a control pair shot twice (the #590 sweep's threshold and
 * method: two shots of one run, never a committed image). Shots of every head, drilling down and
 * driving each way so the head turns, and of the max loadout are attached for review.
 */
import { expect, test, type Page } from '@playwright/test'
import { VIEW_SHORT_AXIS_MIN_M } from '../../src/constants/scene'
import type { DebugApi } from '../../src/debug/debugApi'

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

interface DrillTypeRow {
  name: string
  /** The loadout the type needs, by slot, and the items owned besides. */
  slots: Record<string, string>
  owned: string[]
  /** The fork branch it needs, chosen through the tree's forced-branch debug command. */
  fork: string | null
  parts: string[]
}

const ASSET_ID = 'vehicle-look-drill-type'
const FORK_LANE = 'drill-gear'
const FORK_PLANET = 16
const TYPES: readonly DrillTypeRow[] = [
  {
    name: 'twin bit',
    slots: { 'drill.head': 'gear.twin_bit' },
    owned: [],
    fork: null,
    parts: ['twin-bit-head'],
  },
  {
    name: 'side cutters Mark 1',
    slots: { 'drill.flank': 'gear.side_cutters' },
    owned: [],
    fork: null,
    parts: ['cutter-yoke-1', 'cutter-arm-up-1', 'cutter-arm-down-1'],
  },
  {
    name: 'side cutters Mark 2',
    slots: { 'drill.flank': 'gear.side_cutters' },
    owned: ['gear.side_cutters_mark_2'],
    fork: null,
    parts: ['cutter-yoke-2', 'cutter-arm-up-2', 'cutter-arm-down-2'],
  },
  {
    name: 'reach boom',
    slots: { 'drill.collar': 'gear.reach_boom' },
    owned: [],
    fork: null,
    parts: ['boom-barrel', 'boom-ram'],
  },
  // A forced branch stays chosen, and it outranks the cutters and the boom on the head: last.
  { name: 'gallery reamers', slots: {}, owned: [], fork: 'wide', parts: ['gallery-reamers'] },
  { name: 'plunge crown', slots: {}, owned: [], fork: 'deep', parts: ['plunge-crown'] },
]
const MAX_LOADOUT: DrillTypeRow = {
  name: 'every type',
  slots: {
    'drill.head': 'gear.twin_bit',
    'drill.flank': 'gear.side_cutters',
    'drill.collar': 'gear.reach_boom',
  },
  owned: ['gear.side_cutters_mark_2'],
  fork: 'deep',
  parts: ['twin-bit-head'],
}
const VIEWPORTS = [
  { name: 'phone', size: { width: 360, height: 640 } },
  { name: 'desktop', size: { width: 1280, height: 720 } },
]
/** The #590 sweep's visible step: 16 pixels, each moved by 24 of 255 on some channel. */
const CHANNEL_STEP = 24
const CHANGED_PIXELS_MIN = 16
const FRAME_RUN_MS = 100
const ART_SETTLE_MS = 1500
const RIG_MARGIN_PX = 24
const TURN_KEYS = ['ArrowDown', 'ArrowLeft', 'ArrowRight']
const TURN_HOLD_MS = 400
const JPEG_QUALITY = 80
const SPEC_TIMEOUT_MS = 10 * 60 * 1000

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.clock.install()
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.evaluate(
    ([shortAxis, planet]) => {
      const debug = window.steampunkDebug!
      const steps = [
        () => debug.ui.setZoom(shortAxis),
        () => debug.setPlanet(planet),
        () => debug.giveMoney('1e40'),
        () => debug.features['tech-tree']!.jumpToDepth!(planet),
      ]
      for (const step of steps) {
        const result = step()
        if (!result.ok) throw new Error(result.problems.join('; '))
      }
    },
    [VIEW_SHORT_AXIS_MIN_M, FORK_PLANET] as const,
  )
  return errors
}

function setLoadout(page: Page, row: DrillTypeRow | null): Promise<void> {
  return page.evaluate(
    ([slots, owned]) => {
      const result = window.steampunkDebug!.setVehicleLoadout(slots, owned)
      if (!result.ok) throw new Error(result.problems.join('; '))
    },
    [row?.slots ?? {}, row === null ? [] : [...Object.values(row.slots), ...row.owned]] as const,
  )
}

/** Forces the drill-gear fork's branch on the session's next tick, as `balance:forks` does. */
function forceFork(page: Page, branch: string): Promise<void> {
  return page.evaluate(
    ([lane, wanted]) => {
      const debug = window.steampunkDebug!
      const snapshot = debug.snapshot()
      if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
      const { tick } = snapshot.snapshot
      const commands = [
        { tick, type: 'debug.tech-tree.forceFork', payload: { lane, branch: wanted } },
      ]
      const sent = debug.fastForward(1, commands as Parameters<DebugApi['fastForward']>[1])
      if (!sent.ok) throw new Error(sent.problems.join('; '))
    },
    [FORK_LANE, branch] as const,
  )
}

interface RigParts {
  partIds: string[]
  lookPartIds: string[]
  mounted: string[]
}

function rigParts(page: Page): Promise<RigParts> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.vehicleParts()
    if (!result.ok) throw new Error(result.problems.join('; '))
    const mounted = result.mounted.map((mount) => `${mount.assetId}@${mount.attachId}`)
    return { partIds: result.partIds, lookPartIds: result.lookPartIds, mounted }
  })
}

const isDrillBit = (partId: string): boolean => /^t\d+-drill-bit$/.test(partId)

/** The drill types' parts the rig draws now, sorted. */
async function drillTypeParts(page: Page): Promise<string[]> {
  const { lookPartIds } = await rigParts(page)
  return lookPartIds.filter((id) => id.startsWith(`${ASSET_ID}/`)).sort()
}

function expectedParts(row: DrillTypeRow | null): string[] {
  return (row?.parts ?? []).map((part) => `${ASSET_ID}/${part}`).sort()
}

/** Fits the row's type (or none) and waits until the rig draws its head. */
async function showType(page: Page, row: DrillTypeRow | null, isHeld = false): Promise<void> {
  // A bare rig after a fork type cannot be shown: the spec visits the fork types last.
  await setLoadout(page, row)
  if (row?.fork) await forceFork(page, row.fork)
  await expect
    .poll(async () => {
      if (isHeld) await page.clock.runFor(FRAME_RUN_MS)
      return drillTypeParts(page)
    })
    .toEqual(expectedParts(row))
}

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

async function attachShot(page: Page, name: string): Promise<void> {
  await test.info().attach(name, {
    body: await page.screenshot({ type: 'jpeg', quality: JPEG_QUALITY }),
    contentType: 'image/jpeg',
  })
}

/** One head with the clock running: every head is cut from the one atlas, in before the hold. */
async function loadTheHeadsAtlas(page: Page): Promise<void> {
  await showType(page, TYPES[0])
  await page.waitForTimeout(ART_SETTLE_MS)
}

/** The bare rig and every head, each shot in the rig's crop under the held clock. */
async function shootEveryHead(page: Page, region: ScreenRegion): Promise<Map<string, Buffer>> {
  const shots = new Map<string, Buffer>()
  await showType(page, null, true)
  shots.set('bare', await shootRegion(page, region))
  for (const row of TYPES) {
    await showType(page, row, true)
    shots.set(row.name, await shootRegion(page, region))
  }
  return shots
}

/** Every pair of looks (bare included) the threshold cannot tell apart, with its pixels. */
async function alikePairsOf(page: Page, shots: Map<string, Buffer>): Promise<string[]> {
  const names = [...shots.keys()]
  const alike: string[] = []
  for (const [at, first] of names.entries()) {
    for (const second of names.slice(at + 1)) {
      const changed = await changedPixelsBetween(page, shots.get(first)!, shots.get(second)!)
      if (changed < CHANGED_PIXELS_MIN) alike.push(`${first} ~ ${second}: ${changed} px`)
    }
  }
  return alike
}

test.describe('drill type looks (ticket 623)', () => {
  test('swaps each equipped type onto the head in place of the bit, and brings the bit back', async ({
    page,
  }) => {
    test.setTimeout(SPEC_TIMEOUT_MS)
    const errors = await openGame(page)
    for (const row of TYPES) {
      await showType(page, row)
      expect((await rigParts(page)).partIds.filter(isDrillBit), row.name).toEqual([])
      if (row.fork !== null) continue
      await showType(page, null)
      expect((await rigParts(page)).partIds.filter(isDrillBit), row.name).toHaveLength(1)
    }
    expect(errors).toEqual([])
  })

  test('gives the head to the twin bit at the max loadout, the cutters and boom on their own art', async ({
    page,
  }) => {
    const errors = await openGame(page)
    await showType(page, MAX_LOADOUT)
    const { mounted } = await rigParts(page)
    expect(mounted).toEqual(
      expect.arrayContaining([
        'vehicle-item-gear-side-cutters@drill.flank',
        'vehicle-item-gear-reach-boom@drill.collar',
      ]),
    )
    expect(mounted.filter((mount) => mount.endsWith('@drill.head'))).toEqual([])
    expect(new Set(mounted).size).toBe(mounted.length)
    expect(errors).toEqual([])
  })

  for (const viewport of VIEWPORTS) {
    test(`tells every head apart from the bare rig and from each other, ${viewport.name}`, async ({
      page,
    }) => {
      test.setTimeout(SPEC_TIMEOUT_MS)
      await page.setViewportSize(viewport.size)
      const errors = await openGame(page)
      await loadTheHeadsAtlas(page)
      const now = await page.evaluate(() => Date.now())
      await page.clock.pauseAt(now + 500)
      const region = await rigRegionOf(page)
      const control = await shootRegion(page, region)
      await page.clock.runFor(FRAME_RUN_MS)
      const idle = await changedPixelsBetween(page, control, await shootRegion(page, region))
      expect(idle, 'idle motion').toBeLessThan(CHANGED_PIXELS_MIN)
      expect(await alikePairsOf(page, await shootEveryHead(page, region))).toEqual([])
      expect(errors).toEqual([])
    })

    test(`shoots every head turning with the drill and the max loadout, ${viewport.name}`, async ({
      page,
    }) => {
      test.setTimeout(SPEC_TIMEOUT_MS)
      await page.setViewportSize(viewport.size)
      const errors = await openGame(page)
      for (const row of [...TYPES, MAX_LOADOUT]) {
        await showType(page, row)
        await page.waitForTimeout(ART_SETTLE_MS)
        await attachShot(page, `${row.name}, ${viewport.name}`)
        for (const key of TURN_KEYS) {
          await page.keyboard.down(key)
          await page.waitForTimeout(TURN_HOLD_MS)
          await attachShot(page, `${row.name}, ${key}, ${viewport.name}`)
          await page.keyboard.up(key)
          expect(await drillTypeParts(page), `${row.name} ${key}`).toEqual(expectedParts(row))
        }
      }
      expect(errors).toEqual([])
    })
  }
})

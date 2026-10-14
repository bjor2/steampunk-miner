/**
 * The P16 fork branches on the rig in the preview build (ticket 270, GD lock on #255): choosing a
 * branch hangs its part on the car, and a re-choice at the Works swaps the part and plays the
 * turntable beat, which hands the turn back once played. Asserted through
 * `steampunkDebug.vehicleParts().mounted`, the tech tree's `getForks()` and the workshop's
 * `getTurntable()`, never pixels. The branches arrive with their lanes (#255 builds 3-5); until a
 * lane registers a pair there is nothing to choose and the spec skips.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

interface PartMount {
  assetId: string
  attachId: string
}

interface ForkBranchRead {
  lane: string
  branch: string
  isActive: boolean
  mounts: PartMount[]
}

interface TurntableRead {
  radians: number
  beat: { faceRadians: number; startTick: number } | null
}

const SHOWCASE = '[data-slice-screen="workshop.showcase"]'
const FORK_PLANET = 16
/** Lanes whose branches need no bay to research come first; the aetheric lane needs the lab. */
const LANE_ORDER = ['drill-gear', 'mobility', 'sensing', 'extraction', 'terrain', 'aetheric']

async function openOnForkPlanet(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.evaluate((planet) => {
    const debug = window.steampunkDebug!
    const steps = [
      () => debug.setPlanet(planet),
      () => debug.giveMoney('1e40'),
      () => debug.features['tech-tree']!.jumpToDepth!(planet),
    ]
    for (const step of steps) {
      const result = step()
      if (!result.ok) throw new Error(result.problems.join('; '))
    }
  }, FORK_PLANET)
  return errors
}

function readForks(page: Page): Promise<ForkBranchRead[]> {
  return page.evaluate(() => {
    const read = window.steampunkDebug!.features['tech-tree']!.getForks!() as unknown as {
      branches: ForkBranchRead[]
    }
    return read.branches
  })
}

/** Both branches of the first lane that registers a pair, in `LANE_ORDER`; null for none. */
function firstPairOf(branches: readonly ForkBranchRead[]): [ForkBranchRead, ForkBranchRead] | null {
  for (const lane of LANE_ORDER) {
    const pair = branches.filter((branch) => branch.lane === lane)
    if (pair.length === 2) return [pair[0], pair[1]]
  }
  return null
}

/** Submits the fork command as the player would, on the session's next tick. */
function submitFork(page: Page, command: 'choose_fork' | 'rechoose_fork', pick: ForkBranchRead) {
  return page.evaluate(
    ([type, lane, branch]) => {
      const debug = window.steampunkDebug!
      const snapshot = debug.snapshot()
      if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
      const { tick } = snapshot.snapshot
      const commands = [{ tick, type: `tech-tree.${type}`, payload: { lane, branch } }]
      const sent = debug.fastForward(1, commands as Parameters<DebugApi['fastForward']>[1])
      if (!sent.ok) throw new Error(sent.problems.join('; '))
    },
    [command, pick.lane, pick.branch] as const,
  )
}

async function mountedParts(page: Page): Promise<PartMount[]> {
  const mounted = await page.evaluate(() => {
    const result = window.steampunkDebug!.vehicleParts()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.mounted
  })
  return mounted.map(({ assetId, attachId }) => ({ assetId, attachId }))
}

function activeBranchOf(page: Page, lane: string): Promise<string | null> {
  return readForks(page).then(
    (branches) => branches.find((read) => read.lane === lane && read.isActive)?.branch ?? null,
  )
}

function readTurntable(page: Page): Promise<TurntableRead> {
  return page.evaluate(
    () => window.steampunkDebug!.features.workshop!.getTurntable!() as unknown as TurntableRead,
  )
}

test.describe('fork branch parts on the rig (ticket 270)', () => {
  test('choosing a branch hangs its part, and a re-choice at the Works swaps it on the turntable beat', async ({
    page,
  }) => {
    const errors = await openOnForkPlanet(page)
    const pair = firstPairOf(await readForks(page))
    test.skip(pair === null, 'no lane registers a P16 fork pair yet (#255 builds 3-5)')
    const [first, second] = pair!

    await submitFork(page, 'choose_fork', first)
    await expect.poll(() => activeBranchOf(page, first.lane)).toBe(first.branch)
    await expect.poll(() => mountedParts(page)).toEqual(expect.arrayContaining(first.mounts))

    await page.evaluate(() => window.steampunkDebug!.teleportToDock('upgrade'))
    await expect(page.locator(SHOWCASE)).toBeVisible({ timeout: 60_000 })
    await submitFork(page, 'rechoose_fork', second)
    await expect.poll(() => activeBranchOf(page, first.lane)).toBe(second.branch)
    await expect.poll(() => mountedParts(page)).toEqual(expect.arrayContaining(second.mounts))
    for (const mount of first.mounts) expect(await mountedParts(page)).not.toContainEqual(mount)

    await expect.poll(async () => (await readTurntable(page)).beat).not.toBeNull()
    await expect.poll(async () => (await readTurntable(page)).radians, { timeout: 10_000 }).toBe(0)
    expect(errors).toEqual([])
  })
})

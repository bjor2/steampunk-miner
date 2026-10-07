/**
 * The rivet patch's hold ring on the touch slot column (ticket 253, G&V's definition on #204):
 * 45 ticks into the 90-tick hold the slot reads half held and draws its ring, and a single thrust
 * tap snaps the ring back and refunds the unit. State through `steampunkDebug` and the DOM's test
 * ids; the half-filled ring is attached as a screenshot for the eye, never compared as pixels.
 * The page's clock is held, so only `fastForward` moves the authority. The clank and the chime are
 * the feedback cues' (`rivetPatch.test.ts`).
 */
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { ScriptedCommand } from '../../../src/systems/fastForward'
// Brings the slice's `power-up-core.use_power_up` into `ScriptedCommand`'s command types.
import type {} from '../../../src/features/power-up-core/systems/powerUpEvents'
import { currentCell } from './screenHelpers'

const RIVET_PATCH = 'consumable.rivet_patch'
const PLANET_1_START = readFileSync(
  new URL('../../../scenarios/planet1-start.scenario.json', import.meta.url),
  'utf8',
)
/** Seed 83921's first surface ore tile of planet 1: the miner stands still on the cell above. */
const STAND = { tx: 12, ty: 298 }
/** The patch's wind-up, then 45 of its 90 hold ticks. */
const WINDUP_TICKS = 6
const HALF_HOLD_TICKS = 45
/** Far enough ahead that the page clock has not passed it when the pause lands. */
const HOLD_AFTER_MS = 2000

interface SlotRead {
  itemId: string
  holdPercent: number
}

test.beforeEach(() => {
  const cell = currentCell()
  test.skip(!cell.isTouch || cell.isPortrait, 'the slot column shows in landscape on touch screens')
})

async function openWithPatchSlotted(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.clock.install()
  await page.goto(`/?debug&scenario=${encodeURIComponent(PLANET_1_START)}`)
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + HOLD_AFTER_MS)
  const slotted = await page.evaluate((itemId) => {
    const debug = window.steampunkDebug!
    debug.freezeEnemies(true)
    return debug.setVehicleLoadout({ 'powerup.1': itemId }).ok
  }, RIVET_PATCH)
  expect(slotted).toBe(true)
  return errors
}

/** Undocked and at rest above `STAND`, the patch pressed, then held until 45 ticks in. */
async function holdPatchHalfway(page: Page): Promise<void> {
  await page.evaluate(
    ({ stand, ticks }) => {
      const debug = window.steampunkDebug!
      const snapshot = debug.snapshot()
      if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
      const tick = snapshot.snapshot.tick + 1
      const commands: ScriptedCommand[] = [
        { tick, type: 'undock', payload: {} },
        { tick, type: 'reportPose', payload: restingPoseAbove(stand) },
        { tick, type: 'power-up-core.use_power_up', payload: { slot: 'powerup.1' } },
      ]
      const result = debug.fastForward(ticks, commands)
      if (!result.ok) throw new Error(result.problems.join('; '))

      function restingPoseAbove(tile: { tx: number; ty: number }) {
        return {
          x: tile.tx * 1000 + 500,
          y: (tile.ty + 1) * 1000 + 500,
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
      }
    },
    // From the snapshot's tick: the press lands one tick on, the hold starts after the wind-up.
    { stand: STAND, ticks: 1 + WINDUP_TICKS + HALF_HOLD_TICKS },
  )
}

/** One thrust tap where the miner stands, on the next tick. */
async function tapThrust(page: Page): Promise<void> {
  await page.evaluate((stand) => {
    const debug = window.steampunkDebug!
    const snapshot = debug.snapshot()
    if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
    const tick = snapshot.snapshot.tick + 1
    const pose = {
      x: stand.tx * 1000 + 500,
      y: (stand.ty + 1) * 1000 + 500,
      vx: 0,
      vy: 0,
      upx: 0,
      upy: 1024,
      facing: 2,
      driving: false,
      thrusting: true,
      drilling: false,
      thrustTicks: 1,
      driveTicks: 0,
      drillTicks: 0,
      drive: { x: 0, y: 0 } as const,
    }
    const result = debug.fastForward(2, [{ tick, type: 'reportPose', payload: pose }])
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, STAND)
}

function patchSlot(page: Page): Promise<SlotRead | undefined> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['power-up-core'].getSlots() as {
      slots?: SlotRead[]
    }
    return result.slots?.[0]
  })
}

function patchUnitsLeft(page: Page): Promise<unknown> {
  return page.evaluate(
    (itemId) => window.steampunkDebug!.features['power-up-core'].getCharges(itemId),
    RIVET_PATCH,
  )
}

test.describe('screen matrix: the rivet patch hold ring (ticket 253)', () => {
  test('reads half held 45 ticks into the hold and draws the ring on the slot', async ({
    page,
  }, testInfo) => {
    const errors = await openWithPatchSlotted(page)
    await holdPatchHalfway(page)
    expect(await patchSlot(page)).toMatchObject({ itemId: RIVET_PATCH, holdPercent: 50 })
    const slot = page.getByTestId('power-up-slot-powerup.1')
    await expect(slot).toHaveAttribute('data-holding', 'true')
    await testInfo.attach('rivet-hold-ring-tick-45', {
      body: await slot.screenshot(),
      contentType: 'image/png',
    })
    expect(errors).toEqual([])
  })

  test('snaps the ring back and refunds the unit on a single thrust tap', async ({ page }) => {
    const errors = await openWithPatchSlotted(page)
    await holdPatchHalfway(page)
    expect(await patchUnitsLeft(page)).toEqual({ ok: true, chargesLeft: 1 })
    await tapThrust(page)
    expect(await patchSlot(page)).toMatchObject({ holdPercent: 0 })
    await expect(page.getByTestId('power-up-slot-powerup.1')).not.toHaveAttribute('data-holding')
    expect(await patchUnitsLeft(page)).toEqual({ ok: true, chargesLeft: 2 })
    expect(errors).toEqual([])
  })
})

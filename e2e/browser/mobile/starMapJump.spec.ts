/**
 * Planet 3 reachable on a phone (ticket 793): on the iPhone 13 and Pixel 7 projects a fresh save
 * seeded to planet 2 with money opens the star map with a tap on the bay footer's Star map, taps
 * each hop's Buy fuel and its Jump twice, and has control on the new planet within 2 s, from P2 to
 * P3, P3 to P4 and P4 to P5. The desktop run, the end-of-slice check, the refused jump and the
 * goldens are `e2e/browser/ui/starMapJump.spec.ts`. Emulation, not a device (#482). State through
 * the DOM and `steampunkDebug`, never pixels.
 */
import { expect, test } from '@playwright/test'
import { currentCell, openGame } from '../screens/screenHelpers'
import {
  buyFuelAndJumpTo,
  JUMP_TO_CONTROL_MS,
  openStarMapFromTheBay,
  PRESS_AND_FRAME_SLACK_MS,
  seedPlanetTwoAtTheSellBay,
  TAP,
} from '../starMapJumps'
import { skipWhereEngineIsMissing } from './mobileHelpers'

/** Software WebGL on a 3x phone screen is slow, WebKit's slower still: a wait, not a judgement. */
const TEST_TIMEOUT_MS = 300_000

skipWhereEngineIsMissing()

test.describe('mobile: star map jumps (ticket 793)', () => {
  test('taps the fuel and the jump from P2 to P3, P4 and P5, each with control within 2 s', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openGame(page, currentCell())
    await seedPlanetTwoAtTheSellBay(page)
    for (const place of [3, 4, 5]) {
      await openStarMapFromTheBay(page, TAP)
      const elapsed = await buyFuelAndJumpTo(page, place, TAP)
      test
        .info()
        .annotations.push({ type: 'jump-to-control', description: `P${place}: ${elapsed} ms` })
      expect(elapsed).toBeLessThanOrEqual(JUMP_TO_CONTROL_MS + PRESS_AND_FRAME_SLACK_MS)
    }
    expect(errors).toEqual([])
  })
})

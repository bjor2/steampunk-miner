/**
 * The per-buy cue on the gauge cluster (ticket 727) in the preview build: docked at the Upgrade bay
 * with money, every single buy from the Outfitter's own cards (each track and the casing grade)
 * steps its dial's cue one notch (`data-cue`, or the "+N" cell's for a dial the phone's surface
 * strip folds), and the cluster's shot after the buy differs from the one before by at least a
 * pixel, at 360x640 and at 1440x900. The ticket asks for the pixel difference itself, so the shot
 * pair is compared beside the state. No buy here is a new capability, so the #718 reveal never
 * plays. The sheet is shut for each shot: on a phone it covers the stage.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { UpgradeId } from '../../../src/systems/economy/economyDefinition'
import { GAUGE_CLUSTER } from '../../../src/systems/views/gaugeClusterTable'
import { UI_ID_TEMPLATES, UI_IDS } from '../../../src/ui/ids'
import { openGame } from '../sellBurstSales'
import { buyFromCard, dockAtOutfitter, readReveal } from '../unlockRevealBuys'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 300_000
const OPEN_TIMEOUT_MS = 30_000
const OUTFITTER_TAB_ID = 'workshop.outfitter'

const BUYS = Object.entries(GAUGE_CLUSTER.buyCue.counts).flatMap(([dialId, counts]) =>
  counts.map((count) => ({ dialId, count })),
)

function cardTestIdOf(count: string): string {
  return count === 'casing'
    ? UI_IDS.upgradebayCasingBuy
    : UI_ID_TEMPLATES.workshopUpgradeBuy(count as UpgradeId)
}

/** The dial's own cue, or the "+N" cell's while the strip folds the dial away. */
async function cueHolderOf(page: Page, dialId: string): Promise<Locator> {
  const dial = page.getByTestId(UI_ID_TEMPLATES.hudDial(dialId))
  return (await dial.count()) > 0 ? dial : page.getByTestId(UI_IDS.hudDialOverflow)
}

async function setSheet(page: Page, isOpen: boolean): Promise<void> {
  await page.evaluate(
    ([open, tabId]) => {
      const ui = window.steampunkDebug!.ui
      const result = open ? ui.openSheet(tabId) : ui.closeSheet()
      if (!result.ok) throw new Error(result.problems.join('; '))
    },
    [isOpen, OUTFITTER_TAB_ID] as const,
  )
}

function shootCluster(page: Page): Promise<Buffer> {
  return page.getByTestId(UI_IDS.hudDials).screenshot({ animations: 'disabled' })
}

for (const size of [
  { width: 360, height: 640, isPhone: true },
  { width: 1440, height: 900, isPhone: false },
]) {
  test.describe(`per-buy gauge cue at ${size.width}x${size.height} (ticket 727)`, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      hasTouch: size.isPhone,
      isMobile: size.isPhone,
    })

    test('every single buy moves its dial’s cue and changes the cluster’s pixels, no reveal', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page)
      await dockAtOutfitter(page)
      for (const { dialId, count } of BUYS) {
        await setSheet(page, false)
        const holder = await cueHolderOf(page, dialId)
        const notchBefore = await holder.getAttribute('data-cue')
        const before = await shootCluster(page)
        await setSheet(page, true)
        await buyFromCard(page, cardTestIdOf(count))
        await setSheet(page, false)
        await expect(holder, count).not.toHaveAttribute('data-cue', notchBefore ?? '', {
          timeout: OPEN_TIMEOUT_MS,
        })
        expect((await shootCluster(page)).equals(before), count).toBe(false)
        expect((await readReveal(page)).isPlaying, count).toBe(false)
      }
      expect(errors).toEqual([])
    })
  })
}

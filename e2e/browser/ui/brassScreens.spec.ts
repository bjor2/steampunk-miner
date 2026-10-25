/**
 * The artefact choice and the travel card on brass (ticket 885, spec #678): at 360x640 held
 * upright and at 1280x800, 1920x1080 and 2560x1440, each screen is shot (written to
 * `docs/ui/screens/<cell>/` under `npm run ui:screens:update`, never compared), then fails on any
 * control drawn without the kit, any shown figure outside an icon-plus-value fact, a root outside
 * the kit's sheet frame, and, for the travel card over the play view, the plate in the drill
 * head's middle band; plus the suite's own overflow, 44 px target and 14 px text findings. Rows
 * of `uiShotSheets.ts`; geometry and marks through the DOM and `steampunkDebug`, never pixels.
 */
import { expect, test } from '@playwright/test'
import { brassFindingsOf, NO_BRASS_FINDINGS } from './brassCrop'
import { BRASS_SHOT_CELLS } from './uiShotCells'
import { NO_SHEET_FINDINGS, sheetFindingsOf } from './uiShotFindings'
import { UI_SHEETS } from './uiShotSheets'
import { openPlainGame, shoot } from './uiShotSteps'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 180_000

/** The two brass screens, and whether each lies over the play view (the band rule's reach). */
const BRASS_SCREENS = [
  { shot: 'artefact-choice', isOverPlay: false },
  { shot: 'travel-card', isOverPlay: true },
].map((screen) => ({ ...screen, sheet: UI_SHEETS.find((row) => row.shot === screen.shot)! }))

for (const cell of BRASS_SHOT_CELLS) {
  test.describe(`brass screens (ticket 885): ${cell.name}`, () => {
    test.use({
      viewport: cell.viewport,
      isMobile: cell.isTouch,
      hasTouch: cell.isTouch,
      deviceScaleFactor: 1,
    })

    for (const { shot, isOverPlay, sheet } of BRASS_SCREENS) {
      test(`draws the ${shot} on the kit with no default control and no bare number`, async ({
        page,
      }) => {
        test.setTimeout(TEST_TIMEOUT_MS)
        const errors = await openPlainGame(page, cell)
        await sheet.open(page)
        await shoot(page, cell, shot)
        expect(await brassFindingsOf(page, sheet.rootSelector, isOverPlay)).toEqual(
          NO_BRASS_FINDINGS,
        )
        expect(await sheetFindingsOf(page, sheet)).toEqual(NO_SHEET_FINDINGS)
        expect(errors).toEqual([])
      })
    }
  })
}

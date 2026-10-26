/**
 * One fresh-save test per planet, P1 to P5 (ticket 656, the GD's end check on spec #647: a planet
 * is open only when a fresh save reaches it by buying travel and its hazard, look and pool show
 * within a minute of landing). On the preview build, each test opens a fresh save, has the pacing
 * bot play to the planet through `steampunkDebug.bot.playToPlanet` (it harvests every core on the
 * way and buys each travel, its commands replayed on the live game), and on landing asserts:
 *
 * - the session is still a play run (`isDebugRun` false), so a planet whose travel needs a debug
 *   command fails its test;
 * - the planet's pool id, and its hazard: the row's kind, with a pocket of it round the dock;
 * - the planet card's line on arrival, as ticket 654 shows it; P1 keeps its pool and no card.
 *
 * The landings are `freshSaveLandings.ts`'s, shared with the Pixel 7 run (ticket 905). Asserted
 * through `steampunkDebug`, never pixels. The look is `planetLooks.spec.ts`'s.
 */
import { expect, test } from '@playwright/test'
import {
  expectLandedOn,
  isDebugRun,
  LANDINGS,
  MS_PER_PLANET,
  openFreshSave,
  playBotToPlanet,
} from './freshSaveLandings'

for (const landing of LANDINGS) {
  test(`a fresh save lands on planet ${landing.planet} by bought travel and meets its hazard, pool and card line`, async ({
    page,
  }) => {
    test.setTimeout(MS_PER_PLANET * landing.planet)
    const errors = await openFreshSave(page)
    expect(await isDebugRun(page)).toBe(false)
    const arrival = await playBotToPlanet(page, landing.planet)
    expect(arrival).toMatchObject({ ok: true, planetIndex: landing.planet, isReplayExact: true })
    await expectLandedOn(page, landing)
    expect(errors).toEqual([])
  })
}

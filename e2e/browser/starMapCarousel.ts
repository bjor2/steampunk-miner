/**
 * The star map carousel as a player drives it (ticket 796), shared by the desktop and phone specs:
 * a swipe across the hero, the carousel's model from `ui.getStarMapCarousel()`, the system strip's
 * pan offset (where the panned backdrop sits in its window) and the selected marker's place on the
 * backdrop. A swipe is a pointer press and release dispatched in one page task, so a slow box never
 * stretches it past the swipe's time limit (#795's motion notes: 48 px along x within 600 ms); the
 * carousel reads the same pointer events from a finger. State through the DOM and the debug API,
 * never pixels.
 */
import { expect, type Page } from '@playwright/test'
import type { StarMapCarousel } from '../../src/systems/views/starMapCarousel'
import { STAR_MAP_UI_IDS } from '../../src/ui/starMap/starMapIds'

/** Past the 48 px threshold with room to spare, and dead level. */
const SWIPE_PX = 96
/** The pan's 400 ms at most, plus a frame of software GL on the box. */
export const PAN_SETTLE_MS = 600

export type SwipeDirection = 'left' | 'right'

/** A finger's quick horizontal drag across the hero: left shows the next planet, right the previous. */
export async function swipeHero(page: Page, towards: SwipeDirection): Promise<void> {
  await page.evaluate(
    ({ testId, dx }) => {
      const hero = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!
      const box = hero.getBoundingClientRect()
      const at = { x: box.left + box.width / 2, y: box.top + box.height / 2 }
      const pointer = { pointerId: 41, pointerType: 'touch', isPrimary: true, bubbles: true }
      hero.dispatchEvent(
        new PointerEvent('pointerdown', { ...pointer, clientX: at.x, clientY: at.y }),
      )
      hero.dispatchEvent(
        new PointerEvent('pointerup', { ...pointer, clientX: at.x + dx, clientY: at.y }),
      )
    },
    { testId: STAR_MAP_UI_IDS.starMapHero, dx: towards === 'left' ? -SWIPE_PX : SWIPE_PX },
  )
}

export function readCarousel(page: Page): Promise<StarMapCarousel> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getStarMapCarousel()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.model
  })
}

/** The shown planet's place as the hero draws it. */
export async function expectShownPlace(page: Page, place: number): Promise<void> {
  await expect(page.getByTestId(STAR_MAP_UI_IDS.starMapHero)).toHaveAttribute(
    'data-place',
    String(place),
  )
}

/** How far the backdrop is panned left inside the strip's window, in CSS px (0 at the sun's end). */
export function panOffsetOf(page: Page): Promise<number> {
  return page.evaluate((testId) => {
    const track = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!
    const frame = track.parentElement!.getBoundingClientRect()
    return frame.left - track.getBoundingClientRect().left
  }, STAR_MAP_UI_IDS.starMapSystemTrack)
}

/** The selected marker's centre along the backdrop, in CSS px: it moves with the selection only. */
export function selectedMarkerXOf(page: Page): Promise<number> {
  return page.evaluate(
    ({ trackId, markerId }) => {
      const track = document.querySelector(`[data-testid="${trackId}"]`)!.getBoundingClientRect()
      const marker = document.querySelector(`[data-testid="${markerId}"]`)!.getBoundingClientRect()
      return marker.left + marker.width / 2 - track.left
    },
    {
      trackId: STAR_MAP_UI_IDS.starMapSystemTrack,
      markerId: STAR_MAP_UI_IDS.starMapSelectedMarker,
    },
  )
}

/** The pan's CSS transition time on the backdrop, in seconds: 0 under reduced motion. */
export function panTransitionSecondsOf(page: Page): Promise<number> {
  return page.evaluate((testId) => {
    const track = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!
    return Number.parseFloat(getComputedStyle(track).transitionDuration)
  }, STAR_MAP_UI_IDS.starMapSystemTrack)
}

/**
 * After a step on to a planet further out, the marker has moved out along the backdrop and the
 * pan has eased toward it. Steps among the inner planets (P1 to P3) only: further out the strip's
 * end holds the pan on a narrow window.
 */
export async function expectStepOutward(
  page: Page,
  before: { pan: number; marker: number },
): Promise<void> {
  await expect.poll(() => selectedMarkerXOf(page)).toBeGreaterThan(before.marker)
  await page.waitForTimeout(PAN_SETTLE_MS)
  expect(await panOffsetOf(page)).toBeGreaterThan(before.pan)
}

/** The pan and the marker now, to compare after a step. */
export async function stripPlaceOf(page: Page): Promise<{ pan: number; marker: number }> {
  return { pan: await panOffsetOf(page), marker: await selectedMarkerXOf(page) }
}

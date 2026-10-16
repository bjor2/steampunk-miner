/**
 * The render rate cap (TD #470 section 2.4 step 2, ticket 477): a GPU that cannot hold 60 frames
 * a second draws every second refresh instead. Only the draw is skipped: the fixed-step driver
 * still runs every display frame and catches up whole ticks from the clock, so the simulation
 * ticks 60 a second either way and reaches the same tick after the same time. A frame is due once
 * the time since the last draw, rounded to the nearest refresh, reaches the cap's frame.
 */

export interface RenderRate {
  /** Seconds since the last frame drawn. */
  sinceDrawSeconds: number
}

export function createRenderRate(): RenderRate {
  return { sinceDrawSeconds: 0 }
}

/**
 * Adds this display frame's `dt` and answers whether to draw it; a drawn frame starts the next
 * interval. `fpsCap` null draws every frame.
 */
export function isFrameDue(rate: RenderRate, fpsCap: number | null, dt: number): boolean {
  rate.sinceDrawSeconds += dt
  return fpsCap === null || rate.sinceDrawSeconds + dt / 2 >= 1 / fpsCap
}

/** The interval the drawn frame closes, in seconds, for the frame window; starts the next one. */
export function closeDrawInterval(rate: RenderRate): number {
  const interval = rate.sinceDrawSeconds
  rate.sinceDrawSeconds = 0
  return interval
}

/** The frame a capped rate has to meet, in milliseconds; the 60 fps budget when uncapped. */
export function frameBudgetMsOf(fpsCap: number | null, uncappedBudgetMs: number): number {
  return fpsCap === null ? uncappedBudgetMs : Math.max(uncappedBudgetMs, 1000 / fpsCap)
}

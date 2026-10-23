import { describe, expect, it } from 'vitest'
import { DESIGN_TOKENS } from './designSystem'
import { hazardStripDesktopReachInto } from './hazardStripFit'
import { hazardStripReachOf, type HazardStripReach } from './hazardStripPlace'

// Ticket 769 (spec #678, G&V's warnings): on desktop the strip lies on the side nearest the danger,
// along the drive, and ends inside the play area, whichever way the drive points and whether or
// not a docked panel has narrowed the view.

const DESKTOP_VIEWS = [
  { width: 1280, height: 720 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  // The views a docked panel leaves at 1280×800 and 1920×1080 (a quarter, then 400 px).
  { width: 960, height: 800 },
  { width: 1520, height: 1080 },
]
const SIXTEENTHS = Array.from({ length: 16 }, (_, step) => (step * Math.PI) / 8)
const UP = 0
const DOWN = Math.PI
const RIGHT = -Math.PI / 2

function reachOf(view: { width: number; height: number }, angle: number): HazardStripReach {
  return hazardStripDesktopReachInto({ inner: 0, length: 0 }, view, angle)
}

/** Where the far end lands, x right and y down from the view's top-left corner. */
function farEndOf(view: { width: number; height: number }, angle: number) {
  const { inner, length } = reachOf(view, angle)
  const far = inner + length
  return {
    x: view.width / 2 - Math.sin(angle) * far,
    y: view.height / 2 - Math.cos(angle) * far,
  }
}

describe('hazard strip on desktop (ticket 769)', () => {
  it('ends inside the play area, under the strip and over the tool tray, for every drive', () => {
    const { marginPx, strip, toolSlots } = DESIGN_TOKENS.layout
    const top = strip.heightPx.desktop + 2 * marginPx
    const foot = toolSlots.cellPx.desktop + 2 * marginPx
    for (const view of DESKTOP_VIEWS) {
      for (const angle of SIXTEENTHS) {
        const end = farEndOf(view, angle)
        expect(end.x).toBeGreaterThanOrEqual(marginPx - 1e-6)
        expect(end.x).toBeLessThanOrEqual(view.width - marginPx + 1e-6)
        expect(end.y).toBeGreaterThanOrEqual(top - 1e-6)
        expect(end.y).toBeLessThanOrEqual(view.height - foot + 1e-6)
      }
    }
  })

  it('keeps the near end where the screen puts it, so the rig never covers the track', () => {
    for (const view of DESKTOP_VIEWS) {
      for (const angle of SIXTEENTHS) {
        expect(reachOf(view, angle).inner).toBe(hazardStripReachOf(view).inner)
      }
    }
  })

  it('keeps the full track where the play area has room for it', () => {
    const view = { width: 1920, height: 1080 }
    expect(reachOf(view, RIGHT)).toEqual(hazardStripReachOf(view))
    expect(reachOf(view, DOWN)).toEqual(hazardStripReachOf(view))
  })

  it('shortens the track toward the strip at 1280×800 rather than run under it', () => {
    const view = { width: 1280, height: 800 }
    const full = hazardStripReachOf(view)
    const up = reachOf(view, UP)
    expect(up.length).toBeLessThan(full.length)
    expect(up.length).toBeGreaterThan(full.length / 2)
  })

  it('writes the same reach into the scratch it is given and allocates no new one', () => {
    const scratch = { inner: 0, length: 0 }
    expect(hazardStripDesktopReachInto(scratch, { width: 1280, height: 800 }, RIGHT)).toBe(scratch)
  })
})

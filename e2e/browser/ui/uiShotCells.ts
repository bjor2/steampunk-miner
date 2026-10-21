/**
 * The four screens of the UI screenshot suite (spec #678, ticket 689): two phones held upright and
 * two desktops, which the GD lock (21 Oct) made first-class. Each cell carries the layout the
 * design system gives it and that layout's HUD coverage budget (docs/ui/design-system.md
 * section 9), so a spec reading the overlay's report checks it against the decision's number.
 */
import type { HudLayoutCell } from '../hud/hudLayoutHelpers'

export interface UiShotCell extends HudLayoutCell {
  layout: 'phone' | 'desktop'
  /** `layout.coverageMaxPercent`: 12 on a phone, 8 on desktop. */
  budgetPercent: number
}

const PHONE = { isTouch: true, layout: 'phone', budgetPercent: 12 } as const
const DESKTOP = { isTouch: false, layout: 'desktop', budgetPercent: 8 } as const
/** No TV mode and no #500 clear-view floor: the coverage budget is this suite's measure. */
const PLAIN = { isTvMode: false, floor: null } as const

export const UI_SHOT_CELLS: readonly UiShotCell[] = [
  { name: 'phone-360x640', viewport: { width: 360, height: 640 }, ...PHONE, ...PLAIN },
  { name: 'phone-390x844', viewport: { width: 390, height: 844 }, ...PHONE, ...PLAIN },
  { name: 'desktop-1280x800', viewport: { width: 1280, height: 800 }, ...DESKTOP, ...PLAIN },
  { name: 'desktop-1440x900', viewport: { width: 1440, height: 900 }, ...DESKTOP, ...PLAIN },
]

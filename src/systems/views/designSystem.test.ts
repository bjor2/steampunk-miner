import { describe, expect, it } from 'vitest'
import {
  coloursForPalette,
  DESIGN_TOKENS,
  designTokenProblems,
  layoutKindOf,
  skinProblemsOf,
  type DesignTokens,
} from './designSystem'

// Spec #678's GD lock (21 Oct) and the rulings folded into ticket 679: every rule on the map is a
// token or a limit here, so a later edit that loosens one fails this spec, never a screenshot.

function tokensWith(edit: (tokens: DesignTokens) => void): DesignTokens {
  const copy = structuredClone(DESIGN_TOKENS)
  edit(copy)
  return copy
}

describe('design tokens', () => {
  it('ship with no problem', () => {
    expect(designTokenProblems(DESIGN_TOKENS)).toEqual([])
  })

  it('keep the HUD under 12% of a phone screen and 8% of a desktop one', () => {
    expect(DESIGN_TOKENS.layout.coverageMaxPercent).toEqual({ phone: 12, desktop: 8 })
  })

  it('keep tap targets at 44 px, text at 14 px and the top 15% of a phone free of taps', () => {
    expect(DESIGN_TOKENS.layout.tapTargetMinPx).toBe(44)
    expect(DESIGN_TOKENS.type.minPx).toBe(14)
    expect(DESIGN_TOKENS.layout.topKeepOutPercent).toBe(15)
  })

  it('show heat only above 60% and reserve the HS slot kinds by layout', () => {
    expect(DESIGN_TOKENS.layout.strip.heatShowsAbovePercent).toBe(60)
    expect(DESIGN_TOKENS.layout.toolSlots.count).toEqual({ phone: 4, desktop: 8 })
    expect(DESIGN_TOKENS.layout.toolSlots.overflow).toEqual({ phone: true, desktop: false })
    expect(DESIGN_TOKENS.layout.statusIcons.count).toEqual({ phone: 3, desktop: 6 })
    expect(DESIGN_TOKENS.layout.tabsMax).toBe(8)
  })

  it("hold G&V's feel targets: needle ease 150 to 250 ms, never over 300 ms behind", () => {
    const { needle } = DESIGN_TOKENS.motion
    expect([needle.easeMinMs, needle.easeMaxMs, needle.lagMaxMs]).toEqual([150, 250, 300])
    expect(needle.overshootShare).toBeGreaterThan(0)
  })

  it('warn at 30%, 15% and 0%, each tier once on the way in', () => {
    expect(DESIGN_TOKENS.warningLadder.tiers.map((tier) => tier.atPercent)).toEqual([30, 15, 0])
    expect(DESIGN_TOKENS.warningLadder.rearmPercent).toBeGreaterThan(0)
  })

  it('cap every transition at 200 ms and the odometer roll at 600 ms', () => {
    expect(DESIGN_TOKENS.motion.transitionMaxMs).toBe(200)
    expect(DESIGN_TOKENS.motion.odometer.rollMaxMs).toBe(600)
    expect(Object.values(DESIGN_TOKENS.motion.durationsMs).every((ms) => ms <= 200)).toBe(true)
  })

  it('keep the copy budgets: 3-word titles, 12-word hover lines, 6-word toasts for 2 s', () => {
    const { copy, motion } = DESIGN_TOKENS
    expect([copy.titleWordsMax, copy.hoverWordsMax, copy.toastWordsMax]).toEqual([3, 12, 6])
    expect(motion.toastMaxMs).toBe(2000)
  })

  it("name Progression's places and one verb per action", () => {
    expect(Object.values(DESIGN_TOKENS.copy.places)).toEqual([
      'Outfitter',
      'Patent Office',
      'Hold',
      'Ledger',
      'Gearbox',
    ])
    expect(DESIGN_TOKENS.copy.verbs).toEqual(['Buy', 'Fit', 'Sell', 'Scrap', 'Travel'])
  })

  it('format money to 3 significant figures in at most 6 characters, k through Dc', () => {
    const { numbers } = DESIGN_TOKENS
    expect([numbers.significantFigures, numbers.maxChars]).toEqual([3, 6])
    expect(numbers.suffixes[0]).toBe('k')
    expect(numbers.suffixes.at(-1)).toBe('Dc')
    expect(numbers.suffixes).toHaveLength(11)
  })

  it('take the breakpoint from the HUD density switch, not a second rule', () => {
    expect(layoutKindOf('compact')).toBe('phone')
    expect(layoutKindOf('full')).toBe('desktop')
  })
})

describe('design token problems', () => {
  it('refuse a transition over the motion cap', () => {
    const tokens = tokensWith((t) => {
      t.motion.durationsMs.sheet = 250
    })
    expect(designTokenProblems(tokens)).toEqual([
      'motion.durationsMs.sheet (250) is over the 200 ms cap',
    ])
  })

  it('refuse a type size under the floor', () => {
    const tokens = tokensWith((t) => {
      t.type.sizesPx.label = 12
    })
    expect(designTokenProblems(tokens)).toEqual([
      'type.sizesPx.label (12) is under the 14 px floor',
    ])
  })

  it('refuse a colour that is not hex and a gauge fill naming no colour', () => {
    const tokens = tokensWith((t) => {
      t.colour.brass = 'gold'
      t.gaugeFills.hull = 'gilt'
    })
    expect(designTokenProblems(tokens)).toEqual([
      'colour.brass is not a hex colour',
      'gaugeFills.hull names no colour "gilt"',
    ])
  })

  it('refuse a warning ladder out of order and a cue outside the ui prefix', () => {
    const tokens = tokensWith((t) => {
      t.warningLadder.tiers[1].atPercent = 40
      t.soundCues[0].id = 'hud.tap'
    })
    expect(designTokenProblems(tokens)).toEqual([
      'warningLadder tiers are not in descending order',
      'sound cue "hud.tap" is not under "ui."',
    ])
  })

  it('refuse a slot cell under the tap target minimum', () => {
    const tokens = tokensWith((t) => {
      t.layout.toolSlots.cellPx.phone = 40
    })
    expect(designTokenProblems(tokens)).toEqual([
      'layout.toolSlots.cellPx.phone is under the tap target minimum',
    ])
  })
})

describe('planet skins', () => {
  it('re-skin only the skinnable colours and leave every limit alone', () => {
    const heat = coloursForPalette('palette.heat')
    expect(heat.accent).toBe('#c4532e')
    expect(heat.brass).toBe(DESIGN_TOKENS.colour.brass)
    expect(coloursForPalette('palette.unknown')).toEqual(DESIGN_TOKENS.colour)
  })

  it('refuse a skin that names a token outside the skinnable list or a non-hex colour', () => {
    expect(skinProblemsOf({ brass: '#ffffff', glow: 'red' })).toEqual([
      '"brass" is not a skinnable token',
      '"glow" is not a hex colour',
    ])
  })

  it('check every shipped planet skin the same way', () => {
    const tokens = tokensWith((t) => {
      t.planetSkins['palette.heat'].glow = 'hot'
    })
    expect(designTokenProblems(tokens)).toEqual([
      'planetSkins["palette.heat"]: "glow" is not a hex colour',
    ])
  })
})

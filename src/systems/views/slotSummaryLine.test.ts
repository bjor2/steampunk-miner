import { describe, expect, it } from 'vitest'
import { PLANET_NAME_CHARACTERS_MAX } from '../../constants/uiParts'
import { formatAmount } from '../displayAmount'
import { GENERATOR_VERSION } from '../generatorVersion'
import { fromCanonical, toCanonical } from '../money'
import { planetDisplayNameOf } from '../registries/planetRow'
import type { SaveSlotEntry } from '../save/saveSlotIndex'
import type { SaveSlotSummary } from '../save/saveSlotSummary'
import { DESIGN_TOKENS } from './designSystem'
import { depthStripTextOf } from './hudStrip'
import { SAVE_NAME_MAX_CHARS } from './pauseMenuModel'
import { uiScaleOf } from './screenLayout'
import { slotSummaryLineOf, UNKNOWN_SUMMARY_TEXT, type SlotSummaryLine } from './slotSummaryLine'
import { playtimeTextOf } from './titleMenuModel'

const OLD_ENTRY: SaveSlotEntry = {
  slot: 'slot-3',
  name: 'Before the core',
  planetIndex: 9,
  playtimeTicks: 60 * 3723,
  savedAtMs: 1_760_000_000_000,
  formatVersion: 3,
  generatorVersion: GENERATOR_VERSION,
}

const SUMMARY: SaveSlotSummary = {
  planetIndex: 9,
  planetName: 'Brassholt',
  money: toCanonical(fromCanonical('123456.789')),
  deepestMetres: 150,
  coreDepthMetres: 600,
  drillLevel: 1_000_000,
}

function lineOf(summary: Partial<SaveSlotSummary>): SlotSummaryLine {
  return slotSummaryLineOf({ ...OLD_ENTRY, summary: { ...SUMMARY, ...summary } })
}

/** The money texts of a ladder of balances from 9.999 to 1e300 (#681's 6-character range). */
function moneyTextsUpTo1e300(): string[] {
  const amounts = Array.from({ length: 300 }, (_, exponent) => `9.999e${exponent}`)
  return [...amounts, '1e300'].map(
    (amount) => lineOf({ money: toCanonical(fromCanonical(amount)) }).money.text,
  )
}

// A conservative average advance of the body serif (Georgia), in em, as ticket 702's fit check.
const SERIF_ADVANCE_EM = 0.6
const LONGEST_PLANET_NAME = 'Ashholtmere 9999'.slice(0, PLANET_NAME_CHARACTERS_MAX)
const LONGEST_DEPTH_METRES = 99_999_999
const LONGEST_PLAYTIME = '999:59:59'
const FACTS_ON_THE_LINE = 4
/** Ticket 672's case: a 1e15 balance, 999 hours of play and a name at the 40-character cap. */
const PLAYTIME_999H_TICKS = 999 * 3600 * 60
const LONGEST_SAVE_NAME = 'Deep vein under the eastern brass gallery'.slice(0, SAVE_NAME_MAX_CHARS)
/** The slot list wraps a long name (overflow-wrap: anywhere) to a second line on a phone. */
const PHONE_NAME_LINES_MAX = 2

/**
 * The slot line's facts at the menu type size: each fact a glyph (1em, menu size), its gap and its
 * text, the depth's gauge after its text, and the facts' gaps between them.
 */
function slotLineWidthPx(texts: readonly string[], scale: number): number {
  const fontPx = DESIGN_TOKENS.type.sizesPx.body * scale
  const textPx = texts.join('').length * SERIF_ADVANCE_EM * fontPx
  const glyphsPx = texts.length * (fontPx + DESIGN_TOKENS.spacePx[1] * scale)
  const gapsPx = (texts.length - 1) * DESIGN_TOKENS.spacePx[3] * scale
  const gaugePx = DESIGN_TOKENS.layout.edgeGauge.slotLengthPx + DESIGN_TOKENS.spacePx[1] * scale
  return textPx + glyphsPx + gapsPx + gaugePx
}

/** The room inside the screen's margins and the plate's padding and frame. */
function slotLineRoomPx([width, height]: readonly [number, number]): {
  room: number
  scale: number
} {
  const scale = uiScaleOf(Math.min(width, height), false)
  const insetPx = 2 * (DESIGN_TOKENS.spacePx[3] + DESIGN_TOKENS.spacePx[3]) * scale
  return { room: width - insetPx - 2 * DESIGN_TOKENS.framePx.hairline, scale }
}

describe('save slot line summary (ticket 703)', () => {
  it('shows the planet name, the depth as the HUD writes it and the money rounded down', () => {
    expect(lineOf({})).toEqual({
      planetText: 'Brassholt',
      depth: { text: depthStripTextOf(150), exact: '150', gaugePermille: 250 },
      money: { text: '123k', exact: SUMMARY.money },
    })
    expect(lineOf({ deepestMetres: 12_345 }).depth.text).toBe(depthStripTextOf(12_345))
  })

  it('never shows the drill level, at 1e6 or any other', () => {
    const shown = JSON.stringify(lineOf({ drillLevel: 1_000_000 }))
    expect(shown).not.toMatch(/1,000,000|1\.00M|1000000/)
    expect(Object.keys(lineOf({}))).toEqual(['planetText', 'depth', 'money'])
  })

  it('keeps the money at 6 characters or fewer up to 1e300', () => {
    const texts = moneyTextsUpTo1e300()
    expect(texts.filter((text) => text.length > DESIGN_TOKENS.numbers.maxChars)).toEqual([])
    expect(lineOf({ money: toCanonical(fromCanonical('1e300')) }).money.text).toBe(
      formatAmount(fromCanonical('1e300')),
    )
  })

  it('rounds the money down, as every balance is', () => {
    expect(lineOf({ money: toCanonical(fromCanonical('19999')) }).money.text).toBe('19.9k')
  })

  it('marks the deepest dig on the gauge from the surface at 0 to the core at 1000', () => {
    expect(lineOf({ deepestMetres: 0 }).depth.gaugePermille).toBe(0)
    expect(lineOf({ deepestMetres: 300 }).depth.gaugePermille).toBe(500)
    expect(lineOf({ deepestMetres: 600 }).depth.gaugePermille).toBe(1000)
    expect(lineOf({ deepestMetres: 900 }).depth.gaugePermille).toBe(1000)
  })

  it("shows an old save's depth and money as unknown, naming its planet from the entry", () => {
    expect(slotSummaryLineOf(OLD_ENTRY)).toEqual({
      planetText: planetDisplayNameOf(9),
      depth: { text: UNKNOWN_SUMMARY_TEXT, exact: '', gaugePermille: null },
      money: { text: UNKNOWN_SUMMARY_TEXT, exact: '' },
    })
    expect(UNKNOWN_SUMMARY_TEXT).toBe('unknown')
  })

  it('fits the longest planet name, depth with gauge, 6 characters of money and playtime', () => {
    const longest = lineOf({
      planetName: LONGEST_PLANET_NAME,
      deepestMetres: LONGEST_DEPTH_METRES,
      money: toCanonical(fromCanonical('1.239e33')),
    })
    const texts = [longest.planetText, longest.depth.text, longest.money.text, LONGEST_PLAYTIME]
    expect(texts).toHaveLength(FACTS_ON_THE_LINE)
    expect(longest.planetText).toHaveLength(PLANET_NAME_CHARACTERS_MAX)
    expect(longest.money.text).toHaveLength(DESIGN_TOKENS.numbers.maxChars)
    const desktop = slotLineRoomPx([1280, 800])
    expect(slotLineWidthPx(texts, desktop.scale)).toBeLessThanOrEqual(desktop.room)
    // A phone held upright wraps the facts; each one, the gauge with its depth, fits a line.
    const phone = slotLineRoomPx([360, 640])
    const widestFactPx = Math.max(...texts.map((text) => slotLineWidthPx([text], phone.scale)))
    expect(widestFactPx).toBeLessThanOrEqual(phone.room)
  })
  it('fits the slot line at 360x640 and 1280x800 with 1e15, 999h and a 40-character name (ticket 672)', () => {
    const line = lineOf({ money: toCanonical(fromCanonical('1e15')) })
    const texts = [
      line.planetText,
      line.depth.text,
      line.money.text,
      playtimeTextOf(PLAYTIME_999H_TICKS),
    ]
    expect(LONGEST_SAVE_NAME).toHaveLength(SAVE_NAME_MAX_CHARS)
    expect(texts[3]).toBe('999:00:00')
    const desktop = slotLineRoomPx([1280, 800])
    const nameOnDesktopPx = nameWidthPx(LONGEST_SAVE_NAME, desktop.scale)
    expect(nameOnDesktopPx + slotLineWidthPx(texts, desktop.scale)).toBeLessThanOrEqual(
      desktop.room,
    )
    const phone = slotLineRoomPx([360, 640])
    const widestFactPx = Math.max(...texts.map((text) => slotLineWidthPx([text], phone.scale)))
    expect(widestFactPx).toBeLessThanOrEqual(phone.room)
    const nameLines = Math.ceil(nameWidthPx(LONGEST_SAVE_NAME, phone.scale) / phone.room)
    expect(nameLines).toBeLessThanOrEqual(PHONE_NAME_LINES_MAX)
  })
})

/** A slot's name in the row layout's title, at the body size, with the gap before its facts. */
function nameWidthPx(name: string, scale: number): number {
  const fontPx = DESIGN_TOKENS.type.sizesPx.body * scale
  return name.length * SERIF_ADVANCE_EM * fontPx + DESIGN_TOKENS.spacePx[2] * scale
}

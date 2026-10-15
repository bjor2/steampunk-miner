import { describe, expect, it } from 'vitest'
import type { UiBudgetPanel } from '../../constants/uiBudgetAllowlist'
import { panelOwning, readUiBudget, type UiBudgetSources } from './uiBudgetReading'
import type { UiText } from './uiText'

// TD ruling on #424: the budget read panel by panel from hand-made, deliberately over-budget
// fixtures, with the problems no allowlist entry may cover kept apart.

const PANELS: readonly UiBudgetPanel[] = [
  { id: 'bay', sourcePrefixes: ['src/ui/bay/', 'src/ui/BayCard'], textIdPrefixes: ['bay.'] },
  { id: 'rest', sourcePrefixes: ['src/ui/'], textIdPrefixes: [''] },
]

const CARD: UiText = {
  id: 'bay.card',
  title: 'Drill',
  oneLine: 'Cuts harder rock.',
  tooltipLines: [],
  lines: [{ text: '1.2k', tag: 'visible', holds: 'price' }],
}

const CLEAN: UiBudgetSources = {
  panels: PANELS,
  fixtures: [
    { panel: 'bay', unregistered: [] },
    { panel: 'rest', unregistered: [] },
  ],
  texts: [CARD],
  scrollFindings: [],
}

const countsOf = (sources: UiBudgetSources, panel: string) =>
  readUiBudget(sources).measures.find((measure) => measure.panel === panel)?.counts

describe('ui budget reading', () => {
  it('measures every panel clean when every element keeps the budget', () => {
    const reading = readUiBudget(CLEAN)
    expect(reading.breaches).toEqual([])
    expect(reading.hardProblems).toEqual([])
    expect(reading.measures.map((measure) => measure.panel)).toEqual(['bay', 'rest'])
  })

  it('gives a key to the panel with the longest matching prefix', () => {
    const bySource = (panel: UiBudgetPanel) => panel.sourcePrefixes
    expect(panelOwning('src/ui/bay/Bay.module.css', PANELS, bySource)).toBe('bay')
    expect(panelOwning('src/ui/BayCard.module.css', PANELS, bySource)).toBe('bay')
    expect(panelOwning('src/ui/hud/Hud.module.css', PANELS, bySource)).toBe('rest')
    expect(panelOwning('src/scene/Sky.module.css', PANELS, bySource)).toBeNull()
  })

  it('counts an over-budget title, one line and tooltip under the panel owning the id', () => {
    const tooltip = ['One.', 'Two.', 'Three.', 'Four.']
    const over: UiText = {
      ...CARD,
      title: 'The great big drill head',
      oneLine: 'Cuts rock. Then more.',
      tooltipLines: tooltip,
      lines: tooltip.map((text) => ({ text, tag: 'tooltip' })),
    }
    expect(countsOf({ ...CLEAN, texts: [over] }, 'bay')).toEqual({
      title: 1,
      oneLine: 1,
      tooltip: 1,
      unregistered: 0,
      scroll: 0,
    })
    expect(countsOf({ ...CLEAN, texts: [{ ...over, id: 'pause.card' }] }, 'rest')?.title).toBe(1)
  })

  it('counts each unregistered element under the panel whose fixture drew it', () => {
    const fixtures = [
      { panel: 'bay', unregistered: ['<h2> Hold', '<p> Level'] },
      { panel: 'rest', unregistered: [] },
    ]
    expect(countsOf({ ...CLEAN, fixtures }, 'bay')?.unregistered).toBe(2)
  })

  it('counts a second scroll container under the panel owning its file', () => {
    const scrollFindings = [
      { path: 'src/ui/bay/Bay.module.css', line: 4, declaration: 'overflow: auto;' },
    ]
    expect(countsOf({ ...CLEAN, scrollFindings }, 'bay')?.scroll).toBe(1)
    expect(readUiBudget({ ...CLEAN, scrollFindings }).hardProblems).toEqual([])
  })

  it('fails a scrolling file no panel owns, outside any allowance', () => {
    const scrollFindings = [
      { path: 'src/scene/Sky.module.css', line: 2, declaration: 'overflow: auto;' },
    ]
    expect(readUiBudget({ ...CLEAN, scrollFindings }).hardProblems).toEqual([
      'src/scene/Sky.module.css:2: a scroll container no panel owns: overflow: auto;',
    ])
  })

  it('fails a panel with no fixture, and a fixture for a panel nobody listed', () => {
    const fixtures = [
      { panel: 'bay', unregistered: [] },
      { panel: 'dock', unregistered: [] },
    ]
    expect(readUiBudget({ ...CLEAN, fixtures }).hardProblems).toEqual([
      'the panel rest has no fixture',
      'a fixture draws the unknown panel dock',
    ])
  })

  it('keeps the tag rules hard: a price in the tooltip is never a counted breach', () => {
    const tooltipPrice: UiText = {
      ...CARD,
      lines: [{ text: '1.2k', tag: 'tooltip', holds: 'price' }],
    }
    const reading = readUiBudget({ ...CLEAN, texts: [tooltipPrice] })
    expect(reading.hardProblems).toEqual([
      'bay.card: the price line "1.2k" is in the tooltip; it stays on the element',
    ])
    expect(reading.breaches).toEqual([])
  })

  it('fails an element id no panel owns', () => {
    const bayOnly = PANELS.slice(0, 1)
    const sources = { ...CLEAN, panels: bayOnly, fixtures: CLEAN.fixtures.slice(0, 1) }
    const stray = { ...CARD, id: 'pause.card' }
    expect(readUiBudget({ ...sources, texts: [stray] }).hardProblems).toEqual([
      'pause.card: no panel owns this element id',
    ])
  })
})

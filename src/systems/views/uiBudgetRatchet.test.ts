import { describe, expect, it } from 'vitest'
import type { UiBudgetAllowance, UiBudgetPanel } from '../../constants/uiBudgetAllowlist'
import { ratchetProblemsOf } from './uiBudgetRatchet'
import type { UiBudgetMeasure } from './uiBudgetReading'

// TD ruling on #424: the allowlist only shrinks, and every entry holds exactly what it measures.

const PANELS: readonly UiBudgetPanel[] = [
  { id: 'hud', sourcePrefixes: ['src/ui/hud/'], textIdPrefixes: ['hud.'] },
  { id: 'rest', sourcePrefixes: ['src/ui/'], textIdPrefixes: [''] },
]

const CLEAN_COUNTS = { title: 0, oneLine: 0, tooltip: 0, unregistered: 0, scroll: 0 }

const measureOf = (panel: string, counts: Partial<UiBudgetMeasure['counts']>): UiBudgetMeasure => ({
  panel,
  counts: { ...CLEAN_COUNTS, ...counts },
})

const HUD_OVER = measureOf('hud', { unregistered: 12, scroll: 1 })
const HUD_ENTRY: UiBudgetAllowance = {
  panel: 'hud',
  counts: { unregistered: 12, scroll: 1 },
  ticket: 428,
}
const REST_CLEAN = measureOf('rest', {})

describe('ui budget ratchet', () => {
  it('passes an over-budget panel whose entry holds exactly what it measures', () => {
    expect(ratchetProblemsOf([HUD_OVER, REST_CLEAN], [HUD_ENTRY], PANELS)).toEqual([])
  })

  it('fails an over-budget panel with no entry', () => {
    expect(ratchetProblemsOf([HUD_OVER, REST_CLEAN], [], PANELS)).toEqual([
      'hud unregistered: 12 over budget with no allowlist entry',
      'hud scroll: 1 over budget with no allowlist entry',
    ])
  })

  it('fails a rule the entry does not cover', () => {
    const over = measureOf('hud', { unregistered: 12, scroll: 1, title: 2 })
    expect(ratchetProblemsOf([over], [HUD_ENTRY], PANELS)).toEqual([
      'hud title: 2 over budget with no allowlist entry',
    ])
  })

  it('fails a stale entry whose panel now measures clean', () => {
    expect(ratchetProblemsOf([measureOf('hud', {})], [HUD_ENTRY], PANELS)).toEqual([
      'hud measures within budget; delete its entry (#428)',
    ])
  })

  it('fails a rule that measures clean while the entry still lists it', () => {
    expect(
      ratchetProblemsOf([measureOf('hud', { unregistered: 12 })], [HUD_ENTRY], PANELS),
    ).toEqual(['hud scroll: measures clean; delete the rule from its entry'])
  })

  it('fails growth: the allowlist only shrinks', () => {
    const grown = measureOf('hud', { unregistered: 13, scroll: 1 })
    expect(ratchetProblemsOf([grown], [HUD_ENTRY], PANELS)).toEqual([
      'hud unregistered: grew from 12 to 13; it only shrinks',
    ])
  })

  it('fails a count that fell but is still over, so the entry stays exact', () => {
    const lower = measureOf('hud', { unregistered: 7, scroll: 1 })
    expect(ratchetProblemsOf([lower], [HUD_ENTRY], PANELS)).toEqual([
      'hud unregistered: fell from 12 to 7; lower the entry to 7',
    ])
  })

  it('fails an entry for an unknown panel and a second entry for one panel', () => {
    const stranger = { ...HUD_ENTRY, panel: 'dock' }
    expect(ratchetProblemsOf([HUD_OVER], [HUD_ENTRY, HUD_ENTRY, stranger], PANELS)).toEqual([
      'hud has two allowlist entries',
      'the allowlist names the unknown panel dock',
    ])
  })
})

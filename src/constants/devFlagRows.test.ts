import { describe, expect, it } from 'vitest'
import {
  CUT_OR_PACE_LABEL,
  DEV_FLAG_ROWS,
  ENEMY_CONTACT_LABEL,
  NO_PAIRING_RULE,
} from './devFlagRows'
import { ONE_LINE_WORDS_MAX, TITLE_WORDS_MAX } from './uiParts'
import { AUTHORITY_DEV_FLAGS, DEV_FLAGS } from './devFlags'

// The debug flag panel's metadata table (ticket 547, the TD ruling on #547 and its amendment
// item 7): one row per flag, so a flag added later reaches the panel by construction.

const CLIENT_IDS = Object.keys(DEV_FLAGS)
const AUTHORITY_IDS = Object.keys(AUTHORITY_DEV_FLAGS)
const rowOf = (id: string) => DEV_FLAG_ROWS.find((row) => row.id === id)

describe('dev flag rows', () => {
  it('has exactly one row for every client and authority flag, and none for anything else', () => {
    const ids = DEV_FLAG_ROWS.map((row) => row.id)
    expect([...ids].sort()).toEqual([...CLIENT_IDS, ...AUTHORITY_IDS].sort())
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('scopes each row by the flags object it lives in', () => {
    CLIENT_IDS.forEach((id) => expect(rowOf(id)?.scope).toBe('client'))
    AUTHORITY_IDS.forEach((id) => expect(rowOf(id)?.scope).toBe('authority'))
  })

  it('shows each flag at the value it ships with', () => {
    const shipped: Record<string, boolean> = { ...DEV_FLAGS, ...AUTHORITY_DEV_FLAGS }
    DEV_FLAG_ROWS.forEach((row) => expect(row.isOnByDefault).toBe(shipped[row.id]))
  })

  it('gives every row a meaning, an apply rule and a pairing rule or says it has none', () => {
    DEV_FLAG_ROWS.forEach((row) => {
      expect(row.meaning.length).toBeGreaterThan(0)
      expect(row.applyRule.length).toBeGreaterThan(0)
      expect(row.pairingRule.length).toBeGreaterThan(0)
    })
    expect(rowOf('heat.workUncapped')?.pairingRule).toBe(NO_PAIRING_RULE)
  })

  it('labels every flag that changes the cut cells or the pace, as HS (d) lists them', () => {
    const cutOrPace = [
      'drill.exactCarry',
      'drill.sweptCut',
      'drill.reportEveryTick',
      'heat.workUncapped',
      'enemy.lureRetarget',
    ]
    cutOrPace.forEach((id) => expect(rowOf(id)?.taintLabel).toBe(CUT_OR_PACE_LABEL))
  })

  it('marks the swept cut alone as experimental and says what the swept law charge needs', () => {
    const experimental = DEV_FLAG_ROWS.filter((row) => row.isExperimental).map((row) => row.id)
    expect(experimental).toEqual(['drill.sweptCut'])
    expect(rowOf('drill.sweptCut')?.pairingRule).toContain('#540 and #541')
    expect(rowOf('drill.sweptLawCharge')?.pairingRule).toContain('no effect without the swept path')
  })

  it('names each flag in at most four words over one short game-like sentence (ticket 549)', () => {
    DEV_FLAG_ROWS.forEach((row) => {
      expect(wordsOf(row.name)).toBeLessThanOrEqual(TITLE_WORDS_MAX)
      expect(wordsOf(row.line)).toBeLessThanOrEqual(ONE_LINE_WORDS_MAX)
      expect(row.line).toMatch(/^[^.]+\.$/)
    })
  })

  it('records the pairs the panel warns on, each naming a flag (VS 4)', () => {
    const ids: string[] = [...CLIENT_IDS, ...AUTHORITY_IDS]
    DEV_FLAG_ROWS.flatMap((row) => row.needsOn).forEach((id) => expect(ids).toContain(id))
    expect(rowOf('drill.reportEveryTick')?.needsOn).toEqual(['drill.exactCarry'])
    expect(rowOf('drill.sweptLawCharge')?.needsOn).toEqual(['drill.sweptCut'])
  })

  it('ships the nose contact off, labelled as changing enemy contact, until #565 (ticket 564)', () => {
    const row = rowOf('drill.noseContact')
    expect(row?.isOnByDefault).toBe(false)
    expect(row?.taintLabel).toBe(ENEMY_CONTACT_LABEL)
    expect(ENEMY_CONTACT_LABEL).toBe('Changes enemy contact; run is tainted.')
    expect(row?.pairingRule).toContain('#565')
    expect(row?.needsOn).toEqual(['drill.sweptCut'])
  })
})

function wordsOf(text: string): number {
  return text.split(/\s+/).length
}

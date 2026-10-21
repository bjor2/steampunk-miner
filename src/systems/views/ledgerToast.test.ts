import { describe, expect, it } from 'vitest'
import type { SaveMigration } from '../save/saveMigrations'
import { DESIGN_TOKENS } from './designSystem'
import { isLedgerToastDue, LEDGER_TOAST_TEXT } from './ledgerToast'

const V1_SAVE: readonly SaveMigration[] = [
  { version: 'generatorVersion', from: 12, to: 13 },
  { version: 'formatVersion', from: 1, to: 2 },
  { version: 'formatVersion', from: 2, to: 3 },
]

describe('ledger toast', () => {
  it('is due once a v1 save is migrated and the profile has not seen it', () => {
    expect(isLedgerToastDue(V1_SAVE, false)).toBe(true)
  })

  it('is never due again once the profile has seen it', () => {
    expect(isLedgerToastDue(V1_SAVE, true)).toBe(false)
  })

  it('is never due for a fresh save or one already in the slot layout', () => {
    expect(isLedgerToastDue([], false)).toBe(false)
    const slottedSave: SaveMigration[] = [
      { version: 'formatVersion', from: 2, to: 3 },
      { restoredSections: [{ section: 'ores' }] },
    ]
    expect(isLedgerToastDue(slottedSave, false)).toBe(false)
  })

  it('reads its copy from ui.saveMenu within the toast word budget', () => {
    expect(LEDGER_TOAST_TEXT).toBe('Old ledger restored.')
    const words = LEDGER_TOAST_TEXT.split(/\s+/).length
    expect(words).toBeLessThanOrEqual(DESIGN_TOKENS.copy.toastWordsMax)
  })
})

import { describe, expect, it } from 'vitest'
import { SAVE_FAILURE_CAUSES } from '../save/saveWriteFailure'
import { unsavedChipTextOf } from './unsavedChipText'
import { uiTextProblemsOf } from './uiTextBudget'

describe('unsaved chip text', () => {
  it('says progress is not saved and why, inside the text budget, for every cause', () => {
    for (const cause of SAVE_FAILURE_CAUSES) {
      const text = unsavedChipTextOf(cause)
      expect(text.title).toBe('Progress not saved')
      expect(uiTextProblemsOf({ ...text, lines: [] })).toEqual([])
    }
  })

  it('names a full storage apart from a blocked one', () => {
    expect(unsavedChipTextOf('quota').oneLine).toContain('full')
    expect(unsavedChipTextOf('security').oneLine).toContain('blocks')
  })
})

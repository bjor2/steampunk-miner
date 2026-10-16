import { describe, expect, it } from 'vitest'
import { saveFailureCauseOf } from './saveWriteFailure'

describe('save write failure', () => {
  it('names a full storage as quota, in the words each engine uses', () => {
    expect(saveFailureCauseOf(new DOMException('full', 'QuotaExceededError'))).toBe('quota')
    expect(saveFailureCauseOf({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe('quota')
  })

  it('names storage the page may not use as security', () => {
    expect(saveFailureCauseOf(new DOMException('denied', 'SecurityError'))).toBe('security')
  })

  it('names anything else other', () => {
    expect(saveFailureCauseOf(new Error('disk gone'))).toBe('other')
    expect(saveFailureCauseOf('a string')).toBe('other')
    expect(saveFailureCauseOf(null)).toBe('other')
  })
})

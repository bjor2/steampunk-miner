import { describe, expect, it } from 'vitest'
import { newerSaveTextOf, saveEpochOfText } from './newerSaveText'

const saveAt = (saveEpoch: number) => JSON.stringify({ formatVersion: 3, saveEpoch, tick: 9 })

describe('newer save text', () => {
  it('picks the copy with the larger saveEpoch, whichever store holds it', () => {
    expect(newerSaveTextOf(saveAt(4), saveAt(5))).toBe(saveAt(5))
    expect(newerSaveTextOf(saveAt(7), saveAt(5))).toBe(saveAt(7))
  })

  it('keeps the only copy when the other store holds none', () => {
    expect(newerSaveTextOf(null, saveAt(2))).toBe(saveAt(2))
    expect(newerSaveTextOf(saveAt(2), null)).toBe(saveAt(2))
    expect(newerSaveTextOf(null, null)).toBeNull()
  })

  it('prefers a readable copy over text whose epoch cannot be read', () => {
    expect(newerSaveTextOf('not json', saveAt(1))).toBe(saveAt(1))
    expect(newerSaveTextOf(saveAt(1), '{"saveEpoch":"9"}')).toBe(saveAt(1))
  })

  it('keeps the first copy on equal epochs', () => {
    const other = JSON.stringify({ saveEpoch: 3, tick: 1 })
    expect(newerSaveTextOf(saveAt(3), other)).toBe(saveAt(3))
  })

  it('reads the epoch off a save header, or null off anything else', () => {
    expect(saveEpochOfText(saveAt(12))).toBe(12)
    expect(saveEpochOfText('[1]')).toBeNull()
    expect(saveEpochOfText('{')).toBeNull()
  })
})

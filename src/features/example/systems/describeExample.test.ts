import { describe, expect, it } from 'vitest'
import { describeExample } from './describeExample'

describe('example slice', () => {
  it('describes itself by its slice id and the registrar methods it calls', () => {
    expect(describeExample()).toEqual({ sliceId: 'example', registers: ['debugActions'] })
  })
})

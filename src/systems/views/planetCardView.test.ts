import { describe, expect, it } from 'vitest'
import { fromCanonical } from '../money'
import { planetCardViewOf } from './planetCardView'

describe('planet card view', () => {
  it('prints each value as its amount on screen then its unit', () => {
    const view = planetCardViewOf({
      planetIndex: 41,
      lines: [
        {
          sourceId: 'fake-mix.toughness',
          tag: 'Tough',
          arrivalLine: 'The rock fights back.',
          gateKind: null,
          values: [
            { label: 'Toughness', amount: fromCanonical('1234567'), unit: '×' },
            { label: 'Shells', amount: 12, unit: '' },
          ],
        },
      ],
    })
    expect(view.lines[0].values).toEqual([
      { label: 'Toughness', text: '1.23M ×' },
      { label: 'Shells', text: '12' },
    ])
  })
})

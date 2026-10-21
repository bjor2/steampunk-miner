import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore } from '../../store/gameStore'
import { AmountText } from '../kit/AmountText'
import { ExactAmountSheetView } from './ExactAmountSheet'
import { EXACT_AMOUNT_IDS } from './exactAmountIds'

// Ticket 476: a phone has no hover, so a shortened money readout answers a tap with its exact
// amount. The tap itself is a store action (tapSheetSlice.test.ts); here, what each side draws.

const P200_WALLET = '-1.234567890123e+149'

beforeEach(() => resetGameStore())

describe('exact amount', () => {
  it('marks a readout whose short text hides digits as a tap target', () => {
    const markup = renderToString(
      createElement(AmountText, { text: '-1.23e149', exact: P200_WALLET }),
    )
    expect(markup).toContain('data-tap-exact')
    expect(markup).toContain('-1.23e149')
  })

  it('leaves a readout that shows its amount whole as plain text, so the tap reaches its control', () => {
    for (const exact of ['1.234e+3', '7.5e+1', undefined]) {
      const markup = renderToString(createElement(AmountText, { text: 'shown', exact }))
      expect(markup).toBe('shown')
    }
  })

  it('shows the short text and the whole canonical amount on the sheet', () => {
    const markup = renderToString(createElement(ExactAmountSheetView, { exact: P200_WALLET }))
    expect(markup).toContain(`data-testid="${EXACT_AMOUNT_IDS.sheet}"`)
    expect(markup).toContain('-1e149')
    expect(markup).toMatch(
      new RegExp(
        `data-testid="${EXACT_AMOUNT_IDS.text}"[^>]*>.*${P200_WALLET.replace(/[.+]/g, '\\$&')}`,
      ),
    )
  })
})

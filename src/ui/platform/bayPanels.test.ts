import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createScriptedSession } from '../../systems/authority/scriptedSession'
import { add, fromCanonical, type Money } from '../../systems/money'
import { grantMoneyCommand } from '../../systems/startScenarioCommands'
import { bayHeaderOf } from '../../systems/views/bayFrame'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { UI_IDS } from '../ids'
import { AboveBayLayer } from './AboveBayLayer'
import { BayHeader } from './BayHeader'
import { moneyCounterPointIn, trackMoneyCounter } from './moneyCounterAnchor'

// The sell burst's kernel seams (ticket 220): a `moneyCounter` provider, the bay header slot left
// of the money, and the layer above the bay screen. Fake slices register through withRegistrations.

const TAG_MARKUP = '<span data-testid="bay-probe-tag">Lining −12</span>'
const COIN_MARKUP = '<span data-testid="bay-probe-coin">coin</span>'

function LiningTagProbe() {
  return createElement('span', { 'data-testid': 'bay-probe-tag' }, 'Lining −12')
}

function CoinProbe() {
  return createElement('span', { 'data-testid': 'bay-probe-coin' }, 'coin')
}

const headerTagSlice: SliceDefinition = {
  id: 'bay-probe',
  register: (r) => r.bayPanel({ id: 'bay-probe.tag', slot: 'header', Panel: LiningTagProbe }),
}

const aboveBaySlice: SliceDefinition = {
  id: 'bay-probe',
  register: (r) => r.bayPanel({ id: 'bay-probe.coins', slot: 'above', Panel: CoinProbe }),
}

/** A roll still 250 short of the wallet, as the burst shows mid-flight. */
const rollingCounterSlice: SliceDefinition = {
  id: 'bay-probe',
  register: (r) =>
    r.moneyCounter({
      id: 'bay-probe.counter',
      useShownMoney: (wallet: Money) => add(wallet, fromCanonical('-250')),
    }),
}

function sellBayHeader() {
  const session = createScriptedSession()
  session.submit(1, grantMoneyCommand('1000'))
  return bayHeaderOf(session.state(), 'p1', 'sell')
}

function headerMarkupWith(slices: readonly SliceDefinition[]): string {
  const header = sellBayHeader()
  return withRegistrations(slices, () => renderToString(createElement(BayHeader, { header })))
}

function aboveBayMarkupWith(slices: readonly SliceDefinition[]): string {
  return withRegistrations(slices, () => renderToString(createElement(AboveBayLayer)))
}

const testIdAt = (html: string, id: string) => html.indexOf(`data-testid="${id}"`)

function fakeElementAt(left: number, top: number, width: number, height: number): Element {
  return { getBoundingClientRect: () => ({ left, top, width, height }) } as unknown as Element
}

describe('bay money counter', () => {
  it('shows the authority wallet with no provider, exactly as before the seam', () => {
    const html = headerMarkupWith([])
    expect(html).toContain(
      `<span data-testid="${UI_IDS.platformMoney}" data-exact="1e+3">1,000</span>`,
    )
  })

  it("shows the provider's rolled money, formatted once, and keeps the wallet as the exact value", () => {
    const html = headerMarkupWith([rollingCounterSlice])
    expect(html).toContain(
      `<span data-testid="${UI_IDS.platformMoney}" data-exact="1e+3" data-shown="7.5e+2">750</span>`,
    )
  })

  it('puts the counter centre in the pixels of the frame a slice draws in', () => {
    trackMoneyCounter(fakeElementAt(300, 40, 100, 20))
    expect(moneyCounterPointIn(fakeElementAt(50, 10, 1920, 1080))).toEqual({ x: 300, y: 40 })
  })

  it('has no counter point while no bay header shows', () => {
    trackMoneyCounter(null)
    expect(moneyCounterPointIn(fakeElementAt(0, 0, 1920, 1080))).toBeNull()
  })
})

describe('bay header slot', () => {
  it('draws a header panel just left of the money counter', () => {
    const html = headerMarkupWith([headerTagSlice])
    const tag = testIdAt(html, 'bay-probe-tag')
    expect(tag).toBeGreaterThan(html.indexOf('</strong>'))
    expect(tag).toBeLessThan(testIdAt(html, UI_IDS.platformMoney))
  })

  it('adds only the panel to the header', () => {
    expect(headerMarkupWith([headerTagSlice]).replace(TAG_MARKUP, '')).toBe(headerMarkupWith([]))
  })
})

describe('layer above the bay screen', () => {
  it('draws nothing while no above-bay panel is registered', () => {
    expect(aboveBayMarkupWith([])).toBe('')
    expect(aboveBayMarkupWith([headerTagSlice])).toBe('')
  })

  it('draws an above-bay panel inside one layer', () => {
    const html = aboveBayMarkupWith([aboveBaySlice])
    expect(html).toContain(COIN_MARKUP)
    expect(html.replace(COIN_MARKUP, '')).toMatch(/^<div[^>]*><\/div>$/)
  })
})

import { describe, expect, it } from 'vitest'
import { unregisteredTextsOf } from './unregisteredText'

// TD ruling on #424 Q1: text drawn outside the shared Title+OneLine element (or its tooltip
// plate) is an unregistered element, read from server-rendered markup.

describe('unregistered text', () => {
  it('finds nothing in markup drawn wholly by registered elements and their tooltips', () => {
    const markup =
      '<section><div><div data-ui-text="demo.card"><h3>Drill</h3><p>Cuts rock.</p></div>' +
      '<div role="tooltip" hidden="" data-tooltip="demo.card"><span>Lore.</span></div></div></section>'
    expect(unregisteredTextsOf(markup)).toEqual([])
  })

  it('counts each element holding text of its own outside them once', () => {
    const markup =
      '<div><h2>Hold</h2><p>Level <!-- -->3<!-- --> of 9</p><div data-ui-text="x"><b>ok</b></div></div>'
    expect(unregisteredTextsOf(markup)).toEqual(['<h2> Hold', '<p> Level'])
  })

  it('ignores whitespace, comments and void or self-closing elements', () => {
    const markup =
      '<div> <img src="a.png" alt=""/><br/><svg><path d="M0 0"/></svg><!-- note --></div>'
    expect(unregisteredTextsOf(markup)).toEqual([])
  })

  it('returns to the parent after a registered element closes', () => {
    const markup = '<div><div data-ui-text="x"><span>in</span></div><span>out</span></div>'
    expect(unregisteredTextsOf(markup)).toEqual(['<span> out'])
  })

  it('counts a bare text with no element around it', () => {
    expect(unregisteredTextsOf('Sell')).toEqual(['<#root> Sell'])
  })
})

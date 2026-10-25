import { describe, expect, it } from 'vitest'
import { brassCropFindingsOf, NO_BRASS_CROP_FINDINGS } from './brassCrop'

describe('brass crop check (ticket 885)', () => {
  it('passes kit controls and figures inside icon-plus-value facts', () => {
    const markup =
      '<section data-frame="sheet"><h2>Core drive engaged</h2>' +
      '<p><span data-fact=""><span aria-hidden="true"><img src="/a.svg" alt=""/></span>1.25 g</span></p>' +
      '<button type="button" data-kit-control="">Skip</button></section>'
    expect(brassCropFindingsOf(markup)).toEqual(NO_BRASS_CROP_FINDINGS)
  })

  it('finds a control drawn without the kit', () => {
    const findings = brassCropFindingsOf('<div><button type="button">Skip</button></div>')
    expect(findings.defaultControls).toEqual(['<button type="button">'])
  })

  it('finds a role button drawn without the kit', () => {
    const findings = brassCropFindingsOf('<div role="button" tabindex="0">Take</div>')
    expect(findings.defaultControls).toHaveLength(1)
  })

  it('finds a figure outside a fact', () => {
    const findings = brassCropFindingsOf('<p>Leaving planet <!-- -->1<!-- --> for planet 2.</p>')
    expect(findings.bareNumbers).toEqual(['1', 'for planet 2.'])
  })

  it('does not judge a shut tooltip plate or the digits in attributes', () => {
    const markup =
      '<div data-testid="artefact-card-3"><div role="tooltip" hidden="">Leaving Ashholt 2.</div></div>'
    expect(brassCropFindingsOf(markup)).toEqual(NO_BRASS_CROP_FINDINGS)
  })
})

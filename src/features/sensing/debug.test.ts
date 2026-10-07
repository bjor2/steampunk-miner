import { beforeEach, describe, expect, it } from 'vitest'
import { sensingDebugActions } from './debug'
import { resetSensingStore } from './store/sensingStore'

describe('sensing debug reads', () => {
  beforeEach(resetSensingStore)

  it('reports an empty board, no passive owned and no layer drawn on a fresh client', () => {
    expect(sensingDebugActions.getReveals()).toEqual({
      ok: true,
      marks: 0,
      marksByKind: {},
      pins: [],
      periscope: null,
      lens: null,
      barometer: null,
      drawnQuads: null,
    })
  })

  it('previews an item card’s raw lines at a Mark', () => {
    expect(sensingDebugActions.statPreview('passive.hazard_barometer', 6, 8)).toMatchObject({
      ok: true,
      preview: { lines: [{ stat: 'lookahead', value: 10 }] },
    })
  })
})

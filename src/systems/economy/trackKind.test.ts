import { describe, expect, it } from 'vitest'
import { UPGRADE_IDS } from './economyDefinition'
import { trackKindOf } from './trackKind'

describe('track kind', () => {
  it("names each track's growth by its curve family in the economy", () => {
    const kinds = Object.fromEntries(UPGRADE_IDS.map((id) => [id, trackKindOf(id)]))
    expect(kinds).toEqual({
      drill_power: 'geometric',
      drill_tip: 'geometric',
      engine: 'saturating',
      boiler: 'linearInt',
      cargo_hold: 'linearInt',
      hull: 'geometric',
    })
  })
})

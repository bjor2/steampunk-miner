import { describe, expect, it } from 'vitest'
import { ORE_RULES_VERSION, planetParamsFor } from '../../../systems/world/planetParams'
import { oreMixOf } from '../../planet-mix'
import { gateTableOfPlanet } from './cellGates'
import { gateTableOf } from './gateTable'

describe('cell gates', () => {
  it("keeps a legacy and a stamped planet's gate tables apart (ticket 445)", () => {
    const legacy = planetParamsFor(83921, 12)
    const stamped = planetParamsFor(83921, 12, ORE_RULES_VERSION)
    expect(gateTableOfPlanet(legacy)).toEqual(gateTableOf(oreMixOf(legacy)))
    expect(gateTableOfPlanet(stamped)).toEqual(gateTableOf(oreMixOf(stamped)))
    expect(gateTableOfPlanet(stamped)).not.toEqual(gateTableOfPlanet(legacy))
  })
})

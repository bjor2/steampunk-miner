import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import { toCanonicalJson } from '../../../systems/authority/canonicalJson'
import { oreTier } from '../../../systems/economy/oreEconomy'
import { oreIndexTag, oreTypeOf } from '../../../systems/registries/oreTypes'
import { RESOURCE_FAMILY } from '../../../systems/world/worldCell'
import { slice as CODEX } from '../register'
import {
  CODEX_SECTION,
  oreDiscoveriesOf,
  withOreDiscoveries,
  type CodexSection,
} from './codexSection'
import { recordOreTouches, type OreTouch } from './oreRecords'

// The #178 VS budget, checked with the pre-#146 kernel index (#207 TD lock, size gate (a)): a
// player who has mined every ore type of planets 1 to 600 carries a codex of at most 4 KB.

const LAST_PLANET = 600
const BUDGET_BYTES = 4096
const ORE_BANDS = [1, 2, 3, 4, 5]
const FAMILIES = [RESOURCE_FAMILY.metal, RESOURCE_FAMILY.crystal]

function minedTouchesOnPlanet(planetIndex: number): OreTouch[] {
  return ORE_BANDS.flatMap((band) =>
    FAMILIES.map((cellFamily) => ({
      ore: oreTypeOf({ tier: oreTier(planetIndex, band), cellFamily }),
      via: 'cargo' as const,
      isMined: true,
    })),
  )
}

/** Planet after planet, as a player records them: one write per planet. */
function codexAfterEveryPlanet(): CodexSection {
  let section: CodexSection = CODEX_SECTION.initial
  for (let planet = 1; planet <= LAST_PLANET; planet += 1) {
    const ore = oreDiscoveriesOf(section, oreIndexTag())
    section = withOreDiscoveries(section, recordOreTouches(ore, minedTouchesOnPlanet(planet)).ore)
  }
  return section
}

describe('codex size', () => {
  it('stays within 4 KB in the snapshot after every ore type of planets 1 to 600', () => {
    const portable = withRegistrations([CODEX], () => {
      const section = codexAfterEveryPlanet()
      return { version: CODEX_SECTION.version, body: CODEX_SECTION.toPortable(section) }
    })
    const bytes = new TextEncoder().encode(toCanonicalJson(portable)).length
    expect(bytes).toBeLessThanOrEqual(BUDGET_BYTES)
  })
})

import { describe, expect, it } from 'vitest'
import { GENERATED_POOLS_ORE_RULES, ORE_RULES_VERSION } from '../world/planetParams'
import type { DomainEvent } from './domainEvent'
import { createScriptedSession } from './scriptedSession'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { travelStampProblems } from './unknownOreRules'

// Ticket 890 (the TD's rows and HS 5 and 6 on #890): a client renders a planet by its stamped ore
// rules, so a join snapshot or a travel event stamped with rules the client does not know is refused
// with "update required" and nothing is re-picked. This build knows rules 15; the next rules stand
// in for the 15 a rules-14 client would be sent.

const NEWER = ORE_RULES_VERSION + 1

function entered(oreRulesVersion?: number): DomainEvent {
  return {
    tick: 3,
    type: 'PlanetEntered',
    planetSeed: 7,
    generatorVersion: 18,
    radius: 300,
    ...(oreRulesVersion === undefined ? {} : { oreRulesVersion }),
  }
}

function generated(oreRulesVersion?: number): DomainEvent {
  return {
    tick: 3,
    type: 'PlanetGenerated',
    system: '1',
    place: '8',
    campaignIndex: '8',
    ...(oreRulesVersion === undefined ? {} : { oreRulesVersion }),
  }
}

describe('unknown ore rules', () => {
  it('refuses a join snapshot stamped with ore rules this build does not know, restoring nothing', () => {
    const session = createScriptedSession()
    session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: 8 } })
    const snapshot = JSON.parse(JSON.stringify(takeSnapshot(session.state())))
    snapshot.state.planet.oreRulesVersion = NEWER
    const joined = readSnapshot(snapshot)
    expect(joined).not.toHaveProperty('state')
    expect(joined.problems).toEqual([
      'snapshot.state.planet.oreRulesVersion is not ore rules this build knows: update required',
    ])
  })

  it('refuses a PlanetEntered or PlanetGenerated stamped with ore rules this build does not know', () => {
    expect(travelStampProblems(entered(NEWER))).toEqual([
      'PlanetEntered.oreRulesVersion is not ore rules this build knows: update required',
    ])
    expect(travelStampProblems(generated(NEWER))).toEqual([
      'PlanetGenerated.oreRulesVersion is not ore rules this build knows: update required',
    ])
  })

  it('takes a travel event stamped 14 or 15 or with no stamp, and passes every other event', () => {
    for (const stamp of [GENERATED_POOLS_ORE_RULES, ORE_RULES_VERSION, undefined]) {
      expect(travelStampProblems(entered(stamp))).toEqual([])
      expect(travelStampProblems(generated(stamp))).toEqual([])
    }
    expect(travelStampProblems({ tick: 3, type: 'PlanetUnlocked', planetIndex: 9 })).toEqual([])
  })
})

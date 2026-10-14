import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import { toCanonical } from '../money'
import { bayEntryRowsOf } from '../views/bayEntryRows'
import { liningRowOf } from '../views/liningRow'
import type { CommandIntent } from './authorityCommand'
import { featurePricePlanetOf, isFeatureForSale } from './featureSales'
import { isFeatureUnlocked } from './featureUnlocks'
import { gunBuyRefusal, nextGunPriceOf } from './gunRules'
import { liningBuyRefusal, liningPriceOf } from './liningRules'
import { createScriptedSession, type ScriptedSession } from './scriptedSession'

// Bjor's price-only ruling on #411: a purchase anchored on a schedule row is for sale on every
// planet once the row ships, priced at the row's planet. The Upgrade bay's guns, lining and slice
// entries answer a player on planet 1 exactly as one on planet 30: same refusal, same price.

const FAR_PLANET = 30

function dockedOn(planetIndex: number): ScriptedSession {
  const session = createScriptedSession()
  const setup: CommandIntent[] = [
    { type: 'debug.setPlanet', payload: { planetIndex } },
    { type: 'debug.grantMoney', payload: { amount: '1e30' } },
    { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } },
  ]
  setup.forEach((intent) => session.submit(0, intent))
  return session
}

describe('feature sales: the price is the only gate (#411)', () => {
  it('sells a shipped planet row on planet 1 before travel opens it', () => {
    const state = dockedOn(1).state()
    expect(isFeatureUnlocked(state, 'auto_guns')).toBe(false)
    expect(isFeatureForSale(state, 'auto_guns')).toBe(true)
    expect(featurePricePlanetOf('auto_guns')).toBe(4)
  })

  it('never sells a vision row, a held item, on any planet', () => {
    for (const planetIndex of [1, 17, 60]) {
      expect(isFeatureForSale(dockedOn(planetIndex).state(), 'insulated_lining')).toBe(false)
    }
  })

  it('sells a facility row only while a building stands for it', () => {
    const state = dockedOn(1).state()
    expect(isFeatureForSale(state, 'research_lab')).toBe(true)
    expect(withRegistrations([], () => isFeatureForSale(state, 'research_lab'))).toBe(false)
  })

  it('answers the guns alike on planet 1 and planet 30, the mount at its planet 4 price', () => {
    const answerOn = (session: ScriptedSession) => ({
      refusal: gunBuyRefusal(session.state(), 'p1', 0),
      price: toCanonical(nextGunPriceOf(session.state(), 'p1')),
    })
    expect(answerOn(dockedOn(1))).toEqual(answerOn(dockedOn(FAR_PLANET)))
    expect(answerOn(dockedOn(1)).refusal).toBeNull()
  })

  it('answers refractory lining alike on planet 1 and planet 30, at its planet 8 price', () => {
    const answerOn = (session: ScriptedSession) => ({
      refusal: liningBuyRefusal(session.state(), 'p1', 'refractory'),
      row: liningRowOf(session.state(), 'p1'),
    })
    expect(answerOn(dockedOn(1))).toEqual(answerOn(dockedOn(FAR_PLANET)))
    expect(answerOn(dockedOn(1)).refusal).toBeNull()
    expect(toCanonical(liningPriceOf('refractory'))).toBe(answerOn(dockedOn(1)).row?.cost.exact)
  })

  it("lists the slices' bay entries alike on planet 1 and planet 30", () => {
    const entriesOn = (session: ScriptedSession) => bayEntryRowsOf(session.state(), 'p1')
    expect(entriesOn(dockedOn(1)).length).toBeGreaterThan(0)
    expect(entriesOn(dockedOn(1))).toEqual(entriesOn(dockedOn(FAR_PLANET)))
  })
})

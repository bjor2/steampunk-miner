import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../constants/physics'
import { createAuthorityState, type AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { oreSalePrice } from '../systems/economy/oreEconomy'
import { toCanonical } from '../systems/money'
import { emptyGemHaulTally, gemHaulLinesOf, tallyGemHaulStep } from './gemHaulPace'

// The purchases after a planet's first gem haul (ticket 741, the HS's P3 check on #741): only a unit
// worth a gem starts the count, and only purchases from it to the core are counted.

const SEED = 83921
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
/** P3's dearest other ore: a band-5 mythic with a signature's +1 sells under its cheapest gem, 20. */
const P3_TOP_PLAIN_TIER = 16
const P3_CHEAPEST_GEM_TIER = 20

function p3At(tick: number): AuthorityState {
  return { ...createAuthorityState({ planetIndex: 3, planetSeed: SEED, playerIds: ['p1'] }), tick }
}

function unitWorth(tier: number): DomainEvent {
  return { type: 'CargoAdded', amount: 1, value: toCanonical(oreSalePrice(tier)) } as DomainEvent
}

function bought(upgradeId: string, isMajor: boolean): DomainEvent {
  return { type: 'UpgradePurchased', upgradeId, isMajor } as DomainEvent
}

describe('gem haul pace', () => {
  it('counts the drill and tip majors bought after the first gem unit until the core', () => {
    const tally = emptyGemHaulTally()
    tallyGemHaulStep(tally, p3At(0), [unitWorth(P3_TOP_PLAIN_TIER), bought('drill_power', true)])
    tallyGemHaulStep(tally, p3At(2 * TICKS_PER_MINUTE), [unitWorth(P3_CHEAPEST_GEM_TIER)])
    tallyGemHaulStep(tally, p3At(3 * TICKS_PER_MINUTE), [
      bought('drill_power', true),
      bought('drill_tip', false),
      bought('drill_tip', true),
      bought('cargo_hold', true),
    ])
    tallyGemHaulStep(tally, p3At(8 * TICKS_PER_MINUTE), [
      { type: 'CoreCompleted', durationTicks: 1 } as DomainEvent,
    ])
    tallyGemHaulStep(tally, p3At(9 * TICKS_PER_MINUTE), [bought('drill_power', true)])
    expect(tally.planets.get(3)).toMatchObject({
      firstGemTick: 2 * TICKS_PER_MINUTE,
      coreTick: 8 * TICKS_PER_MINUTE,
      drillTipMajorsAfter: 2,
      purchasesAfter: 4,
    })
    expect(gemHaulLinesOf([{ worldSeed: SEED, gemHaul: tally }], 3)).toEqual([
      `seed ${SEED} P3: first gem at minute 2.0 of the planet, 2 drill + tip majors and 4 purchases in the 6.0 minutes from it to the core`,
    ])
  })

  it('says when a planet held no gem before its core, or was never reached', () => {
    const tally = emptyGemHaulTally()
    tallyGemHaulStep(tally, p3At(0), [unitWorth(P3_TOP_PLAIN_TIER)])
    expect(gemHaulLinesOf([{ worldSeed: SEED, gemHaul: tally }], 3)).toEqual([
      `seed ${SEED} P3: no gem before the core`,
    ])
    expect(gemHaulLinesOf([{ worldSeed: SEED, gemHaul: tally }], 4)).toEqual([
      `seed ${SEED}: never reached`,
    ])
  })
})

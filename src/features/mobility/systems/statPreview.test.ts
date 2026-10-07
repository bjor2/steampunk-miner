import { describe, expect, it } from 'vitest'
import { bandOrePrice, bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { fromSafeInteger, toCanonical, type Money } from '../../../systems/money'
import { isMasteredAt, lastMarkOf, markStepOf } from '../../tech-tree'
import { MOBILITY_ITEM } from './itemIds'
import { MOBILITY_ECONOMY } from './mobilityEconomy'
import { MARK_LADDERS } from './markLadders'
import { statPreview } from './statPreview'

// statPreview and the Mark rotation for the mobility items (#162 sections 4.1 and 4.6, the #165
// rotation): Marks step cooldown, then magnitude, then charges, and end in Mastered.

const canonical = (value: Money) => toCanonical(value)
const linesOf = (itemId: string, mark: number, planet: number) =>
  statPreview(itemId, mark, planet).map(({ label, value }) => [label, canonical(value)])

describe('mobility stat preview', () => {
  it('reads the grapple at Mark 1 as #162 4.2 lists it, priced at its unlock planet', () => {
    const price = bandOrePriceAt(MOBILITY_ECONOMY.prices.oneOff, 3, 3)
    expect(linesOf(MOBILITY_ITEM.grappleWinch, 1, 8)).toEqual([
      ['Cooldown (s)', canonical(fromSafeInteger(2))],
      ['Reach (tiles)', canonical(fromSafeInteger(8))],
      ['Charges', canonical(fromSafeInteger(4))],
      ['Price', canonical(price)],
    ])
  })

  it('prices a consumable unit on the planet it is bought on', () => {
    const lines = statPreview(MOBILITY_ITEM.rivetPatch, 1, 20)
    expect(lines.map((line) => line.label)).toEqual([
      'Hull plated (% of max)',
      'Stack',
      'Price per unit',
    ])
    expect(canonical(lines[0].value)).toBe(canonical(fromSafeInteger(25)))
    expect(canonical(lines[2].value)).toBe(
      canonical(bandOrePrice(MOBILITY_ECONOMY.prices.consumableUnit, 20)),
    )
  })

  it('shows a toggle draw as a percent of the tank a second', () => {
    const [draw] = statPreview(MOBILITY_ITEM.buoyancyTanks, 1, 34)
    expect(draw.label).toBe('Energy draw (% of tank a second)')
    expect(canonical(draw.value)).toBe('1.5e+0')
  })

  it('answers nothing for an id the lane does not own', () => {
    expect(statPreview('power.echo_sounder', 1, 2)).toEqual([])
  })
})

describe('mobility Mark ladders', () => {
  it.each(Object.entries(MARK_LADDERS))(
    '%s steps cooldown, then magnitude, then charges, and ends Mastered',
    (_itemId, ladder) => {
      const last = lastMarkOf(ladder)
      const stepped = Array.from({ length: last - 1 }, (_, index) => markStepOf(ladder, index + 2))
      const rotation = ['cooldown', 'magnitude', 'charges'].filter((stat) => stat in ladder)
      const firstRound = stepped.slice(0, rotation.length).map((step) => step.stepped)
      expect(firstRound).toEqual(rotation.slice(0, firstRound.length))
      expect(isMasteredAt(ladder, last)).toBe(true)
      expect(last === 1 || !isMasteredAt(ladder, last - 1)).toBe(true)
    },
  )

  it('masters the steam shield with its cooldown floored, window capped and three charges more', () => {
    const ladder = MARK_LADDERS[MOBILITY_ITEM.steamShield]
    const mastered = markStepOf(ladder, lastMarkOf(ladder)).stats
    expect(mastered).toEqual({ cooldown: 450, magnitude: 240, charges: 5 })
  })
})

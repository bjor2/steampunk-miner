import { describe, expect, it } from 'vitest'
import {
  heldCountOf,
  kitBuyRefusalOf,
  NO_KIT_HOLDINGS,
  spendConsumable,
  unitsHeldOf,
  withConsumableBought,
  withKitToolOwned,
  type KitHoldings,
} from './kitHoldings'
import { kitHoldingsProblems } from './kitHoldingsSection'

// What a player owns of the planet kits (ticket 850): tools for good, consumables in stacks pinned
// to the g they were bought at, every count a bigint written as decimal text.

const FLASK = { id: 'damp_flask', stackLimit: 3 }
const PLOUGH = { id: 'scree_plough', stackLimit: null }

describe('kit holdings (ticket 850)', () => {
  it('keeps a consumable bought on two planets as one stack per g, lowest g first', () => {
    const held = [3n, 1n, 3n].reduce(
      (holdings, g) => withConsumableBought(holdings, 'damp_flask', g),
      NO_KIT_HOLDINGS,
    )
    expect(held.stacks).toEqual([
      { itemId: 'damp_flask', g: '1', count: '1' },
      { itemId: 'damp_flask', g: '3', count: '2' },
    ])
    expect(heldCountOf(held, 'damp_flask')).toBe(3n)
  })

  it('spends the unit of the lowest g first and drops an emptied stack', () => {
    const held = withConsumableBought(
      withConsumableBought(NO_KIT_HOLDINGS, 'damp_flask', 6n),
      'damp_flask',
      2n,
    )
    const spent = spendConsumable(held, 'damp_flask')!
    expect(spent.boughtAt).toBe(2n)
    expect(spent.holdings.stacks).toEqual([{ itemId: 'damp_flask', g: '6', count: '1' }])
    expect(spendConsumable(NO_KIT_HOLDINGS, 'damp_flask')).toBeNull()
  })

  it('pins a g past every safe integer and counts past one, exactly', () => {
    const g = 10n ** 30n + 7n
    const holdings: KitHoldings = {
      tools: [],
      stacks: [{ itemId: 'damp_flask', g: g.toString(), count: '9007199254740993' }],
    }
    const more = withConsumableBought(holdings, 'damp_flask', g)
    expect(more.stacks).toEqual([
      { itemId: 'damp_flask', g: '1000000000000000000000000000007', count: '9007199254740994' },
    ])
    expect(kitHoldingsProblems(more)).toEqual([])
  })

  it('owns a tool once and refuses a second, and refuses a consumable at its carry limit', () => {
    const owned = withKitToolOwned(NO_KIT_HOLDINGS, 'scree_plough')
    expect(withKitToolOwned(owned, 'scree_plough')).toBe(owned)
    expect(unitsHeldOf(owned, PLOUGH)).toBe(1n)
    expect(kitBuyRefusalOf(NO_KIT_HOLDINGS, PLOUGH)).toBeNull()
    expect(kitBuyRefusalOf(owned, PLOUGH)).toBe('kit_tool_owned')
    const full = [1n, 1n, 1n].reduce(
      (holdings, g) => withConsumableBought(holdings, FLASK.id, g),
      owned,
    )
    expect(kitBuyRefusalOf(full, FLASK)).toBe('stack_full')
  })

  it('refuses a saved holding out of order, with a bad count or an unknown field', () => {
    expect(
      kitHoldingsProblems({
        tools: ['vent_vane', 'scree_plough'],
        stacks: [
          { itemId: 'damp_flask', g: '3', count: '0' },
          { itemId: 'cache_crate', g: '01', count: '1', extra: true },
        ],
      }),
    ).toEqual([
      'kit holdings.tools must be in id order, each once',
      'kit holdings.stacks[0].count must be decimal text from 1',
      'kit holdings.stacks[1].g must be index text from 1',
      'kit holdings.stacks[1].extra is not a field',
    ])
  })
})
